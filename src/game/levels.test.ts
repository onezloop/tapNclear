import { describe, expect, it } from 'vitest'
import { LEVELS, LEVEL_COUNT, boardOf, clampLevel, getLevel, validateLevel } from './levels'
import { freeArrows, isSolvable, replaySolution } from './rules'
import { TOTAL_LEVELS, tierOf } from './tiers'

/**
 * THE GUARD.
 *
 * Every level that ships is replayed here, through the real rules, from its stored
 * solution, and must end with an empty board. A puzzle that cannot be cleared fails the
 * test run rather than stranding a player, which is the whole reason levels are committed
 * data instead of runtime output.
 */
describe('every shipped level can actually be cleared', () => {
  it(`ships ${TOTAL_LEVELS} levels`, () => {
    expect(LEVEL_COUNT).toBe(TOTAL_LEVELS)
  })

  it.each(LEVELS.map((level) => [level.id, level] as const))('level %i', (_id, level) => {
    expect(validateLevel(level)).toBeNull()

    const board = boardOf(level)
    const replay = replaySolution(board, level.solution)
    expect(replay.reason ?? 'ok').toBe('ok')

    // ...and independently of the stored order, the board is greedily solvable, so a
    // player who deviates cannot be stranded.
    expect(isSolvable(board)).toBe(true)

    // There is always somewhere to start.
    expect(freeArrows(board).length).toBeGreaterThan(0)
  })
})

describe('the campaign is well-formed', () => {
  it('numbers levels 1..N with no gaps', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1))
  })

  it('puts each level in the tier its number implies', () => {
    for (const level of LEVELS) expect(level.tier).toBe(tierOf(level.id))
  })

  it('gets harder: fewer arrows are free at the start, later on', () => {
    const freeRatio = (id: number): number => {
      const level = getLevel(id)!
      return freeArrows(boardOf(level)).length / level.arrows.length
    }

    const early = (freeRatio(6) + freeRatio(10) + freeRatio(14)) / 3
    const late = (freeRatio(80) + freeRatio(90) + freeRatio(100)) / 3
    expect(late).toBeLessThan(early)
  })
})

describe('clampLevel', () => {
  it('keeps a stale or corrupt save inside the campaign', () => {
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(-5)).toBe(1)
    expect(clampLevel(9999)).toBe(LEVEL_COUNT)
    expect(clampLevel(Number.NaN)).toBe(1)
    expect(clampLevel(37)).toBe(37)
  })
})
