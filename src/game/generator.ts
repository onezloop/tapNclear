/**
 * The level baker. BUILD-TIME ONLY — the app never imports this.
 *
 * It builds each board in ESCAPE ORDER — the order the arrows will leave — and the single
 * rule it obeys is this:
 *
 *   A new arrow's exit lane may pass only over cells belonging to arrows that have ALREADY
 *   escaped (or off the board entirely). It may never cross a cell that is still unclaimed.
 *
 * Everything else follows from that one line.
 *
 * WHY IT IS A VALID PUZZLE. Arrow `i`'s lane contains cells of arrows 1..i-1 and nothing
 * else. By the time it is arrow `i`'s turn to leave, arrows 1..i-1 are gone, so its lane is
 * empty and it can go. The order the baker built them in IS a solution, by construction — no
 * solver, no backtracking, and the hint system comes free.
 *
 * WHY THE BOARD CAN ALWAYS BE FILLED. The baker can never paint itself into a corner, and
 * this is worth seeing because it is what the old generator got wrong. Take the topmost
 * unclaimed cell and point an arrow UP out of it: every cell above it is, by the definition
 * of "topmost", already claimed — so that lane is legal. A legal move therefore always
 * exists, whatever the board looks like, right down to the final empty cell. The grid fills
 * completely, every time.
 *
 * WHY A FULL BOARD IS THE HARD ONE. On a board with no gaps, an arrow is free if and only if
 * its lane is EMPTY — that is, its head sits on the rim pointing outward. Any other arrow's
 * lane must run into somebody. So a full board hands you the tightest possible opening for
 * nothing: allow one rim-head and exactly ONE arrow on the whole board can be tapped, and
 * everything else unwinds from it. `freeAllowance` is the dial that decides how many.
 *
 * The previous generator worked the other way round — it placed arrows wherever a lane was
 * already clear — and it could never fill a board, because as the board crowds, almost no
 * cell has a clear ray to an edge left. It starved around half full and no amount of raising
 * the arrow ceiling could move it. The fix was not a bigger budget; it was building the board
 * in the other direction.
 */

import { DIRECTIONS, OPPOSITE, bendCount, cellKey, exitLane, inBounds, step, validateShape } from './geometry'
import type { Rng } from './rng'
import { freeArrows, replaySolution } from './rules'
import type { Arrow, Board, Cell, Direction } from './types'

export interface TierConfig {
  readonly rows: number
  readonly cols: number
  readonly minLength: number
  readonly maxLength: number
  /** How many corners one body may turn. This is the "nested folds" dial. */
  readonly maxBends: number
  /**
   * How much of the grid must be covered. 1 means a completely full board — no empty cells
   * at all — which is what every level from 11 on ships with.
   */
  readonly fillRatio: number
  /**
   * How many arrows may be tappable on turn one.
   *
   * On a full board a free arrow is exactly an arrow whose head is on the rim pointing
   * outward, so this is a direct, countable dial rather than a ratio the baker has to chase.
   * At 1, the whole board unwinds from a single move the player has to find.
   */
  readonly freeAllowance: number
}

export interface GeneratedBoard {
  readonly arrows: readonly Arrow[]
  /** Escape order — a guaranteed-good solution, by construction. */
  readonly solution: readonly string[]
  readonly freeRatio: number
  /** Fraction of the grid's cells covered by an arrow. 1 is a full board. */
  readonly fill: number
}

/** Boards to bake per call, keeping whichever lands closest to `freeAllowance`. */
const BOARD_ATTEMPTS = 12

/** A head cell plus the way it points: one candidate arrow, before it grows a body. */
interface Head {
  readonly cell: Cell
  readonly dir: Direction
  /** Cells between the head and the edge. Empty means this arrow is free on turn one. */
  readonly laneLength: number
}

/**
 * Every legal head on the board right now.
 *
 * Legal means the lane from that cell to the edge is made only of claimed cells — cells of
 * arrows that escape earlier. A lane crossing an unclaimed cell is illegal, because whatever
 * ends up in that cell would still be sitting there when this arrow tried to leave.
 */
function legalHeads(cfg: TierConfig, claimed: ReadonlySet<string>): Head[] {
  const heads: Head[] = []

  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      const cell = { row, col }
      if (claimed.has(cellKey(cell))) continue

      for (const dir of DIRECTIONS) {
        let laneLength = 0
        let clear = true

        for (let cursor = step(cell, dir); inBounds(cfg.rows, cfg.cols, cursor); cursor = step(cursor, dir)) {
          if (!claimed.has(cellKey(cursor))) {
            clear = false
            break
          }
          laneLength++
        }

        if (clear) heads.push({ cell, dir, laneLength })
      }
    }
  }

  return heads
}

/**
 * Grows a body backwards from the head, through unclaimed cells only.
 *
 * Backwards, because the head is the fixed point: the arrow must leave in `head.dir`, so the
 * cell behind the head has to be `head.cell - dir` for the final segment to point the right
 * way. From there the body wanders freely.
 *
 * Two things fall out of the body living entirely in UNCLAIMED cells while the lane lives
 * entirely in CLAIMED ones: the body can never stray into its own lane, so a self-blocking
 * arrow — the one shape that can never move, and a single one ruins a board — is impossible
 * here by construction rather than by a check.
 */
function growBody(cfg: TierConfig, head: Head, claimed: ReadonlySet<string>, rng: Rng): Cell[] {
  const targetLength = cfg.minLength + rng.int(cfg.maxLength - cfg.minLength + 1)

  // Held head-first while growing, then reversed into tail -> head order at the end. Bends
  // are symmetric under reversal, so the fold budget can be counted on it as it stands.
  const walk: Cell[] = [head.cell]
  const used = new Set<string>([cellKey(head.cell)])

  const free = (cell: Cell): boolean =>
    inBounds(cfg.rows, cfg.cols, cell) && !claimed.has(cellKey(cell)) && !used.has(cellKey(cell))

  /** How much room a step into `cell` would leave to carry on from. */
  const elbowRoom = (cell: Cell): number => DIRECTIONS.filter((dir) => free(step(cell, dir))).length

  // The first step back is forced: it is what makes the arrowhead point along `dir`.
  const behind = step(head.cell, OPPOSITE[head.dir])
  if (!free(behind)) return [head.cell]

  walk.push(behind)
  used.add(cellKey(behind))

  while (walk.length < targetLength) {
    const current = walk[walk.length - 1]!
    const heading = directionOf(walk[walk.length - 2]!, current)
    const bendsUsed = bendCount({ id: '', body: walk, dir: 'up' })

    const options = DIRECTIONS.filter((dir) => free(step(current, dir)))
    if (options.length === 0) break

    const straight = options.filter((dir) => dir === heading)
    const turns = options.filter((dir) => dir !== heading)

    // Fold when there is budget for it — the folds are half of what makes a late board hard
    // to read, and a body that never turns is just a stick. When the budget is spent, carry
    // straight on rather than giving up: a long straight tail is still a long arrow.
    let pool: Direction[]
    if (bendsUsed >= cfg.maxBends) pool = straight
    else if (turns.length > 0 && rng.next() < TURN_BIAS) pool = turns
    else pool = straight.length > 0 ? straight : turns

    if (pool.length === 0) break

    // Warnsdorff's rule: step into the MOST CONSTRAINED cell — the one with the fewest ways
    // on from it. It is deeply counter-intuitive and it is the whole trick.
    //
    // Grabbing the roomiest cell instead (which is what this did at first) leaves the tight
    // ones behind, and a cell with no free neighbours left is a cell no body can ever be
    // grown through: it can only become a one-cell arrow. Half of every board came out as
    // 143 single-cell stubs that way. Eating the awkward cells while they are still reachable
    // strands far fewer of them, so the bodies that follow can actually run.
    const best = rng
      .shuffle(pool)
      .reduce((a, b) => (elbowRoom(step(current, b)) < elbowRoom(step(current, a)) ? b : a))

    walk.push(step(current, best))
    used.add(cellKey(step(current, best)))
  }

  return walk.reverse()
}

/** How eagerly a body turns a corner when it has the budget to. */
const TURN_BIAS = 0.55

function directionOf(from: Cell, to: Cell): Direction {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  return 'right'
}

/**
 * Picks the head for the next arrow.
 *
 * A head with an EMPTY lane is an arrow that will be free on turn one, so these are rationed:
 * the very first arrow has no choice but to be one (nothing has escaped yet, so no lane can
 * be legal unless it is empty), and after that they are only taken while the board is still
 * under its `freeAllowance` — and even then only sometimes, so they scatter rather than
 * clumping at the start.
 */
function chooseHead(
  cfg: TierConfig,
  heads: readonly Head[],
  claimed: ReadonlySet<string>,
  freeSoFar: number,
  rng: Rng,
): Head {
  /**
   * A head whose cell-behind is already claimed can only ever be a ONE-CELL arrow — there is
   * nowhere for a body to go. Prefer heads that can actually grow a body, and leave the stubs
   * for when there is nothing else, which is exactly when they are unavoidable anyway.
   */
  const growable = (head: Head): boolean => {
    const behind = step(head.cell, OPPOSITE[head.dir])
    return inBounds(cfg.rows, cfg.cols, behind) && !claimed.has(cellKey(behind))
  }

  const prefer = (pool: readonly Head[]): Head => {
    const canGrow = pool.filter(growable)
    return rng.pick(canGrow.length > 0 ? canGrow : pool)
  }

  const blocked = heads.filter((head) => head.laneLength > 0)
  const open = heads.filter((head) => head.laneLength === 0)

  if (blocked.length === 0) return prefer(open)
  if (open.length > 0 && freeSoFar < cfg.freeAllowance && rng.next() < 0.4) return prefer(open)

  return prefer(blocked)
}

function buildBoard(cfg: TierConfig, rng: Rng): GeneratedBoard | null {
  const totalCells = cfg.rows * cfg.cols
  const wanted = Math.round(totalCells * cfg.fillRatio)

  const claimed = new Set<string>()
  const arrows: Arrow[] = []
  let free = 0

  while (claimed.size < wanted) {
    const heads = legalHeads(cfg, claimed)
    // Cannot happen — the topmost unclaimed cell always yields one, pointing up. Belt and
    // braces: a baker that silently produced a half-board would be a nasty thing to debug.
    if (heads.length === 0) return null

    const head = chooseHead(cfg, heads, claimed, free, rng)
    const body = growBody(cfg, head, claimed, rng)
    const arrow: Arrow = { id: `a${arrows.length + 1}`, body, dir: head.dir }

    if (validateShape(cfg.rows, cfg.cols, arrow) !== null) return null

    arrows.push(arrow)
    for (const cell of body) claimed.add(cellKey(cell))
    if (head.laneLength === 0) free++
  }

  const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows }
  const solution = arrows.map((arrow) => arrow.id)

  // Belt and braces. The construction argument says this cannot fail — but a level that
  // reaches a player unsolvable is the one bug with no recovery, so we check anyway.
  if (!replaySolution(board, solution).ok) return null

  return {
    arrows,
    solution,
    freeRatio: freeArrows(board).length / arrows.length,
    fill: claimed.size / totalCells,
  }
}

/**
 * Bakes one board. Deterministic for a given rng seed.
 *
 * Several attempts, keeping the one whose free-arrow count lands closest to the allowance —
 * the count is what the player actually feels on turn one, and a board that happens to come
 * out with three tappable arrows where the curve asked for one is a soft spot in the
 * campaign.
 */
export function generateBoard(cfg: TierConfig, rng: Rng): GeneratedBoard {
  let best: GeneratedBoard | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < BOARD_ATTEMPTS; attempt++) {
    const board = buildBoard(cfg, rng)
    if (!board) continue

    const freeCount = board.freeRatio * board.arrows.length
    const distance = Math.abs(freeCount - cfg.freeAllowance)

    if (distance < bestDistance) {
      best = board
      bestDistance = distance
    }
  }

  if (!best) throw new Error(`could not generate a board for ${cfg.rows}x${cfg.cols}`)
  return best
}

/** Exposed for the tuning script: how many arrows are tappable on turn one. */
export function freeCountOf(board: Board): number {
  return freeArrows(board).length
}

/** Exposed for tests: an arrow is unblockable exactly when its lane is empty. */
export function isUnblockable(rows: number, cols: number, arrow: Arrow): boolean {
  return exitLane(rows, cols, arrow).length === 0
}
