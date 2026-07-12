/**
 * Levels are fixed data. This module reads them; nothing in the app generates them.
 */

import raw from '../levels/levels.json'
import { validateShape } from './geometry'
import type { Board, LevelData, LevelFile } from './types'

const file = raw as unknown as LevelFile

export const LEVELS_VERSION = file.version
export const LEVELS: readonly LevelData[] = file.levels
export const LEVEL_COUNT = LEVELS.length

export function getLevel(id: number): LevelData | undefined {
  return LEVELS.find((level) => level.id === id)
}

export function boardOf(level: LevelData): Board {
  return { rows: level.rows, cols: level.cols, arrows: level.arrows }
}

/** Clamps any number — a stale save, a corrupt store — to a level that exists. */
export function clampLevel(id: number): number {
  if (!Number.isFinite(id)) return 1
  return Math.min(Math.max(Math.trunc(id), 1), LEVEL_COUNT)
}

/**
 * Structural check on the level data. The real proof that a level is *playable* is
 * levels.test.ts, which replays every stored solution through the actual rules.
 */
export function validateLevel(level: LevelData): string | null {
  if (level.arrows.length === 0) return `level ${level.id} has no arrows`

  for (const arrow of level.arrows) {
    const problem = validateShape(level.rows, level.cols, arrow)
    if (problem) return `level ${level.id}, arrow ${arrow.id}: ${problem}`
  }

  const ids = new Set(level.arrows.map((a) => a.id))
  if (ids.size !== level.arrows.length) return `level ${level.id} has duplicate arrow ids`
  if (level.solution.length !== level.arrows.length) return `level ${level.id} solution length mismatch`
  if (level.solution.some((id) => !ids.has(id))) return `level ${level.id} solution names an unknown arrow`

  return null
}
