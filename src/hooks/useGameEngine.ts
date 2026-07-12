import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { initialState, reduce } from '../game/engine'
import type { Action, GameState } from '../game/engine'
import { findArrow, isFree } from '../game/rules'
import type { LevelData } from '../game/types'
import type { EscapingArrow } from '../view/types'

const ESCAPE_MS = 480
const BLOCK_MS = 700
const HINT_MS = 2600

/**
 * React wiring around the pure reducer.
 *
 * Timers live here and nowhere else. The reducer in game/engine.ts is synchronous and
 * owns no clocks, which is what lets the entire rules layer be tested without a browser.
 */
export function useGameEngine(level: LevelData) {
  const [state, dispatch] = useReducer(reduce, level, initialState)
  const [escaping, setEscaping] = useState<readonly EscapingArrow[]>([])
  const timers = useRef<number[]>([])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    dispatch({ type: 'LOAD', level })
    setEscaping([])
  }, [level])

  // A level change, or an unmount, must not leave a timer behind to fire into the next
  // board and clear feedback that belongs to it.
  useEffect(() => {
    return () => {
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
    }
  }, [level])

  const tap = useCallback(
    (arrowId: string) => {
      if (state.phase !== 'playing') return

      const arrow = findArrow(state.board, arrowId)
      if (!arrow) return

      // The arrow is about to vanish from the model, so grab it now — the view needs its
      // shape to animate it out.
      if (isFree(state.board, arrow)) {
        setEscaping((current) => [...current, { arrow, armed: false }])
        requestAnimationFrame(() => {
          setEscaping((current) => current.map((g) => (g.arrow.id === arrowId ? { ...g, armed: true } : g)))
        })
        later(() => setEscaping((current) => current.filter((g) => g.arrow.id !== arrowId)), ESCAPE_MS)
      }

      dispatch({ type: 'TAP', arrowId })
    },
    [state.board, state.phase, later],
  )

  const hint = useCallback(() => dispatch({ type: 'HINT' }), [])
  const restart = useCallback(() => {
    setEscaping([])
    dispatch({ type: 'LOAD', level })
  }, [level])

  // Feedback is transient: it says what the last tap did, then gets out of the way.
  useEffect(() => {
    if (!state.feedback) return
    const linger = state.feedback.kind === 'hint' ? HINT_MS : state.feedback.kind === 'blocked' ? BLOCK_MS : ESCAPE_MS
    later(() => dispatch({ type: 'CLEAR_FEEDBACK' }), linger)
  }, [state.feedback, later])

  return { state, escaping, tap, hint, restart } as const
}

export type Engine = ReturnType<typeof useGameEngine>
export type { GameState, Action }
