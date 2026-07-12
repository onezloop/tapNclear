/**
 * Bakes the campaign. Run explicitly, never at runtime:
 *
 *   npm run gen:levels     # rewrites src/levels/levels.json; review the diff
 *   npm test               # replays every level's solution against the real rules
 *
 * The output is COMMITTED and is the source of truth for every level in the game. The app
 * imports the JSON and ships no generator at all.
 *
 * Why bake rather than seed the generator at runtime: a seeded generator is only
 * deterministic while the generator code stands still. Change one heuristic and every
 * level number silently maps to a different board, breaking saved progress, star records
 * and any walkthrough anyone wrote. Baking turns "reproducible" into "immutable" — a
 * puzzle can only change through a reviewed diff to a JSON file.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { generateBoard } from '../src/game/generator'
import { createRng } from '../src/game/rng'
import { replaySolution } from '../src/game/rules'
import { TIERS, TOTAL_LEVELS, tierOf } from '../src/game/tiers'
import type { Board, LevelData, LevelFile } from '../src/game/types'
import tutorial from '../src/levels/tutorial.json'

/** Bump only when deliberately reshuffling the campaign; it discards saved progress. */
const LEVELS_VERSION = 1

/** Changing this reshuffles every generated level. Don't, without meaning to. */
const MASTER_SEED = 20260711

const here = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(here, '../src/levels/levels.json')

const handAuthored = tutorial.levels as unknown as LevelData[]
const levels: LevelData[] = [...handAuthored]

for (let id = handAuthored.length + 1; id <= TOTAL_LEVELS; id++) {
  const tier = tierOf(id)
  const cfg = TIERS[tier]

  // A per-level seed, so re-baking one level does not disturb its neighbours.
  const rng = createRng(MASTER_SEED + id * 7919)
  const { arrows, solution, freeRatio } = generateBoard(cfg, rng)

  levels.push({ id, tier, rows: cfg.rows, cols: cfg.cols, arrows, solution })

  if (id % 10 === 0 || id === TOTAL_LEVELS) {
    process.stdout.write(
      `  level ${String(id).padStart(3)}  ${tier.padEnd(7)}  ${String(arrows.length).padStart(2)} arrows  ` +
        `${(freeRatio * 100).toFixed(0)}% free at start\n`,
    )
  }
}

// Prove every level before it is allowed anywhere near the file. The guard test in
// levels.test.ts does this again on the committed data, but a broken board should never
// reach disk in the first place.
for (const level of levels) {
  const board: Board = { rows: level.rows, cols: level.cols, arrows: level.arrows }
  const replay = replaySolution(board, level.solution)
  if (!replay.ok) throw new Error(`level ${level.id} is not solvable: ${replay.reason}`)
}

const file: LevelFile = { version: LEVELS_VERSION, levels }
writeFileSync(OUTPUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8')

console.log(`\nBaked ${levels.length} levels (${handAuthored.length} hand-authored) -> ${OUTPUT}`)
