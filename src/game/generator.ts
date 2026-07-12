/**
 * The level baker. BUILD-TIME ONLY — the app never imports this.
 *
 * A board of randomly strewn arrows is essentially never solvable, so this never
 * places arrows and hopes. It builds each board BACKWARDS, in reverse escape order:
 *
 *   An arrow is only ever placed where its exit lane is already clear of every arrow
 *   placed before it.
 *
 * So if arrow k went down with a lane clear of arrows 1..k-1, then removing arrows in
 * reverse placement order always works: when k's turn comes, only 1..k-1 are left, and
 * k's lane is clear of exactly those. Reversing the placement order is therefore a
 * solution BY CONSTRUCTION — no solver, no backtracking, and the solution comes free,
 * which is also what makes hints free.
 *
 * Difficulty is then aimed at rather than hoped for. See `targetFreeRatio`.
 */

import { DIRECTIONS, cellKey, directionBetween, inBounds, isSelfBlocking, step, validateShape } from './geometry'
import type { Rng } from './rng'
import { freeArrows, occupancy, replaySolution } from './rules'
import type { Arrow, Board, Cell, Direction } from './types'

export interface TierConfig {
  readonly rows: number
  readonly cols: number
  /** How many arrows to lay down before the tightening pass begins. */
  readonly arrows: number
  /**
   * A ceiling for the tightening pass (see `tighten`). Arrows between `arrows` and this
   * number are added ONLY where they block something that is still free.
   */
  readonly maxArrows: number
  readonly minLength: number
  readonly maxLength: number
  readonly maxBends: number
  /**
   * The difficulty dial: what fraction of arrows may be tapped on turn one.
   *
   * This — not the arrow count — is what makes a board hard. A big board where
   * everything is already free is easier than a small one where a single arrow can
   * move and the rest must unwind from it.
   */
  readonly targetFreeRatio: number
}

export interface GeneratedBoard {
  readonly arrows: readonly Arrow[]
  /** Reverse placement order: a guaranteed-good escape sequence. */
  readonly solution: readonly string[]
  readonly freeRatio: number
}

const WALKS_PER_PLACEMENT = 72
const BOARD_ATTEMPTS = 20

/**
 * The tightening pass gets a bigger search than the main loop. It is hunting for a shape
 * that fits one specific leftover gap AND blocks something, on a board that is nearly
 * full — a much narrower target than "somewhere legal to put an arrow".
 */
const TIGHTEN_WALKS = 160

/**
 * Grows one random self-avoiding walk from a known-empty cell.
 *
 * Starting from a cell drawn out of the empty list — rather than drawing at random and
 * discarding when it lands on something — is what keeps the sampler alive on a crowded
 * board. Late placements on the tricky tier have very few legal homes left, and a
 * rejection sampler simply starves there.
 */
function growWalk(
  cfg: TierConfig,
  empty: readonly Cell[],
  taken: ReadonlySet<string>,
  rng: Rng,
  minLength: number = cfg.minLength,
  maxLength: number = cfg.maxLength,
): Cell[] {
  const start = rng.pick(empty)
  const targetLength = minLength + rng.int(maxLength - minLength + 1)

  const body: Cell[] = [start]
  const used = new Set<string>([cellKey(start)])
  let heading: Direction = rng.pick(DIRECTIONS)
  let bends = 0

  while (body.length < targetLength) {
    const current = body[body.length - 1]!
    // Straight on is the default; a bend is a deliberate, budgeted choice.
    const options: Direction[] = bends < cfg.maxBends ? rng.shuffle(DIRECTIONS) : [heading]

    const nextDir = options.find((dir) => {
      const cell = step(current, dir)
      return inBounds(cfg.rows, cfg.cols, cell) && !taken.has(cellKey(cell)) && !used.has(cellKey(cell))
    })
    if (!nextDir) break // boxed in; the shorter body we already have is a fine arrow

    if (body.length >= 2 && nextDir !== heading) bends++
    heading = nextDir
    const cell = step(current, nextDir)
    body.push(cell)
    used.add(cellKey(cell))
  }

  return body
}

/**
 * The arrows a single walk could become.
 *
 * A walk has two ends, and either can be the head — so every walk yields two candidate
 * arrows pointing opposite ways, and we let legality choose between them. A one-cell
 * walk has no segment to inherit a direction from, so it yields all four.
 *
 * This matters more than it looks: it roughly doubles the yield per walk, and on a
 * crowded board it is often the case that one end of a walk has a hopelessly blocked
 * lane while the other end faces a clear run to the edge.
 */
function arrowsFromWalk(walk: Cell[], id: string): Arrow[] {
  if (walk.length === 1) {
    return DIRECTIONS.map((dir) => ({ id, body: walk, dir }))
  }

  const reversed = [...walk].reverse()
  return [
    { id, body: walk, dir: directionBetween(walk[walk.length - 2]!, walk[walk.length - 1]!)! },
    { id, body: reversed, dir: directionBetween(reversed[reversed.length - 2]!, reversed[reversed.length - 1]!)! },
  ]
}

function laneCells(rows: number, cols: number, arrow: Arrow): Cell[] {
  const cells: Cell[] = []
  let cursor = step(arrow.body[arrow.body.length - 1]!, arrow.dir)
  while (inBounds(rows, cols, cursor)) {
    cells.push(cursor)
    cursor = step(cursor, arrow.dir)
  }
  return cells
}

/**
 * A snapshot of everything a placement decision needs, computed once per placement
 * rather than once per candidate. Scoring 80 candidates used to re-derive all of this
 * 80 times over, which is what made baking a 100-level campaign take minutes.
 */
interface PlacementContext {
  readonly occupied: ReadonlySet<string>
  readonly empty: readonly Cell[]
  /** Exit lanes of the arrows that are currently free, as cell-key sets. */
  readonly freeLanes: readonly ReadonlySet<string>[]
}

function contextFor(board: Board): PlacementContext {
  const cells = occupancy(board)
  const occupied = new Set(cells.keys())

  const empty: Cell[] = []
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      if (!occupied.has(cellKey({ row, col }))) empty.push({ row, col })
    }
  }

  const freeLanes = freeArrows(board).map(
    (arrow) => new Set(laneCells(board.rows, board.cols, arrow).map(cellKey)),
  )

  return { occupied, empty, freeLanes }
}

/**
 * Legal means: the lane is clear of everything already placed (which is what makes
 * reverse order a solution), the arrow does not block itself, and it is not degenerate.
 *
 * Degenerate = the head sits on the rim pointing outward, so the lane has zero cells and
 * NOTHING CAN EVER BLOCK IT. Free on turn one, free forever, no matter how the board is
 * tuned. Those arrows are what flattened the difficulty curve in the sibling project;
 * they are refused here from the start.
 */
function isLegal(cfg: TierConfig, ctx: PlacementContext, arrow: Arrow, allowDegenerate: boolean): boolean {
  if (isSelfBlocking(cfg.rows, cfg.cols, arrow)) return false

  const lane = laneCells(cfg.rows, cfg.cols, arrow)
  if (lane.length === 0 && !allowDegenerate) return false

  return lane.every((cell) => !ctx.occupied.has(cellKey(cell)))
}

/**
 * How much harder does this candidate make the board? Two terms, and the second one is
 * the one that is easy to forget and expensive to omit.
 *
 * TANGLE — how many currently-free arrows this body would block. Long bodies are what
 * make this possible: a body can be routed deliberately ACROSS the lanes of arrows
 * already placed. Blocking an earlier-placed arrow is exactly what a later-removed arrow
 * is for. Only currently-free arrows count; blocking an already-blocked one changes
 * nothing about how the board plays.
 *
 * BLOCKABILITY — how many empty cells sit in the candidate's OWN lane, i.e. how much room
 * a later arrow has to get in front of it. An arrow whose lane is short, or already full
 * of board edge, can never be blocked by anything placed after it, so it is free on turn
 * one and free forever. Tangle alone cannot see this, and without it the generator happily
 * fills the board with arrows nothing can ever block: the hard tier flatlined at 31% free
 * however hard the tangle bias was pushed, which is barely different from medium.
 */
/** How many currently-free arrows this body would block. */
function tangleOf(ctx: PlacementContext, arrow: Arrow): number {
  const bodyKeys = arrow.body.map(cellKey)
  return ctx.freeLanes.filter((lane) => bodyKeys.some((key) => lane.has(key))).length
}

function difficultyScore(ctx: PlacementContext, cfg: TierConfig, arrow: Arrow): number {
  const tangle = tangleOf(ctx, arrow)

  const lane = laneCells(cfg.rows, cfg.cols, arrow)
  const blockable = lane.filter((cell) => !ctx.occupied.has(cellKey(cell))).length

  // Blockability has sharply diminishing returns — a lane with room for one later arrow
  // is the whole difference; a lane with room for six is not six times better.
  return tangle + Math.min(blockable, 3) * 0.75
}

function isNonEmpty<T>(items: readonly T[]): items is readonly [T, ...T[]] {
  return items.length > 0
}

/** Highest-scoring item, scoring each item exactly once. */
function bestOf<T>(items: readonly [T, ...T[]], score: (item: T) => number): T {
  let best: T = items[0]
  let bestScore = score(best)

  for (let i = 1; i < items.length; i++) {
    const item = items[i] as T
    const value = score(item)
    if (value > bestScore) {
      best = item
      bestScore = value
    }
  }

  return best
}

/**
 * The arrow count is a TARGET, not a precondition.
 *
 * On a dense tier the board can genuinely run out of legal homes before the target is
 * reached — a late arrow needs both an empty body and a clear lane, and on a crowded
 * 12x12 those can simply not exist. Treating that as a failed attempt threw away a
 * perfectly good 27-arrow board because it wanted 30, and at high densities every
 * attempt failed that way, so nothing could be generated at all.
 *
 * So placement stops early when the board is full, and the board is kept as long as it
 * reached `MIN_FILL` of the target. A level with 27 arrows instead of 30 is a good level.
 * A level that does not exist is not.
 */
const MIN_FILL = 0.85

function buildBoard(cfg: TierConfig, rng: Rng, tangleBias: number): GeneratedBoard | null {
  let board: Board = { rows: cfg.rows, cols: cfg.cols, arrows: [] }
  const placementOrder: string[] = []

  for (let i = 0; i < cfg.arrows; i++) {
    const ctx = contextFor(board)
    if (ctx.empty.length === 0) break

    // The first two arrows have nothing to be blocked by, so a degenerate rim arrow is
    // harmless there, and refusing one would only stall the sampler.
    const allowDegenerate = i < 2
    const id = `a${i + 1}`

    const candidates: Arrow[] = []
    for (let attempt = 0; attempt < WALKS_PER_PLACEMENT; attempt++) {
      const walk = growWalk(cfg, ctx.empty, ctx.occupied, rng)
      for (const arrow of arrowsFromWalk(walk, id)) {
        if (isLegal(cfg, ctx, arrow, allowDegenerate) && validateShape(cfg.rows, cfg.cols, arrow) === null) {
          candidates.push(arrow)
        }
      }
    }
    if (!isNonEmpty(candidates)) break // the board is full enough; keep what we have

    const chosen =
      rng.next() < tangleBias
        ? bestOf(candidates, (arrow) => difficultyScore(ctx, cfg, arrow))
        : rng.pick(candidates)

    board = { ...board, arrows: [...board.arrows, chosen] }
    placementOrder.push(chosen.id)
  }

  if (board.arrows.length < Math.ceil(cfg.arrows * MIN_FILL)) return null

  board = tighten(board, cfg, rng, placementOrder)

  const solution = [...placementOrder].reverse()
  const freeRatio = freeArrows(board).length / board.arrows.length

  // Belt and braces. The construction argument says this cannot fail — but a level that
  // reaches a player unsolvable is the one bug with no recovery, so we check anyway.
  if (!replaySolution(board, solution).ok) return null

  return { arrows: board.arrows, solution, freeRatio }
}

/**
 * The tightening pass — what actually makes a board hard.
 *
 * The main loop has a floor it cannot get under. It places a fixed number of arrows, and
 * an arrow can only ever be blocked by one placed AFTER it, so whatever is still free when
 * the loop runs out of arrows STAYS free. Cranking the arrow count does not help: past a
 * point a denser board has less room to choose placements in, not more, and the late
 * arrows land wherever they fit rather than where they would do damage. Pushing the tricky
 * tier from 30 arrows to 34 made it EASIER — 20% free went to 27%.
 *
 * So instead of placing more arrows and hoping, this places arrows for one reason only:
 * each new arrow must block something that is currently free. It stops the moment the
 * board reaches its target, runs out of room, or can no longer find a placement that
 * blocks anything — so it adds exactly as many arrows as the difficulty needs, and no
 * filler.
 */
function tighten(board: Board, cfg: TierConfig, rng: Rng, placementOrder: string[]): Board {
  let current = board

  while (current.arrows.length < cfg.maxArrows) {
    const free = freeArrows(current).length / current.arrows.length
    if (free <= cfg.targetFreeRatio) break

    const ctx = contextFor(current)
    if (ctx.empty.length === 0) break

    const id = `a${current.arrows.length + 1}`
    const candidates: Arrow[] = []

    for (let attempt = 0; attempt < TIGHTEN_WALKS; attempt++) {
      // Short bodies here, whatever the tier's usual length. By this point the board is
      // mostly full, and the cells still open are scraps — the gaps directly in front of
      // the arrows that are still free are exactly the ones a long body cannot fit into.
      // A stubby arrow that slots into the last gap in a lane blocks it just as well as a
      // grand six-cell serpent would, and it can actually be placed.
      const walk = growWalk(cfg, ctx.empty, ctx.occupied, rng, 1, Math.min(3, cfg.maxLength))
      for (const arrow of arrowsFromWalk(walk, id)) {
        // No degenerate arrows here, ever: an arrow nothing can block is precisely what we
        // are trying to get rid of.
        if (!isLegal(cfg, ctx, arrow, false)) continue
        if (validateShape(cfg.rows, cfg.cols, arrow) !== null) continue
        // The whole point of this pass. An arrow that blocks nothing is not worth placing.
        if (tangleOf(ctx, arrow) > 0) candidates.push(arrow)
      }
    }

    if (!isNonEmpty(candidates)) break

    const chosen = bestOf(candidates, (arrow) => difficultyScore(ctx, cfg, arrow))
    current = { ...current, arrows: [...current.arrows, chosen] }
    placementOrder.push(chosen.id)
  }

  return current
}

/**
 * Bakes one board, sweeping the tangle bias to land as close as possible to the tier's
 * target free ratio. Deterministic for a given rng seed.
 */
export function generateBoard(cfg: TierConfig, rng: Rng): GeneratedBoard {
  let best: GeneratedBoard | null = null

  for (let attempt = 0; attempt < BOARD_ATTEMPTS; attempt++) {
    // Sweep the bias rather than guessing it: high bias knots the board, low bias leaves
    // it loose, and the tier's target sits somewhere in between.
    const bias = attempt / (BOARD_ATTEMPTS - 1)
    const board = buildBoard(cfg, rng, bias)
    if (!board) continue

    if (!best || distanceToTarget(board, cfg) < distanceToTarget(best, cfg)) best = board
  }

  if (!best) throw new Error(`could not generate a board for ${cfg.rows}x${cfg.cols} with ${cfg.arrows} arrows`)
  return best
}

function distanceToTarget(board: GeneratedBoard, cfg: TierConfig): number {
  return Math.abs(board.freeRatio - cfg.targetFreeRatio)
}
