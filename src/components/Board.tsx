import { useMemo } from 'react'
import type { Feedback } from '../game/engine'
import type { Arrow, Board as BoardModel } from '../game/types'
import { CELL, DOT_RADIUS, centerOf } from '../view/arrowPath'
import type { EscapingArrow } from '../view/types'
import { ArrowShape } from './ArrowShape'
import type { ArrowVisual } from './ArrowShape'

interface Props {
  readonly board: BoardModel
  /** Arrows that have already left the model but are still animating out. */
  readonly escaping: readonly EscapingArrow[]
  readonly feedback: Feedback | null
  readonly interactive: boolean
  readonly onTap: (id: string) => void
}

const MARGIN = CELL * 0.4

export function Board({ board, escaping, feedback, interactive, onTap }: Props) {
  const width = board.cols * CELL
  const height = board.rows * CELL

  // Dots mark the empty cells, exactly as the reference boards do. They give the eye a
  // grid to read the arrows against without drawing a single line.
  const dots = useMemo(() => {
    const occupied = new Set<string>()
    for (const arrow of board.arrows) {
      for (const cell of arrow.body) occupied.add(`${cell.row},${cell.col}`)
    }

    const points = []
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        if (!occupied.has(`${row},${col}`)) points.push(centerOf({ row, col }))
      }
    }
    return points
  }, [board])

  const visualFor = (arrow: Arrow): ArrowVisual => {
    if (!feedback) return 'idle'
    if (feedback.kind === 'blocked' && feedback.arrowId === arrow.id) return 'blocked'
    if (feedback.kind === 'blocked' && feedback.blockerIds.includes(arrow.id)) return 'blocker'
    if (feedback.kind === 'hint' && feedback.arrowId === arrow.id) return 'hinted'
    return 'idle'
  }

  return (
    <svg
      className="board"
      viewBox={`${-MARGIN} ${-MARGIN} ${width + MARGIN * 2} ${height + MARGIN * 2}`}
      role="group"
      aria-label={`Puzzle board, ${board.arrows.length} arrows left`}
    >
      <g className="board__dots">
        {dots.map((point) => (
          <circle key={`${point.x},${point.y}`} cx={point.x} cy={point.y} r={DOT_RADIUS} />
        ))}
      </g>

      {board.arrows.map((arrow) => (
        <ArrowShape
          key={arrow.id}
          arrow={arrow}
          rows={board.rows}
          cols={board.cols}
          visual={visualFor(arrow)}
          interactive={interactive}
          onTap={onTap}
        />
      ))}

      {/* Arrows the model has already removed, still threading their way off the board.
          They are rendered from a copy held by the hook — the reducer stays synchronous
          and owns no timers. */}
      {escaping.map(({ arrow, armed }) => (
        <ArrowShape
          key={`escaping-${arrow.id}`}
          arrow={arrow}
          rows={board.rows}
          cols={board.cols}
          visual={armed ? 'escaping' : 'idle'}
          interactive={false}
        />
      ))}
    </svg>
  )
}
