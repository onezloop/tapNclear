import { describe, expect, it } from 'vitest'
import { configFor } from './tiers'
import { generateBoard, isUnblockable } from './generator'
import { bendCount, cellKey, isSelfBlocking, validateShape } from './geometry'
import { createRng } from './rng'
import { freeArrows, replaySolution } from './rules'
import type { Board } from './types'

/**
 * The curve is per LEVEL, not per tier, so the generator is exercised at levels spread across
 * the campaign rather than at four tier configs. These are the corners: the first generated
 * board, the ramp into full boards, the middle, and the very last one — the biggest grid with
 * the longest and most folded bodies.
 */
const SAMPLE_LEVELS = [6, 11, 20, 40, 60, 80, 100] as const

/**
 * The gate. If a generated board can be unsolvable, nothing else in this project matters, so
 * this generates a lot of them and proves every single one.
 *
 * One generation pass, every invariant checked on it — re-baking the same seeds once per
 * assertion made this suite take minutes.
 */
describe('the generator produces only solvable boards', () => {
  for (const level of SAMPLE_LEVELS) {
    const cfg = configFor(level)

    it(`level ${level}: 25 boards are each solvable and well-formed`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const where = `level ${level} seed ${seed}`
        const { arrows, solution, fill } = generateBoard(cfg, createRng(seed * 7919))
        const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows }

        // THE GATE: the stored escape order really does clear the board.
        const replay = replaySolution(board, solution)
        expect(replay.reason ?? 'ok', where).toBe('ok')

        // There is always somewhere to start.
        expect(freeArrows(board).length, where).toBeGreaterThan(0)

        // The board is covered to at least what the curve asked for — counted in cells,
        // because a ratio comparison trips over its own rounding.
        const cells = cfg.rows * cfg.cols
        expect(Math.round(fill * cells), where).toBeGreaterThanOrEqual(Math.round(cells * cfg.fillRatio))

        for (const arrow of arrows) {
          const which = `${where}, arrow ${arrow.id}`
          expect(validateShape(cfg.rows, cfg.cols, arrow), which).toBeNull()
          expect(isSelfBlocking(cfg.rows, cfg.cols, arrow), which).toBe(false)
          expect(arrow.body.length, which).toBeLessThanOrEqual(cfg.maxLength)
          expect(bendCount(arrow), which).toBeLessThanOrEqual(cfg.maxBends)
        }
      }
    })

    it(`level ${level}: no two arrows overlap`, () => {
      const { arrows } = generateBoard(cfg, createRng(4242))

      const seen = new Set<string>()
      for (const arrow of arrows) {
        for (const cell of arrow.body) {
          expect(seen.has(cellKey(cell)), `arrow ${arrow.id} reuses ${cellKey(cell)}`).toBe(false)
          seen.add(cellKey(cell))
        }
      }
    })
  }
})

/**
 * The heart of it. A board with no empty cells has a property nothing else does: an arrow can
 * only be free if its lane is EMPTY — i.e. its head is on the rim pointing outward — because
 * any other lane has to run into somebody. That is what turns "how many arrows are tappable"
 * from a ratio the baker chases into a number it simply decides.
 */
describe('full boards', () => {
  for (const level of [11, 40, 70, 100] as const) {
    const cfg = configFor(level)

    it(`level ${level}: the board is completely full — not one empty cell`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const { arrows, fill } = generateBoard(cfg, createRng(seed * 999331))

        expect(fill, `level ${level} seed ${seed}`).toBe(1)

        const covered = new Set(arrows.flatMap((arrow) => arrow.body.map(cellKey)))
        expect(covered.size).toBe(cfg.rows * cfg.cols)
      }
    })

    it(`level ${level}: at most ${cfg.freeAllowance} arrows can be tapped on turn one`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const { arrows } = generateBoard(cfg, createRng(seed * 15485863))
        const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows }

        expect(freeArrows(board).length, `level ${level} seed ${seed}`).toBeLessThanOrEqual(cfg.freeAllowance)
      }
    })

    it(`level ${level}: a free arrow on a full board is exactly a rim arrow`, () => {
      const { arrows } = generateBoard(cfg, createRng(271828))
      const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows }

      // The claim the whole design rests on. If this ever fails, `freeAllowance` has stopped
      // meaning anything and the late campaign is quietly easier than it says.
      for (const arrow of freeArrows(board)) {
        expect(isUnblockable(cfg.rows, cfg.cols, arrow), `arrow ${arrow.id}`).toBe(true)
      }
    })
  }
})

describe('difficulty is aimed at, not hoped for', () => {
  const measure = (level: number): { free: number; folds: number } => {
    const cfg = configFor(level)
    const samples = 6

    let free = 0
    let folds = 0
    for (let seed = 1; seed <= samples; seed++) {
      const { arrows } = generateBoard(cfg, createRng(seed * 31337))
      free += freeArrows({ rows: cfg.rows, cols: cfg.cols, arrows }).length
      folds += Math.max(...arrows.map(bendCount))
    }

    return { free: free / samples, folds: folds / samples }
  }

  /**
   * The regression this exists to catch is a FLAT campaign, and it is not hypothetical: the
   * curve used to be a per-tier lookup, so every level from 51 to 100 was built from identical
   * numbers — fifty boards of the same size and the same difficulty. It is measured at levels,
   * not tiers, precisely because tiers are now only labels.
   */
  it('gets harder level by level, not tier by tier', () => {
    const start = measure(11)
    const middle = measure(55)
    const end = measure(100)

    // Fewer and fewer arrows can be tapped on turn one, all the way along.
    expect(start.free).toBeGreaterThan(middle.free)
    expect(middle.free).toBeGreaterThan(end.free)

    // And the last board comes down to a single move you have to find.
    expect(end.free).toBe(1)
  })

  it('folds the arrows more as the campaign goes on', () => {
    // The bodies get longer and turn more corners: a level-100 arrow is a nested serpent where
    // a level-11 arrow is a stub. This is the other half of what makes a late board hard.
    expect(measure(11).folds).toBeLessThan(measure(100).folds)
  })

  it('never steps backwards: no level is built easier than the one before it', () => {
    for (let level = 7; level <= 100; level++) {
      const previous = configFor(level - 1)
      const current = configFor(level)
      const where = `level ${level}`

      expect(current.freeAllowance, where).toBeLessThanOrEqual(previous.freeAllowance)
      expect(current.fillRatio, where).toBeGreaterThanOrEqual(previous.fillRatio)
      expect(current.rows, where).toBeGreaterThanOrEqual(previous.rows)
      expect(current.maxBends, where).toBeGreaterThanOrEqual(previous.maxBends)
      expect(current.maxLength, where).toBeGreaterThanOrEqual(previous.maxLength)
    }
  })

  it('fills the board completely from level 11 to the end', () => {
    for (let level = 11; level <= 100; level++) {
      expect(configFor(level).fillRatio, `level ${level}`).toBe(1)
    }
  })
})

describe('determinism', () => {
  it('the same seed bakes the same board', () => {
    const cfg = configFor(50)
    expect(generateBoard(cfg, createRng(99))).toEqual(generateBoard(cfg, createRng(99)))
  })
})
