/**
 * A small seeded PRNG (mulberry32).
 *
 * This is used by the OFFLINE level baker in scripts/. The app itself ships no
 * randomness at all — levels are fixed data. See levels.ts.
 */

export interface Rng {
  /** [0, 1) */
  next(): number
  /** [0, max) */
  int(max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (max: number): number => Math.floor(next() * max)

  const pick = <T,>(items: readonly T[]): T => {
    const item = items[int(items.length)]
    if (item === undefined) throw new Error('cannot pick from an empty list')
    return item
  }

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1)
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    }
    return copy
  }

  return { next, int, pick, shuffle }
}
