import { LEVELS } from '../game/levels'
import { TIER_LABEL } from '../game/tiers'
import type { Tier } from '../game/types'

interface Props {
  readonly current: number
  readonly isUnlocked: (level: number) => boolean
  readonly starsFor: (level: number) => number
  readonly onPick: (level: number) => void
  readonly onClose: () => void
}

export function LevelPicker({ current, isUnlocked, starsFor, onPick, onClose }: Props) {
  const tiers = groupByTier()

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Choose a level">
      <div className="overlay__card overlay__card--wide">
        <div className="picker__header">
          <h2 className="overlay__title">Levels</h2>
          <button type="button" className="overlay__button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>

        <div className="picker__scroll">
          {tiers.map(({ tier, levels }) => (
            <section key={tier} className="picker__tier">
              <h3 className="picker__tier-name">{TIER_LABEL[tier]}</h3>
              <div className="picker__grid">
                {levels.map((id) => {
                  const unlocked = isUnlocked(id)
                  const stars = starsFor(id)

                  // Every level shows its number, locked or not. Hiding the numbers behind
                  // dots hid the shape of the campaign — how far it runs, how far you are
                  // through it, what is coming — which is most of what a level grid is for.
                  return (
                    <button
                      key={id}
                      type="button"
                      className={[
                        'picker__cell',
                        id === current ? 'picker__cell--current' : '',
                        unlocked ? '' : 'picker__cell--locked',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={!unlocked}
                      onClick={() => onPick(id)}
                      aria-label={unlocked ? `Level ${id}, ${stars} of 3 stars` : `Level ${id}, locked`}
                    >
                      <span className="picker__number">{id}</span>
                      <span className="picker__stars" aria-hidden="true">
                        {unlocked ? '★'.repeat(stars) : <Lock />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function Lock() {
  return (
    <svg className="picker__lock" viewBox="0 0 12 14" aria-hidden="true">
      <path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" strokeWidth="1.6" />
      <rect x="1.5" y="6" width="9" height="7" rx="1.6" stroke="none" />
    </svg>
  )
}

function groupByTier(): { tier: Tier; levels: number[] }[] {
  const groups: { tier: Tier; levels: number[] }[] = []

  for (const level of LEVELS) {
    const last = groups[groups.length - 1]
    if (last && last.tier === level.tier) last.levels.push(level.id)
    else groups.push({ tier: level.tier, levels: [level.id] })
  }

  return groups
}
