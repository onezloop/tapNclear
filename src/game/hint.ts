/**
 * Hints are computed from the LIVE board, never replayed from the stored solution.
 *
 * The stored solution goes stale the moment the player deviates from it — and they will,
 * because any free arrow is a safe move (removing an arrow only empties cells, so it can
 * never strand another). A hint that insisted on the canonical order would tell a player
 * their perfectly good move was wrong.
 */

import { freeArrows } from './rules'
import type { Board } from './types'

/**
 * One arrow that is safe to tap right now, or null if the board is stuck.
 *
 * Among the free arrows we suggest the one with the shortest lane — the one whose escape
 * is most obvious once seen — so a hint teaches how to look rather than just dispensing
 * an answer.
 */
export function nextHint(board: Board): string | null {
  const free = freeArrows(board)
  if (free.length === 0) return null

  const easiest = free.reduce((best, arrow) => (arrow.body.length < best.body.length ? arrow : best))
  return easiest.id
}
