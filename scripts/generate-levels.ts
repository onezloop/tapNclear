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

import { bendCount } from '../src/game/geometry'
import { generateBoard } from '../src/game/generator'
import { createRng } from '../src/game/rng'
import { replaySolution } from '../src/game/rules'
import { TOTAL_LEVELS, configFor, tierOf } from '../src/game/tiers'
import type { Board, LevelData, LevelFile } from '../src/game/types'
import tutorial from '../src/levels/tutorial.json'

/**
 * Bump only when deliberately reshuffling the campaign; it discards saved progress.
 *
 * 2: every board changed — the campaign now opens on an 11x11 grid instead of a 6x6 and
 *    grows to 15x15, and starts at 10% free rather than 30%.
 * 3: every board changed again — boards are now built in escape order and are COMPLETELY
 *    FULL from level 11 on, with the number of arrows tappable on turn one rationed down to
 *    one. Stars earned on the old, half-empty boards do not describe these.
 */
const LEVELS_VERSION = 3

/** Changing this reshuffles every generated level. Don't, without meaning to. */
const MASTER_SEED = 20260711

const here = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(here, '../src/levels/levels.json')

const handAuthored = tutorial.levels as unknown as LevelData[]
const levels: LevelData[] = [...handAuthored]

for (let id = handAuthored.length + 1; id <= TOTAL_LEVELS; id++) {
  const tier = tierOf(id)
  // Per LEVEL, not per tier: level 73 is built to be a shade harder than level 72.
  const cfg = configFor(id)

  // One seed is enough now. The old baker had to roll a level fourteen times and keep the
  // best, because how hard a board came out was a matter of luck. Difficulty is no longer
  // luck: the board is full by construction and the tappable arrows are rationed by
  // `freeAllowance`, so what comes out is what the curve asked for.
  const rng = createRng(MASTER_SEED + id * 7919)
  const { arrows, solution, freeRatio, fill } = generateBoard(cfg, rng)

  // The promise this whole rewrite exists to keep. A board with a hole in it at level 40
  // would be a silent regression — every arrow would still escape, the tests would still
  // pass, and the game would just quietly be easier than it says it is.
  //
  // Counted in CELLS, not compared as ratios: a target of 0.888 on a 121-cell grid means 107
  // cells, which is a fill of 0.8843, and a ratio comparison fails itself on the rounding.
  const cells = cfg.rows * cfg.cols
  const filled = Math.round(fill * cells)
  const wanted = Math.round(cells * cfg.fillRatio)
  if (filled < wanted) {
    throw new Error(`level ${id} filled only ${filled} of ${cells} cells, wanted ${wanted}`)
  }
  levels.push({ id, tier, rows: cfg.rows, cols: cfg.cols, arrows, solution })

  if (id % 10 === 0 || id === TOTAL_LEVELS) {
    const folds = Math.max(...arrows.map((a) => bendCount(a)))
    const tappable = Math.round(freeRatio * arrows.length)
    process.stdout.write(
      `  level ${String(id).padStart(3)}  ${tier.padEnd(7)}  ${cfg.rows}x${cfg.cols}  ` +
        `${String(Math.round(fill * 100)).padStart(3)}% full  ` +
        `${String(arrows.length).padStart(2)} arrows  up to ${folds} folds  ` +
        `${tappable} tappable on turn one\n`,
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
