import { describe, expect, it } from 'vitest'
import type { Arrow } from '../game/types'
import { CELL, geometryOf } from './arrowPath'

const straight: Arrow = {
  id: 'a',
  dir: 'right',
  body: [
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ],
}

/** An L: right along row 0, then down. Head at (1,1), pointing down. */
const bent: Arrow = {
  id: 'b',
  dir: 'down',
  body: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ],
}

describe('arrow geometry', () => {
  it('draws the body through every cell centre, and keeps going off the board', () => {
    const geo = geometryOf(6, 6, bent)

    // Body path: stub, then (0,0) -> (0,1) -> (1,1), and it stops at the head.
    expect(geo.bodyD).toContain('20 20') // centre of (0,0)
    expect(geo.bodyD).toContain('60 20') // centre of (0,1)
    expect(geo.bodyD).toContain('60 60') // centre of (1,1) = the head
    expect(geo.bodyD.split('L')).toHaveLength(4) // stub + 3 cells

    // The full path continues past the head, downward, well beyond the last row.
    expect(geo.d.length).toBeGreaterThan(geo.bodyD.length)
  })

  it('measures the dash so that at rest it covers exactly the body', () => {
    const geo = geometryOf(6, 6, bent)
    // Two segments between three cells, plus the tail stub.
    expect(geo.bodyLength).toBeCloseTo(2 * CELL + CELL * 0.34)
    expect(geo.headDistance).toBe(geo.bodyLength)
  })

  it('runs out far enough for the TAIL to clear the board, not just the head', () => {
    const geo = geometryOf(6, 6, bent)

    // Head is at row 1 of 6, so it needs 5 more cells to be out. The tail is 2 cells
    // behind it, so the path must run further than the head's own journey — otherwise the
    // body would still be sitting on the board when the animation ended.
    const headJourney = 5 * CELL
    expect(geo.totalLength - geo.bodyLength).toBeGreaterThan(headJourney)
  })

  it('points the head the way the arrow points', () => {
    expect(geometryOf(6, 6, straight).headAngle).toBe(0) // right
    expect(geometryOf(6, 6, bent).headAngle).toBe(90) // down
  })

  it('gives a one-cell arrow a visible body, not a dot', () => {
    const single: Arrow = { id: 'c', dir: 'up', body: [{ row: 3, col: 3 }] }
    expect(geometryOf(6, 6, single).bodyLength).toBeGreaterThan(0)
  })
})
