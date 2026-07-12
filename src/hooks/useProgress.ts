import { useCallback, useEffect, useState } from 'react'
import { LEVELS_VERSION } from '../game/levels'

/**
 * Renaming this key orphans every player's saved progress — stars and unlocked levels are
 * read from it by name and nothing migrates them. It was safe to change while the game was
 * unreleased. Once it ships, it is frozen: rename the game all you like, not this.
 */
const STORAGE_KEY = 'tapnclear/progress'

export interface Progress {
  readonly version: number
  /** The highest level the player may open. */
  readonly unlocked: number
  /** Best stars earned per level. */
  readonly stars: Readonly<Record<number, number>>
  /**
   * The board the player was last on, so a refresh puts them back where they were.
   *
   * `unlocked` alone is not enough for this: a player who reaches level 40 and then goes
   * back to replay level 12 should reopen on 12, not be shunted forward to 40.
   */
  readonly lastPlayed: number
}

const FRESH: Progress = { version: LEVELS_VERSION, unlocked: 1, stars: {}, lastPlayed: 1 }

/**
 * Progress in localStorage, and nowhere else. No account, no backend, no network.
 *
 * A version mismatch discards the save rather than migrating it: if the campaign is ever
 * deliberately reshuffled, level 37 is a different board, and showing stars earned on the
 * old one would be a lie.
 */
function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return FRESH

    const saved = JSON.parse(raw) as Partial<Progress>
    if (saved.version !== LEVELS_VERSION) return FRESH

    return {
      version: LEVELS_VERSION,
      unlocked: typeof saved.unlocked === 'number' ? saved.unlocked : 1,
      stars: saved.stars ?? {},
      lastPlayed: typeof saved.lastPlayed === 'number' ? saved.lastPlayed : 1,
    }
  } catch {
    // A corrupt or unavailable store (private mode, disabled storage) must not stop the
    // game from being played — it just means progress is not remembered.
    return FRESH
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    } catch {
      /* storage unavailable; play on regardless */
    }
  }, [progress])

  const recordWin = useCallback((level: number, stars: number) => {
    setProgress((current) => ({
      ...current,
      unlocked: Math.max(current.unlocked, level + 1),
      stars: { ...current.stars, [level]: Math.max(current.stars[level] ?? 0, stars) },
    }))
  }, [])

  const recordVisit = useCallback((level: number) => {
    // Bail out when nothing changed, or every render would write a new object, re-run the
    // save effect, and re-render — a loop.
    setProgress((current) => (current.lastPlayed === level ? current : { ...current, lastPlayed: level }))
  }, [])

  const isUnlocked = useCallback((level: number) => level <= progress.unlocked, [progress.unlocked])

  const starsFor = useCallback((level: number) => progress.stars[level] ?? 0, [progress.stars])

  return { progress, recordWin, recordVisit, isUnlocked, starsFor } as const
}
