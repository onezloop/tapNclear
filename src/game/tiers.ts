/**
 * The difficulty curve, as data.
 *
 * `targetFreeRatio` is the real dial: how few arrows may be tapped on turn one. A big
 * board where everything is already free plays easier than a small board where one
 * arrow can move and everything else unwinds from it — so the curve is expressed in
 * that, not in arrow counts.
 *
 * These are inputs to the OFFLINE baker only. Once baked, a level is fixed data.
 */

import type { TierConfig } from './generator'
import type { Tier } from './types'

/**
 * `arrows` is where the RANDOM pass stops. `maxArrows` is where the TIGHTENING pass may go.
 * The gap between them is where the difficulty comes from, and it wants to be wide.
 *
 * This is the least obvious thing in the file, and it is worth stating plainly: a LOW base
 * count makes a HARDER board. The random pass scatters arrows wherever they legally fit; the
 * tightening pass places them only where they block something still free. So every arrow the
 * random pass lays down is a cell the tightening pass can no longer use — and when the board
 * is packed, tightening finds no legal home, gives up early, and the free arrows stay free.
 * Dropping the tricky tier's base from 30 arrows to 22, on the same board, took it from 15%
 * free at the start to 9%. Same size, same ceiling, far harder — just more room to work in.
 */
export const TIERS: Record<Tier, TierConfig> = {
  warmup: { rows: 6, cols: 6, arrows: 6, maxArrows: 10, minLength: 1, maxLength: 3, maxBends: 1, targetFreeRatio: 0.3 },
  easy: { rows: 9, cols: 9, arrows: 14, maxArrows: 24, minLength: 1, maxLength: 4, maxBends: 2, targetFreeRatio: 0.18 },
  medium: { rows: 11, cols: 11, arrows: 20, maxArrows: 36, minLength: 2, maxLength: 5, maxBends: 2, targetFreeRatio: 0.12 },
  tricky: { rows: 14, cols: 14, arrows: 22, maxArrows: 60, minLength: 2, maxLength: 6, maxBends: 3, targetFreeRatio: 0.07 },
}

/** Which tier a campaign level belongs to. */
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

export const TOTAL_LEVELS = 100
