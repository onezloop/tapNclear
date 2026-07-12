import { describe, expect, it } from 'vitest'
import { TIERS } from './tiers'
import { generateBoard } from './generator'
import { isSelfBlocking, validateShape } from './geometry'
import { createRng } from './rng'
import { freeArrows, replaySolution } from './rules'
import type { Board } from './types'

/**
 * The gate. If a generated board can be unsolvable, nothing else in this project
 * matters, so this test generates a lot of them and proves every single one.
 */
describe('the generator produces only solvable boards', () => {
  for (const [name, cfg] of Object.entries(TIERS)) {
    it(`${name}: 40 boards are each cleared by their own stored solution`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const rng = createRng(seed * 7919)
        const generated = generateBoard(cfg, rng)
        const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows: generated.arrows }

        const replay = replaySolution(board, generated.solution)
        expect(replay.reason ?? 'ok', `${name} seed ${seed}`).toBe('ok')
        expect(replay.ok).toBe(true)
      }
    })

    it(`${name}: every arrow is a well-formed, non-self-blocking shape`, () => {
      const rng = createRng(4242)
      const { arrows } = generateBoard(cfg, rng)

      // `arrows` is where the main loop stops, not where the board ends: the tightening
      // pass then adds arrows — only ones that block something still free — up to
      // `maxArrows`. And a dense board can run out of legal homes early, which is fine:
      // a 27-arrow board is a good level where a failed one is not.
      expect(arrows.length).toBeGreaterThanOrEqual(Math.ceil(cfg.arrows * 0.85))
      expect(arrows.length).toBeLessThanOrEqual(cfg.maxArrows)

      for (const arrow of arrows) {
        expect(validateShape(cfg.rows, cfg.cols, arrow), `arrow ${arrow.id}`).toBeNull()
        expect(isSelfBlocking(cfg.rows, cfg.cols, arrow)).toBe(false)
        expect(arrow.body.length).toBeGreaterThanOrEqual(1)
        expect(arrow.body.length).toBeLessThanOrEqual(cfg.maxLength)
      }
    })

    it(`${name}: at least one arrow can be tapped on turn one`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = createRng(seed * 104729)
        const { arrows } = generateBoard(cfg, rng)
        const board: Board = { rows: cfg.rows, cols: cfg.cols, arrows }
        expect(freeArrows(board).length).toBeGreaterThan(0)
      }
    })
  }
})

describe('difficulty is aimed at, not hoped for', () => {
  it('the free-at-start ratio falls as the tiers get harder', () => {
    const measure = (cfg: (typeof TIERS)[keyof typeof TIERS]): number => {
      let total = 0
      const samples = 12
      for (let seed = 1; seed <= samples; seed++) {
        total += generateBoard(cfg, createRng(seed * 31337)).freeRatio
      }
      return total / samples
    }

    const warmup = measure(TIERS.warmup)
    const easy = measure(TIERS.easy)
    const medium = measure(TIERS.medium)
    const tricky = measure(TIERS.tricky)

    // Monotonically harder: fewer and fewer arrows can be tapped on the first turn.
    expect(warmup).toBeGreaterThan(easy)
    expect(easy).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(tricky)

    // And the hardest tier really is tight, not merely relatively tighter.
    expect(tricky).toBeLessThan(0.3)
  })
})

describe('determinism', () => {
  it('the same seed bakes the same board', () => {
    const a = generateBoard(TIERS.medium, createRng(99))
    const b = generateBoard(TIERS.medium, createRng(99))
    expect(a).toEqual(b)
  })
})
