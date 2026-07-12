/**
 * The game as a pure state machine.
 *
 * No timers, no localStorage, no React. Animation clean-up is scheduled by the hook that
 * owns the reducer (see hooks/useGameEngine.ts) and comes back in as an explicit action —
 * so every transition here is synchronous and testable without a browser.
 */

import { nextHint } from './hint'
import { blockersOf, findArrow, isFree, isSolved, removeArrow } from './rules'
import type { Board, LevelData } from './types'

export const STARTING_HEARTS = 3

export type Phase = 'playing' | 'won' | 'lost'

/**
 * Transient visual state: what the last tap did. The reducer decides it; the view renders
 * it; a follow-up CLEAR_FEEDBACK action retires it.
 */
export type Feedback =
  | { readonly kind: 'escaping'; readonly arrowId: string }
  | { readonly kind: 'blocked'; readonly arrowId: string; readonly blockerIds: readonly string[] }
  | { readonly kind: 'hint'; readonly arrowId: string }

export interface GameState {
  readonly level: number
  readonly board: Board
  readonly totalArrows: number
  readonly hearts: number
  readonly moves: number
  readonly hintsUsed: number
  readonly phase: Phase
  readonly feedback: Feedback | null
}

export type Action =
  | { readonly type: 'TAP'; readonly arrowId: string }
  | { readonly type: 'HINT' }
  | { readonly type: 'CLEAR_FEEDBACK' }
  | { readonly type: 'LOAD'; readonly level: LevelData }

export function initialState(level: LevelData): GameState {
  return {
    level: level.id,
    board: { rows: level.rows, cols: level.cols, arrows: level.arrows },
    totalArrows: level.arrows.length,
    hearts: STARTING_HEARTS,
    moves: 0,
    hintsUsed: 0,
    phase: 'playing',
    feedback: null,
  }
}

/** Three stars for a clean run: no collisions, no hints. */
export function starsFor(state: GameState): number {
  if (state.phase !== 'won') return 0
  const heartsLost = STARTING_HEARTS - state.hearts
  if (heartsLost === 0 && state.hintsUsed === 0) return 3
  if (heartsLost <= 1) return 2
  return 1
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD':
      return initialState(action.level)

    case 'CLEAR_FEEDBACK':
      return state.feedback ? { ...state, feedback: null } : state

    case 'HINT': {
      if (state.phase !== 'playing') return state
      const arrowId = nextHint(state.board)
      if (!arrowId) return state
      return { ...state, hintsUsed: state.hintsUsed + 1, feedback: { kind: 'hint', arrowId } }
    }

    case 'TAP': {
      if (state.phase !== 'playing') return state

      const arrow = findArrow(state.board, action.arrowId)
      if (!arrow) return state

      if (!isFree(state.board, arrow)) {
        const hearts = state.hearts - 1
        return {
          ...state,
          hearts,
          // Losing does not hide the board or punish further: the level simply waits.
          phase: hearts <= 0 ? 'lost' : 'playing',
          feedback: {
            kind: 'blocked',
            arrowId: arrow.id,
            // Naming the blockers is the teaching moment — the board answers "why not?"
            // instead of merely refusing.
            blockerIds: blockersOf(state.board, arrow),
          },
        }
      }

      const board = removeArrow(state.board, arrow.id)
      return {
        ...state,
        board,
        moves: state.moves + 1,
        phase: isSolved(board) ? 'won' : 'playing',
        feedback: { kind: 'escaping', arrowId: arrow.id },
      }
    }
  }
}
