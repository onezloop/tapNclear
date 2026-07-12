/**
 * THE RULE, and everything that follows from it.
 *
 *   An arrow escapes if — and only if — the straight lane in front of its HEAD,
 *   from the head cell to the board edge, holds no cell of any other arrow.
 *
 * The rest of the arrow's body imposes no requirement of its own: it leaves by
 * retracing the route its head took, over cells the arrow already occupied. So an
 * arrow with another arrow sitting under its tail, or beside a bend, or beneath a
 * second prong, is still free. Only the head's lane can ever block it.
 *
 * Getting this wrong in the generous direction — treating anything in front of any
 * body cell as a blocker — would make half of every board falsely unmovable. That
 * is the bug this module exists to not have.
 */

import { cellKey, exitLane, isSelfBlocking } from './geometry'
import type { Arrow, Board, Cell } from './types'

/** Cell key -> id of the arrow occupying it. */
export type Occupancy = ReadonlyMap<string, string>

export function occupancy(board: Board): Occupancy {
  const map = new Map<string, string>()
  for (const arrow of board.arrows) {
    for (const cell of arrow.body) map.set(cellKey(cell), arrow.id)
  }
  return map
}

export function laneOf(board: Board, arrow: Arrow): Cell[] {
  return exitLane(board.rows, board.cols, arrow)
}

/**
 * The arrows standing in this arrow's exit lane, nearest first.
 * Empty means the arrow is free to leave.
 */
export function blockersOf(board: Board, arrow: Arrow, cells: Occupancy = occupancy(board)): string[] {
  const found: string[] = []
  for (const cell of laneOf(board, arrow)) {
    const occupantId = cells.get(cellKey(cell))
    if (occupantId && occupantId !== arrow.id && !found.includes(occupantId)) {
      found.push(occupantId)
    }
  }
  return found
}

/**
 * Freedom has two conditions, and forgetting the second one is a real bug we hit:
 *
 *  1. No OTHER arrow stands in the lane, and
 *  2. the arrow does not stand in its own lane.
 *
 * `blockersOf` deliberately ignores cells owned by the arrow itself — a body cell is
 * not a blocker, that is the whole point of the head-lane rule. But a body cell lying
 * IN FRONT OF THE HEAD is different in kind: the arrow would have to pull its head
 * through its own tail. Such an arrow can never move. The generator refuses to create
 * one, but the rule engine must still tell the truth about a board that contains one,
 * or `isSolvable` cheerfully reports an unsolvable board as fine.
 */
export function isFree(board: Board, arrow: Arrow, cells: Occupancy = occupancy(board)): boolean {
  if (isSelfBlocking(board.rows, board.cols, arrow)) return false
  return blockersOf(board, arrow, cells).length === 0
}

export function freeArrows(board: Board): Arrow[] {
  const cells = occupancy(board)
  return board.arrows.filter((arrow) => isFree(board, arrow, cells))
}

export function findArrow(board: Board, id: string): Arrow | undefined {
  return board.arrows.find((arrow) => arrow.id === id)
}

export function removeArrow(board: Board, id: string): Board {
  return { ...board, arrows: board.arrows.filter((arrow) => arrow.id !== id) }
}

export function isSolved(board: Board): boolean {
  return board.arrows.length === 0
}

/**
 * Can the board still be cleared?
 *
 * Removing an arrow only ever empties cells, so a free arrow can never become
 * blocked, and clearing one can never strand another. That makes solvability a
 * greedy peel — take any free arrow, repeat — with no search and no backtracking.
 *
 * It also means the player can never dead-end themselves: the only way to lose is
 * to tap a blocked arrow. There are no hidden traps.
 */
export function isSolvable(board: Board): boolean {
  let current = board
  while (!isSolved(current)) {
    const free = freeArrows(current)
    if (free.length === 0) return false
    for (const arrow of free) current = removeArrow(current, arrow.id)
  }
  return true
}

/** Replays an escape order against the real rule. Used to prove shipped levels. */
export function replaySolution(board: Board, solution: readonly string[]): { ok: boolean; reason?: string } {
  let current = board

  if (solution.length !== board.arrows.length) {
    return { ok: false, reason: `solution has ${solution.length} moves for ${board.arrows.length} arrows` }
  }

  for (const id of solution) {
    const arrow = findArrow(current, id)
    if (!arrow) return { ok: false, reason: `arrow ${id} is not on the board when its turn comes` }

    if (!isFree(current, arrow)) {
      const blockers = blockersOf(current, arrow)
      const reason = blockers.length > 0 ? `blocked by ${blockers.join(', ')}` : 'blocks itself'
      return { ok: false, reason: `arrow ${id} cannot move: ${reason}` }
    }

    current = removeArrow(current, id)
  }

  return isSolved(current) ? { ok: true } : { ok: false, reason: 'board is not empty after the solution' }
}
