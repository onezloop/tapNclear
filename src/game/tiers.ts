/**
 * The difficulty curve, as data.
 *
 * Three dials, and they ramp together because no one of them is a strong enough lever alone:
 *
 *   GRID        11x11 -> 16x16   more board to take in
 *   FOLDS       2 -> 8 bends     a late arrow is a nested serpent, an early one is a stub
 *   FREE ARROWS 8 -> 1           how many arrows may be tapped on turn one
 *
 * The free-arrow count is the sharp one, and it is only a real dial because the boards are
 * FULL: with no empty cells, an arrow can only be free if its head is on the rim pointing
 * outward, so the baker can simply ration those. At an allowance of 1 there is exactly one
 * arrow on the board you may tap, and fifty others waiting behind it.
 *
 * These are inputs to the OFFLINE baker only. Once baked, a level is fixed data.
 */

import type { TierConfig } from './generator'
import type { Tier } from './types'

export const TOTAL_LEVELS = 100

/** Levels 1-5 are hand-authored in tutorial.json; the baker starts here. */
export const FIRST_GENERATED = 6

/**
 * THE CURVE IS PER-LEVEL, NOT PER-TIER. This is the thing to understand before touching
 * this file.
 *
 * It used to be a lookup of four tier configs, and every level inside a tier got the exact
 * same numbers — which meant levels 51 and 100 were the same board size, the same arrow
 * count, the same fold budget and the same free ratio. Fifty levels of identical difficulty.
 * The campaign felt flat because it WAS flat: it had four steps in it, not a hundred.
 *
 * So difficulty is now interpolated between the anchors below, level by level. Level 73 is
 * genuinely a shade harder than level 72. The tiers survive only as LABELS — a name and a
 * colour in the level picker — and no longer decide anything about how a board is built.
 *
 * Every field ramps in the same direction: bigger board, longer and more folded bodies,
 * fuller board, fewer arrows free on turn one.
 */
interface Anchor extends TierConfig {
  readonly level: number
}

/**
 * `fillRatio` reaches 1 at level 11 and never drops again: from there to the end of the
 * campaign every board is COMPLETELY FULL — not one empty cell.
 *
 * That is not decoration. On a full board an arrow is free if and only if its head is on the
 * rim pointing outward, because any other lane has to run into somebody. So a full board is
 * what makes `freeAllowance` a real dial: set it to 1 and there is precisely one arrow on the
 * whole board you may tap, and the other fifty unwind from it. See generator.ts.
 *
 * Levels 6-10 are the ramp in, filling from three-quarters up to whole, so the jump out of
 * the hand-authored tutorial is not a cliff.
 */
const ANCHORS: readonly Anchor[] = [
  // The first generated board. Same 11x11 grid the tutorial sits on, so the step out of the
  // hand-authored levels is a step in difficulty, not in size.
  {
    level: 6,
    rows: 11,
    cols: 11,
    minLength: 1,
    maxLength: 4,
    maxBends: 2,
    fillRatio: 0.72,
    freeAllowance: 8,
  },
  // Full boards from here to the end.
  {
    level: 11,
    rows: 11,
    cols: 11,
    minLength: 1,
    maxLength: 4,
    maxBends: 2,
    fillRatio: 1,
    freeAllowance: 7,
  },
  {
    level: 40,
    rows: 13,
    cols: 13,
    minLength: 2,
    maxLength: 6,
    maxBends: 4,
    fillRatio: 1,
    freeAllowance: 5,
  },
  {
    level: 70,
    rows: 15,
    cols: 15,
    minLength: 2,
    maxLength: 8,
    maxBends: 6,
    fillRatio: 1,
    freeAllowance: 3,
  },
  // The last board in the game: the biggest grid, the longest and most folded bodies, and a
  // single tappable arrow on a board with no empty cell on it.
  {
    level: 100,
    rows: 16,
    cols: 16,
    minLength: 3,
    maxLength: 10,
    maxBends: 8,
    fillRatio: 1,
    freeAllowance: 1,
  },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The tier config for one specific level, interpolated between the anchors.
 *
 * Integer fields are rounded, so the board size and the fold budget step up at particular
 * levels rather than sliding; `targetFreeRatio` is continuous and falls on every single
 * level. Levels below `FIRST_GENERATED` clamp to the first anchor — nothing bakes them, but
 * returning a coherent config beats returning a surprise.
 */
export function configFor(level: number): TierConfig {
  const clamped = Math.min(Math.max(level, ANCHORS[0]!.level), ANCHORS[ANCHORS.length - 1]!.level)

  let lower = ANCHORS[0]!
  let upper = ANCHORS[ANCHORS.length - 1]!
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i]!
    const b = ANCHORS[i + 1]!
    if (clamped >= a.level && clamped <= b.level) {
      lower = a
      upper = b
      break
    }
  }

  const span = upper.level - lower.level
  const t = span === 0 ? 0 : (clamped - lower.level) / span

  return {
    rows: Math.round(lerp(lower.rows, upper.rows, t)),
    cols: Math.round(lerp(lower.cols, upper.cols, t)),
    minLength: Math.round(lerp(lower.minLength, upper.minLength, t)),
    maxLength: Math.round(lerp(lower.maxLength, upper.maxLength, t)),
    maxBends: Math.round(lerp(lower.maxBends, upper.maxBends, t)),
    fillRatio: lerp(lower.fillRatio, upper.fillRatio, t),
    freeAllowance: Math.round(lerp(lower.freeAllowance, upper.freeAllowance, t)),
  }
}

/**
 * Which tier a campaign level belongs to.
 *
 * This is a LABEL ONLY. It groups the picker and names the board in the HUD; it does not
 * decide anything about how a level is built — `configFor` does, and it does it per level.
 */
export function tierOf(level: number): Tier {
  if (level <= 5) return 'warmup'
  if (level <= 20) return 'easy'
  if (level <= 50) return 'medium'
  return 'tricky'
}

export const TIER_LABEL: Record<Tier, string> = {
  warmup: 'Warm up',
  easy: 'Easy',
  medium: 'Medium',
  tricky: 'Tricky',
}
