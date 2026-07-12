import { STARTING_HEARTS } from '../game/engine'
import type { GameState } from '../game/engine'
import { TIER_LABEL } from '../game/tiers'
import { getLevel } from '../game/levels'

interface Props {
  readonly state: GameState
  readonly onHint: () => void
  readonly onRestart: () => void
  readonly onOpenLevels: () => void
}

/**
 * Hearts, progress, and two quiet buttons. Nothing else.
 *
 * No timer, no score, no streak, no combo. The reference boards show hearts and a progress
 * bar and stop there, and they are right to: anything that ticks or climbs while a player
 * is thinking is pulling attention off the board, which is the only thing worth looking at.
 */
export function Hud({ state, onHint, onRestart, onOpenLevels }: Props) {
  const cleared = state.totalArrows - state.board.arrows.length
  const progress = state.totalArrows === 0 ? 0 : cleared / state.totalArrows
  const tier = getLevel(state.level)?.tier

  return (
    <header className="hud">
      <div className="hud__hearts" role="status" aria-label={`${state.hearts} of ${STARTING_HEARTS} hearts left`}>
        {Array.from({ length: STARTING_HEARTS }, (_, i) => (
          <Heart key={i} filled={i < state.hearts} />
        ))}
      </div>

      <div
        className="hud__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={state.totalArrows}
        aria-valuenow={cleared}
        aria-label="Arrows cleared"
      >
        <div className="hud__progress-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className="hud__bar">
        <button type="button" className="hud__level" onClick={onOpenLevels}>
          Level {state.level}
          {tier ? <span className="hud__tier">{TIER_LABEL[tier]}</span> : null}
        </button>

        <div className="hud__actions">
          <button type="button" className="hud__button" onClick={onHint} title="Hint (H)">
            Hint
          </button>
          <button type="button" className="hud__button" onClick={onRestart} title="Restart (R)">
            Restart
          </button>
        </div>
      </div>
    </header>
  )
}

function Heart({ filled }: { readonly filled: boolean }) {
  return (
    <svg className={`heart ${filled ? 'heart--filled' : 'heart--spent'}`} viewBox="0 0 24 22" aria-hidden="true">
      <path d="M12 21 3.6 12.4A5.7 5.7 0 0 1 12 4.8a5.7 5.7 0 0 1 8.4 7.6Z" />
    </svg>
  )
}
