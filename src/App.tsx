import { useCallback, useEffect, useMemo, useState } from 'react'
import { Board } from './components/Board'
import { Hud } from './components/Hud'
import { LevelPicker } from './components/LevelPicker'
import { LevelComplete, OutOfHearts } from './components/Overlays'
import { starsFor as starsEarned } from './game/engine'
import { LEVEL_COUNT, clampLevel, getLevel } from './game/levels'
import { useGameEngine } from './hooks/useGameEngine'
import { useProgress } from './hooks/useProgress'

export default function App() {
  const { progress, recordWin, recordVisit, isUnlocked, starsFor } = useProgress()

  // The URL says nothing about which level is open, and cannot. A ?level= parameter is a
  // back door straight past every lock in the campaign, which makes the progression — and
  // the stars measured against it — meaningless. The board comes from saved progress alone.
  const [levelId, setLevelId] = useState(() => clampLevel(progress.lastPlayed))
  const [pickerOpen, setPickerOpen] = useState(false)

  const level = useMemo(() => getLevel(levelId) ?? getLevel(1)!, [levelId])
  const { state, escaping, tap, hint, restart } = useGameEngine(level)

  const stars = starsEarned(state)

  useEffect(() => {
    recordVisit(levelId)
  }, [levelId, recordVisit])

  useEffect(() => {
    if (state.phase === 'won') recordWin(state.level, stars)
  }, [state.phase, state.level, stars, recordWin])

  const goTo = useCallback(
    (id: number) => {
      const next = clampLevel(id)

      // The picker already disables locked levels; this is the rule itself rather than the
      // presentation of it, so that no other caller can route around it either.
      if (!isUnlocked(next)) return

      setLevelId(next)
      setPickerOpen(false)
    },
    [isUnlocked],
  )

  const nextLevel = useCallback(() => goTo(levelId + 1), [goTo, levelId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key.toLowerCase()) {
        case 'h':
          hint()
          break
        case 'r':
          restart()
          break
        case 'n':
          if (state.phase === 'won' && levelId < LEVEL_COUNT) nextLevel()
          break
        case 'escape':
          setPickerOpen(false)
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hint, restart, nextLevel, state.phase, levelId])

  return (
    <main className="app">
      <Hud state={state} onHint={hint} onRestart={restart} onOpenLevels={() => setPickerOpen(true)} />

      <div className="app__board">
        <Board
          board={state.board}
          escaping={escaping}
          feedback={state.feedback}
          interactive={state.phase === 'playing'}
          onTap={tap}
        />
      </div>

      {state.phase === 'won' ? (
        <LevelComplete level={state.level} stars={stars} onNext={nextLevel} onReplay={restart} />
      ) : null}

      {state.phase === 'lost' ? <OutOfHearts onRetry={restart} /> : null}

      {pickerOpen ? (
        <LevelPicker
          current={levelId}
          isUnlocked={isUnlocked}
          starsFor={starsFor}
          onPick={goTo}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </main>
  )
}
