/**
 * Grid geometry. Everything here is about cells and shapes — nothing here knows
 * that other arrows exist. Blocking lives in rules.ts.
 */

import type { Arrow, Cell, Direction } from './types'

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

const DELTA: Record<Direction, Cell> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
}

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function step(cell: Cell, dir: Direction): Cell {
  const d = DELTA[dir]
  return { row: cell.row + d.row, col: cell.col + d.col }
}

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col
}

export function inBounds(rows: number, cols: number, cell: Cell): boolean {
  return cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols
}

export function head(arrow: Arrow): Cell {
  const cell = arrow.body[arrow.body.length - 1]
  if (!cell) throw new Error(`arrow ${arrow.id} has an empty body`)
  return cell
}

export function tail(arrow: Arrow): Cell {
  const cell = arrow.body[0]
  if (!cell) throw new Error(`arrow ${arrow.id} has an empty body`)
  return cell
}

/** The direction of travel from `a` to an orthogonally adjacent `b`. */
export function directionBetween(a: Cell, b: Cell): Direction | null {
  const dr = b.row - a.row
  const dc = b.col - a.col
  if (dr === -1 && dc === 0) return 'up'
  if (dr === 1 && dc === 0) return 'down'
  if (dr === 0 && dc === -1) return 'left'
  if (dr === 0 && dc === 1) return 'right'
  return null
}

/**
 * The cells the arrow's head passes through on its way off the board: the straight
 * ray from the head cell to the edge, in `dir`, EXCLUDING the head cell itself.
 *
 * This is the arrow's entire exit requirement. The rest of the body does not need
 * clear cells of its own — it leaves by retracing the route the head took.
 *
 * An arrow whose head sits on the rim pointing outward has an empty lane, and so
 * can never be blocked by anything.
 */
export function exitLane(rows: number, cols: number, arrow: Arrow): Cell[] {
  const lane: Cell[] = []
  let cursor = step(head(arrow), arrow.dir)
  while (inBounds(rows, cols, cursor)) {
    lane.push(cursor)
    cursor = step(cursor, arrow.dir)
  }
  return lane
}

export function bodyOccupies(arrow: Arrow, cell: Cell): boolean {
  return arrow.body.some((c) => sameCell(c, cell))
}

/**
 * True when part of the arrow's own body lies in the lane in front of its head.
 *
 * Such an arrow can never move — it would have to pull its head through its own
 * tail — and a single one of them makes a board unsolvable. Shapes like this are
 * rejected at generation time; this is the check that rejects them.
 */
export function isSelfBlocking(rows: number, cols: number, arrow: Arrow): boolean {
  return exitLane(rows, cols, arrow).some((cell) => bodyOccupies(arrow, cell))
}

export function bendCount(arrow: Arrow): number {
  let bends = 0
  for (let i = 2; i < arrow.body.length; i++) {
    const a = arrow.body[i - 2]!
    const b = arrow.body[i - 1]!
    const c = arrow.body[i]!
    if (directionBetween(a, b) !== directionBetween(b, c)) bends++
  }
  return bends
}

/**
 * Structural validation of an arrow, independent of any board contents.
 * Returns a human-readable reason, or null when the shape is well-formed.
 */
export function validateShape(rows: number, cols: number, arrow: Arrow): string | null {
  if (arrow.body.length === 0) return 'body is empty'

  const seen = new Set<string>()
  for (const cell of arrow.body) {
    if (!inBounds(rows, cols, cell)) return `cell ${cellKey(cell)} is off the board`
    if (seen.has(cellKey(cell))) return `body revisits cell ${cellKey(cell)}`
    seen.add(cellKey(cell))
  }

  for (let i = 1; i < arrow.body.length; i++) {
    if (!directionBetween(arrow.body[i - 1]!, arrow.body[i]!)) {
      return `body is not orthogonally connected at index ${i}`
    }
  }

  if (arrow.body.length >= 2) {
    const lastSegment = directionBetween(arrow.body[arrow.body.length - 2]!, head(arrow))
    if (lastSegment !== arrow.dir) {
      return `head points ${arrow.dir} but the final segment travels ${lastSegment}`
    }
  }

  if (isSelfBlocking(rows, cols, arrow)) return 'arrow blocks itself: its body lies in front of its head'

  return null
}
