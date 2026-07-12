import { LEVEL_COUNT } from '../game/levels'
import { Confetti } from './Confetti'

interface WonProps {
  readonly level: number
  readonly stars: number
  readonly onNext: () => void
  readonly onReplay: () => void
}

export function LevelComplete({ level, stars, onNext, onReplay }: WonProps) {
  const last = level >= LEVEL_COUNT

  // Three stars means the board was cleared with no hint and no heart lost. That is the only
  // thing worth throwing confetti for.
  const perfect = stars === 3

  return (
    <Overlay title={perfect ? 'Perfect' : 'Board clear'}>
      {perfect ? <Confetti /> : null}

      <div className="stars" aria-label={`${stars} of 3 stars`}>
        {[1, 2, 3].map((n) => (
          <Star key={n} filled={n <= stars} />
        ))}
      </div>

      {perfect ? <p className="overlay__note">No hints. No collisions.</p> : null}

      <div className="overlay__actions">
        {last ? null : (
          <button type="button" className="overlay__button overlay__button--primary" onClick={onNext} autoFocus>
            Next level
          </button>
        )}
        <button type="button" className="overlay__button" onClick={onReplay}>
          Play again
        </button>
      </div>

      {last ? <p className="overlay__note">That was the last one. Nicely done.</p> : null}
    </Overlay>
  )
}

interface LostProps {
  readonly onRetry: () => void
}

/**
 * Losing is gentle on purpose. No timer to wait out, nothing to buy, no scolding — the
 * board is simply still there, and the only advice it gives is the true one.
 */
export function OutOfHearts({ onRetry }: LostProps) {
  return (
    <Overlay title="Out of hearts">
      <p className="overlay__note">
        The board is still waiting for you. Look for an arrow with nothing in front of its head — remember, only the
        head&rsquo;s lane matters.
      </p>

      <div className="overlay__actions">
        <button type="button" className="overlay__button overlay__button--primary" onClick={onRetry} autoFocus>
          Try again
        </button>
      </div>
    </Overlay>
  )
}

function Overlay({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay__card">
        <h2 className="overlay__title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Star({ filled }: { readonly filled: boolean }) {
  return (
    <svg className={`star ${filled ? 'star--filled' : 'star--empty'}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95Z" />
    </svg>
  )
}
