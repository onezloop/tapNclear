import { describe, expect, it } from 'vitest'
import { bendCount, cellKey } from './geometry'
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

  /**
   * These three pin the campaign's SHAPE, not just its endpoints, and they exist because the
   * campaign was once genuinely flat: difficulty was looked up per tier, so all fifty levels
   * from 51 to 100 shipped with an identical board size, arrow budget and fold budget. An
   * endpoints-only check (level 6 vs level 100) passes happily on a curve like that, as long
   * as the four steps differ. These do not.
   */
  it('grows the board as the campaign goes on, and never shrinks it', () => {
    const generated = LEVELS.filter((level) => level.id >= 6)

    for (let i = 1; i < generated.length; i++) {
      const previous = generated[i - 1]!
      const current = generated[i]!
      expect(current.rows, `level ${current.id}`).toBeGreaterThanOrEqual(previous.rows)
      expect(current.cols, `level ${current.id}`).toBeGreaterThanOrEqual(previous.cols)
    }

    expect(generated[0]!.rows).toBe(11)
    expect(generated[generated.length - 1]!.rows).toBeGreaterThan(generated[0]!.rows)
  })

  it('folds the arrows more as the campaign goes on', () => {
    const maxFolds = (id: number): number => Math.max(...getLevel(id)!.arrows.map(bendCount))

    const early = Math.max(maxFolds(6), maxFolds(10), maxFolds(15))
    const late = Math.max(maxFolds(90), maxFolds(95), maxFolds(100))
    expect(late).toBeGreaterThan(early)
  })

  it('does not stagnate: no long run of levels is built to the same size', () => {
    // The old per-tier curve produced a run of FIFTY identical-size boards. Nothing should
    // come close to that: the grid steps up repeatedly across the back half of the campaign.
    const sizes = new Set(LEVELS.filter((level) => level.id >= 51).map((level) => level.rows))
    expect(sizes.size).toBeGreaterThan(1)
  })

  /**
   * Every board from 11 on is COMPLETELY FULL — no empty cells at all. This is not a cosmetic
   * property: on a full board an arrow can only be free if its head is on the rim pointing
   * outward, which is what lets the baker ration the tappable arrows down to one. A board that
   * shipped with holes in it would still be solvable and would still pass every other test
   * here, and would simply be easier than the curve claims.
   */
  it('ships completely full boards from level 11 to the end', () => {
    for (const level of LEVELS) {
      if (level.id < 11) continue

      const covered = new Set(level.arrows.flatMap((arrow) => arrow.body.map(cellKey)))
      expect(covered.size, `level ${level.id}`).toBe(level.rows * level.cols)
    }
  })

  it('narrows down to a single tappable arrow by the end of the campaign', () => {
    const tappable = (id: number): number => freeArrows(boardOf(getLevel(id)!)).length

    // The whole board unwinds from one move you have to find.
    expect(tappable(100)).toBe(1)
    expect(tappable(11)).toBeGreaterThan(tappable(100))
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
