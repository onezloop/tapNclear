import { useMemo } from 'react'
import type { CSSProperties } from 'react'

const PIECES = 44

const COLOURS = ['#ff4d5f', '#6c7cf5', '#ffc25c', '#3ec6a0', '#ff8fa3']

/**
 * Thrown only for a perfect clear: the board emptied with no hint taken and no heart lost.
 *
 * It is deliberately the ONE loud thing in the whole game. Everywhere else the rule is that
 * nothing moves unless the player did something, and colour means "something happened" — so
 * spending both, once, on the hardest thing a player can do is what gives it any weight. Fire
 * it on every win and it would just be wallpaper.
 */
export function Confetti() {
  // Positions are computed once per mount and never re-randomised, so a re-render cannot
  // make the confetti jump mid-flight.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        style: {
          '--x': `${Math.random() * 100}%`,
          '--drift': `${(Math.random() - 0.5) * 160}px`,
          '--delay': `${Math.random() * 420}ms`,
          '--duration': `${1500 + Math.random() * 1100}ms`,
          '--spin': `${(Math.random() - 0.5) * 900}deg`,
          '--size': `${6 + Math.random() * 6}px`,
          background: COLOURS[i % COLOURS.length],
          borderRadius: i % 3 === 0 ? '50%' : '2px',
        } as CSSProperties,
      })),
    [],
  )

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span key={piece.id} className="confetti__piece" style={piece.style} />
      ))}
    </div>
  )
}
