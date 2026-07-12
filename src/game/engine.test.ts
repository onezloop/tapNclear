import { beforeEach, describe, expect, it } from 'vitest'
import { STARTING_HEARTS, initialState, reduce, starsFor } from './engine'
import type { GameState } from './engine'
import type { LevelData } from './types'

/**
 * A chain: `c` is blocked by `b`, which is blocked by `a`. Only `a` can move at first.
 *   row 0:  [c][b][a] -> -> ->  edge
 */
const LEVEL: LevelData = {
  id: 1,
  tier: 'warmup',
  rows: 3,
  cols: 4,
  arrows: [
    { id: 'a', dir: 'right', body: [{ row: 0, col: 2 }] },
    { id: 'b', dir: 'right', body: [{ row: 0, col: 1 }] },
    { id: 'c', dir: 'right', body: [{ row: 0, col: 0 }] },
  ],
  solution: ['a', 'b', 'c'],
}

const tap = (state: GameState, arrowId: string): GameState => reduce(state, { type: 'TAP', arrowId })

describe('engine', () => {
  let state: GameState

  beforeEach(() => {
    state = initialState(LEVEL)
  })

  it('starts with three hearts and a full board', () => {
    expect(state.hearts).toBe(STARTING_HEARTS)
    expect(state.board.arrows).toHaveLength(3)
    expect(state.phase).toBe('playing')
  })

  it('a free arrow escapes, costs no heart, and reports itself for the animation', () => {
    const next = tap(state, 'a')

    expect(next.board.arrows.map((x) => x.id)).toEqual(['b', 'c'])
    expect(next.hearts).toBe(3)
    expect(next.moves).toBe(1)
    expect(next.feedback).toEqual({ kind: 'escaping', arrowId: 'a' })
  })

  it('a blocked arrow costs a heart, does not move, and names its blockers', () => {
    const next = tap(state, 'c')

    expect(next.board.arrows).toHaveLength(3)
    expect(next.hearts).toBe(2)
    expect(next.moves).toBe(0)
    expect(next.feedback).toEqual({ kind: 'blocked', arrowId: 'c', blockerIds: ['b', 'a'] })
  })

  it('runs out of hearts after three collisions', () => {
    let next = tap(state, 'c')
    next = reduce(next, { type: 'CLEAR_FEEDBACK' })
    next = tap(next, 'c')
    next = reduce(next, { type: 'CLEAR_FEEDBACK' })
    expect(next.phase).toBe('playing')

    next = tap(next, 'c')
    expect(next.hearts).toBe(0)
    expect(next.phase).toBe('lost')
  })

  it('ignores taps once the run is lost', () => {
    let next = state
    for (let i = 0; i < 3; i++) next = tap(next, 'c')
    expect(next.phase).toBe('lost')

    expect(tap(next, 'a')).toBe(next)
  })

  it('is won when the last arrow leaves', () => {
    let next = tap(state, 'a')
    next = tap(next, 'b')
    expect(next.phase).toBe('playing')

    next = tap(next, 'c')
    expect(next.phase).toBe('won')
    expect(next.board.arrows).toEqual([])
  })

  it('a hint names a genuinely free arrow and costs a hint, not a heart', () => {
    const next = reduce(state, { type: 'HINT' })

    expect(next.feedback).toEqual({ kind: 'hint', arrowId: 'a' })
    expect(next.hintsUsed).toBe(1)
    expect(next.hearts).toBe(3)
  })

  it('hints track the live board rather than replaying the stored solution', () => {
    // Clear `a` — which the stored solution also wants first — then check the hint has
    // moved on to `b` rather than stubbornly pointing at an arrow that has already gone.
    const next = reduce(tap(state, 'a'), { type: 'HINT' })
    expect(next.feedback).toEqual({ kind: 'hint', arrowId: 'b' })
  })
})

describe('stars', () => {
  const win = (state: GameState): GameState => {
    let next = state
    for (const id of ['a', 'b', 'c']) next = tap(next, id)
    return next
  }

  it('gives three for a clean run', () => {
    expect(starsFor(win(initialState(LEVEL)))).toBe(3)
  })

  it('gives two when a heart was lost', () => {
    expect(starsFor(win(tap(initialState(LEVEL), 'c')))).toBe(2)
  })

  it('gives two when a hint was used', () => {
    expect(starsFor(win(reduce(initialState(LEVEL), { type: 'HINT' })))).toBe(2)
  })

  it('gives none while the level is unfinished', () => {
    expect(starsFor(initialState(LEVEL))).toBe(0)
  })
})
