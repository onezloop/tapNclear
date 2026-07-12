import { memo, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Arrow } from '../game/types'
import { CELL, STROKE, geometryOf } from '../view/arrowPath'

export type ArrowVisual = 'idle' | 'escaping' | 'blocked' | 'blocker' | 'hinted'

interface Props {
  readonly arrow: Arrow
  readonly rows: number
  readonly cols: number
  readonly visual: ArrowVisual
  readonly interactive: boolean
  readonly onTap?: (id: string) => void
}

/** The arrowhead, drawn at the origin pointing right; the path or the transform places it. */
const HEAD_POINTS = `${CELL * 0.2},0 ${-CELL * 0.13},${CELL * 0.19} ${-CELL * 0.13},${-CELL * 0.19}`

function ArrowShapeImpl({ arrow, rows, cols, visual, interactive, onTap }: Props) {
  const geo = useMemo(() => geometryOf(rows, cols, arrow), [rows, cols, arrow])

  // Everything the animation needs is handed to CSS as custom properties, so the escape is
  // a transition rather than a per-frame JS loop.
  const style = {
    '--path': `path("${geo.d}")`,
    '--body-length': `${geo.bodyLength}px`,
    '--gap': `${geo.totalLength + geo.bodyLength}px`,
    '--exit-offset': `${-geo.totalLength}px`,
    '--head-rest': `${geo.headDistance}px`,
    '--head-exit': `${geo.totalLength}px`,
    '--head-x': `${geo.head.x}px`,
    '--head-y': `${geo.head.y}px`,
    '--head-angle': `${geo.headAngle}deg`,
  } as CSSProperties

  return (
    <g
      className={`arrow arrow--${visual}`}
      style={style}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Arrow pointing ${arrow.dir}`}
      onClick={interactive ? () => onTap?.(arrow.id) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onTap?.(arrow.id)
              }
            }
          : undefined
      }
    >
      {/* A fat invisible copy of the body: the tap target. Hitting a 6px line with a thumb
          is miserable, so the hit area is a good deal wider than the ink. */}
      <path className="arrow__hit" d={geo.bodyD} />
      <path className="arrow__body" d={geo.d} strokeWidth={STROKE} />
      <polygon className="arrow__head" points={HEAD_POINTS} />
    </g>
  )
}

export const ArrowShape = memo(ArrowShapeImpl)
