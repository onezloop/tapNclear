/**
 * Turning an arrow into SVG geometry.
 *
 * This is the view's half of the rule. An arrow leaves head-first ALONG ITS OWN BODY, so
 * the escape animation must thread the shape out through its own route — anything that
 * slid the whole shape sideways would be showing the player a rule the game does not have.
 *
 * The trick that makes it a pure CSS animation with no JS per frame:
 *
 *   1. Build ONE path that runs from behind the tail, through every body cell, out past
 *      the head, and off the board — the arrow's entire life story as a single line.
 *   2. Draw the body as a DASH on that path, exactly as long as the body. At rest the dash
 *      sits at the start, so it covers precisely the body cells and nothing else.
 *   3. To escape, slide the dash along the path (stroke-dashoffset) and slide the arrowhead
 *      along the same path (offset-path). The shape flows through its own bends and out.
 *
 * The SVG clips at the board edge, so the arrow simply leaves.
 */

import { directionBetween, step } from '../game/geometry'
import type { Arrow, Cell, Direction } from '../game/types'

/** User units per cell. The board scales as a whole via the SVG viewBox. */
export const CELL = 40

export const STROKE = 6.5
export const DOT_RADIUS = 2

/** A short stub behind the tail, so a one-cell arrow is still a visible line, not a dot. */
const TAIL_STUB = CELL * 0.34

const UNIT: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const ANGLE: Record<Direction, number> = { right: 0, down: 90, left: 180, up: -90 }

export interface Point {
  x: number
  y: number
}

export function centerOf(cell: Cell): Point {
  return { x: (cell.col + 0.5) * CELL, y: (cell.row + 0.5) * CELL }
}

export interface ArrowGeometry {
  /** The whole path: behind the tail, through the body, out past the board edge. */
  readonly d: string
  /**
   * The body alone, stopping at the head.
   *
   * The tap target is a fat stroke on THIS, not on `d` — a hit area that ran the full
   * length of `d` would stretch off the board and swallow taps meant for the arrows lying
   * in this one's lane, which are exactly the arrows a player most wants to tap.
   */
  readonly bodyD: string
  /** Length of the visible body dash, in user units. */
  readonly bodyLength: number
  /** Length of the entire path. Slide the dash this far and the arrow is gone. */
  readonly totalLength: number
  /** Where the arrowhead sits at rest, as a distance along the path. */
  readonly headDistance: number
  /** Resting position and angle of the head — the fallback when offset-path is unavailable. */
  readonly head: Point
  readonly headAngle: number
}

/**
 * The direction the body leaves its tail in. For a one-cell arrow there is no segment to
 * read it from, so the head direction is all we have.
 */
function tailDirection(arrow: Arrow): Direction {
  if (arrow.body.length < 2) return arrow.dir
  return directionBetween(arrow.body[0]!, arrow.body[1]!)!
}

/** How many cells the head must travel to be clear of the board entirely. */
function cellsToExit(rows: number, cols: number, arrow: Arrow): number {
  let cursor = arrow.body[arrow.body.length - 1]!
  let distance = 0
  while (cursor.row >= 0 && cursor.row < rows && cursor.col >= 0 && cursor.col < cols) {
    cursor = step(cursor, arrow.dir)
    distance++
  }
  return distance
}

export function geometryOf(rows: number, cols: number, arrow: Arrow): ArrowGeometry {
  const centers = arrow.body.map(centerOf)
  const headCenter = centers[centers.length - 1]!

  // Start a little behind the tail, so the stroke opens with a rounded cap rather than
  // beginning abruptly in the middle of a cell.
  const back = UNIT[tailDirection(arrow)]
  const start: Point = {
    x: centers[0]!.x - back.x * TAIL_STUB,
    y: centers[0]!.y - back.y * TAIL_STUB,
  }

  // Run the path far enough past the edge that the TAIL clears the board too, not just
  // the head — the whole body has to follow the head out.
  const forward = UNIT[arrow.dir]
  const runOut = (cellsToExit(rows, cols, arrow) + arrow.body.length) * CELL
  const end: Point = {
    x: headCenter.x + forward.x * runOut,
    y: headCenter.y + forward.y * runOut,
  }

  const toPath = (points: Point[]): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`).join(' ')

  const d = toPath([start, ...centers, end])
  const bodyD = toPath([start, ...centers])

  const bodyLength = TAIL_STUB + (arrow.body.length - 1) * CELL

  return {
    d,
    bodyD,
    bodyLength,
    totalLength: bodyLength + runOut,
    headDistance: bodyLength,
    head: headCenter,
    headAngle: ANGLE[arrow.dir],
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
