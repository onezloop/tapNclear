import { describe, expect, it } from 'vitest'
import { exitLane, isSelfBlocking, validateShape } from './geometry'
import { blockersOf, freeArrows, isFree, isSolvable, replaySolution } from './rules'
import type { Arrow, Board, Cell, Direction } from './types'

const c = (row: number, col: number): Cell => ({ row, col })

const arrow = (id: string, dir: Direction, ...body: Cell[]): Arrow => ({ id, dir, body })

const board = (rows: number, cols: number, ...arrows: Arrow[]): Board => ({ rows, cols, arrows })

describe('exitLane', () => {
  it('runs from the head cell to the edge, exclusive of the head', () => {
    // A straight arrow at (2,1) pointing right on a 5x5 board.
    const a = arrow('a', 'right', c(2, 0), c(2, 1))
    expect(exitLane(5, 5, a)).toEqual([c(2, 2), c(2, 3), c(2, 4)])
  })

  it('is empty when the head sits on the rim pointing outward', () => {
    const a = arrow('a', 'right', c(2, 3), c(2, 4))
    expect(exitLane(5, 5, a)).toEqual([])
  })

  it('follows the head, not the tail, for a bent arrow', () => {
    // An L: travels right along row 0, then turns down. Head is (1,1), pointing down.
    const a = arrow('a', 'down', c(0, 0), c(0, 1), c(1, 1))
    expect(exitLane(4, 4, a)).toEqual([c(2, 1), c(3, 1)])
  })
})

describe('the one rule: only the head lane blocks', () => {
  it('an arrow is blocked by an arrow in front of its head', () => {
    const mover = arrow('mover', 'right', c(1, 0))
    const blocker = arrow('blocker', 'up', c(1, 3))
    const b = board(5, 5, mover, blocker)

    expect(blockersOf(b, mover)).toEqual(['blocker'])
    expect(isFree(b, mover)).toBe(false)
  })

  it('lists blockers nearest-first', () => {
    const mover = arrow('mover', 'right', c(1, 0))
    const near = arrow('near', 'up', c(1, 2))
    const far = arrow('far', 'up', c(1, 4))
    const b = board(5, 5, mover, near, far)

    expect(blockersOf(b, mover)).toEqual(['near', 'far'])
  })

  it('an arrow is NOT blocked by an arrow sitting in front of its second prong', () => {
    // The Pi from the plan. Head is the bottom of the RIGHT prong, pointing down.
    // 'under' sits below the LEFT prong. The left prong exits by retracing the head's
    // route, so it never sweeps its own column and 'under' is irrelevant.
    const pi = arrow('pi', 'down', c(2, 1), c(1, 1), c(1, 3), c(2, 3))
    // (that body is not connected — build it properly:)
    const connected = arrow('pi', 'down', c(2, 1), c(1, 1), c(1, 2), c(1, 3), c(2, 3))
    const under = arrow('under', 'up', c(4, 1))
    const b = board(6, 5, connected, under)

    expect(validateShape(6, 5, pi)).not.toBeNull() // sanity: the disconnected one is rejected
    expect(validateShape(6, 5, connected)).toBeNull()
    expect(blockersOf(b, connected)).toEqual([])
    expect(isFree(b, connected)).toBe(true)
  })

  it('an arrow is NOT blocked by an arrow behind its tail', () => {
    const mover = arrow('mover', 'right', c(1, 2), c(1, 3))
    const behind = arrow('behind', 'up', c(1, 0))
    const b = board(5, 5, mover, behind)

    expect(isFree(b, mover)).toBe(true)
  })

  it('an arrow whose head is on the rim pointing out is free no matter how crowded the board', () => {
    const rim = arrow('rim', 'right', c(1, 3), c(1, 4))
    const crowd = arrow('crowd', 'up', c(1, 0))
    const b = board(5, 5, rim, crowd)

    expect(isFree(b, rim)).toBe(true)
  })

  it('an arrow never blocks itself through its own body cells', () => {
    // A U-turn whose tail is beside — but not in front of — its head.
    const u = arrow('u', 'up', c(2, 1), c(3, 1), c(3, 2), c(2, 2))
    const b = board(5, 5, u)

    expect(isFree(b, u)).toBe(true)
  })
})

describe('self-blocking shapes', () => {
  it('detects a spiral whose body lies in front of its own head', () => {
    // Travels down the left, right along the bottom, up the right, then LEFT along the
    // top — so the lane in front of its head runs straight back into its own tail.
    const spiral = arrow(
      'spiral',
      'left',
      c(0, 0), c(1, 0), c(2, 0),
      c(2, 1), c(2, 2),
      c(1, 2), c(0, 2),
      c(0, 1),
    )
    expect(isSelfBlocking(4, 4, spiral)).toBe(true)
    expect(validateShape(4, 4, spiral)).toMatch(/blocks itself/)
  })

  it('accepts straights, Ls and Us, which never self-block', () => {
    expect(isSelfBlocking(5, 5, arrow('s', 'right', c(0, 0), c(0, 1)))).toBe(false)
    expect(isSelfBlocking(5, 5, arrow('l', 'down', c(0, 0), c(0, 1), c(1, 1)))).toBe(false)
    expect(isSelfBlocking(5, 5, arrow('u', 'up', c(2, 1), c(3, 1), c(3, 2), c(2, 2)))).toBe(false)
  })
})

describe('validateShape', () => {
  it('rejects a body that is not orthogonally connected', () => {
    expect(validateShape(5, 5, arrow('a', 'right', c(0, 0), c(0, 2)))).toMatch(/not orthogonally connected/)
  })

  it('rejects a body that revisits a cell', () => {
    expect(validateShape(5, 5, arrow('a', 'right', c(0, 0), c(0, 1), c(0, 0)))).toMatch(/revisits/)
  })

  it('rejects a head direction that contradicts the final segment', () => {
    expect(validateShape(5, 5, arrow('a', 'up', c(0, 0), c(0, 1)))).toMatch(/final segment/)
  })

  it('rejects a body that leaves the board', () => {
    expect(validateShape(3, 3, arrow('a', 'right', c(0, 2), c(0, 3)))).toMatch(/off the board/)
  })

  it('accepts a single cell arrow, whose dir is its only direction', () => {
    expect(validateShape(5, 5, arrow('a', 'up', c(2, 2)))).toBeNull()
  })
})

describe('solvability', () => {
  it('a chain of arrows each blocking the next is solvable from the front', () => {
    const a = arrow('a', 'right', c(0, 2))
    const b1 = arrow('b', 'right', c(0, 1))
    const c1 = arrow('c', 'right', c(0, 0))
    const b = board(3, 4, c1, b1, a)

    expect(freeArrows(b).map((x) => x.id)).toEqual(['a'])
    expect(isSolvable(b)).toBe(true)
    expect(replaySolution(b, ['a', 'b', 'c'])).toEqual({ ok: true })
  })

  it('two arrows blocking each other head-on are unsolvable', () => {
    const a = arrow('a', 'right', c(0, 0))
    const b1 = arrow('b', 'left', c(0, 2))
    const b = board(3, 3, a, b1)

    expect(freeArrows(b)).toEqual([])
    expect(isSolvable(b)).toBe(false)
  })

  it('a single self-blocking arrow makes a board unsolvable', () => {
    const spiral = arrow(
      'spiral',
      'left',
      c(0, 0), c(1, 0), c(2, 0),
      c(2, 1), c(2, 2),
      c(1, 2), c(0, 2),
      c(0, 1),
    )
    expect(isSolvable(board(4, 4, spiral))).toBe(false)
  })
})

describe('replaySolution', () => {
  const a = arrow('a', 'right', c(0, 1))
  const b1 = arrow('b', 'right', c(0, 0))
  const b = board(3, 3, a, b1)

  it('rejects an order that taps a blocked arrow', () => {
    expect(replaySolution(b, ['b', 'a']).ok).toBe(false)
  })

  it('rejects an order that does not clear the board', () => {
    expect(replaySolution(b, ['a']).ok).toBe(false)
  })

  it('accepts the working order', () => {
    expect(replaySolution(b, ['a', 'b']).ok).toBe(true)
  })
})
