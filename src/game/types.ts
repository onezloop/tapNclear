/**
 * The domain vocabulary. No React, no DOM, no rendering concerns.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Cell {
  readonly row: number
  readonly col: number
}

/**
 * An arrow is an orthogonal, self-avoiding walk of cells, ordered tail -> head,
 * plus the direction its head points.
 *
 * For a body of two or more cells, `dir` always continues the final segment: the
 * arrowhead points the way the walk was going. A single-cell arrow has no final
 * segment, so `dir` is its only source of direction.
 */
export interface Arrow {
  readonly id: string
  readonly body: readonly Cell[]
  readonly dir: Direction
}

export interface Board {
  readonly rows: number
  readonly cols: number
  readonly arrows: readonly Arrow[]
}

export type Tier = 'warmup' | 'easy' | 'medium' | 'tricky'

export interface LevelData {
  readonly id: number
  readonly tier: Tier
  readonly rows: number
  readonly cols: number
  readonly arrows: readonly Arrow[]
  /** A known-good escape order (arrow ids). Guaranteed to clear the board. */
  readonly solution: readonly string[]
}

export interface LevelFile {
  readonly version: number
  readonly levels: readonly LevelData[]
}
