/**
 * A tuning aid, not part of the game. Prints the difficulty curve the baker actually
 * produces, so the curve can be steered by measurement rather than by hope.
 *
 *   npx tsx scripts/measure-curve.ts
 *
 * What to look for, top to bottom: `fill` reaching 1.00 by level 11 and staying there,
 * `free` falling towards 1, and `folds` climbing. `free` is a COUNT, not a ratio — on a full
 * board it is the number of arrows whose head is on the rim pointing outward, and it is the
 * number of arrows the player may tap on turn one.
 */

import { bendCount } from '../src/game/geometry'
import { generateBoard } from '../src/game/generator'
import { createRng } from '../src/game/rng'
import { FIRST_GENERATED, TOTAL_LEVELS, configFor, tierOf } from '../src/game/tiers'

const SAMPLES = 6
const STEP = 10

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length

console.log('level  tier     grid   fill   arrows  free(allow)  maxfolds  avglen')

for (let level = FIRST_GENERATED; level <= TOTAL_LEVELS; level += STEP) {
  const cfg = configFor(level)

  const fills: number[] = []
  const counts: number[] = []
  const frees: number[] = []
  const folds: number[] = []
  const lens: number[] = []

  for (let seed = 1; seed <= SAMPLES; seed++) {
    const board = generateBoard(cfg, createRng(level * 7919 + seed * 31337))
    fills.push(board.fill)
    counts.push(board.arrows.length)
    frees.push(board.freeRatio * board.arrows.length)
    folds.push(Math.max(...board.arrows.map((a) => bendCount(a))))
    lens.push(mean(board.arrows.map((a) => a.body.length)))
  }

  console.log(
    `${String(level).padStart(5)}  ${tierOf(level).padEnd(7)}  ${`${cfg.rows}x${cfg.cols}`.padEnd(5)}  ` +
      `${mean(fills).toFixed(2)}   ${mean(counts).toFixed(1).padStart(5)}   ` +
      `${mean(frees).toFixed(1).padStart(4)} (${cfg.freeAllowance})     ` +
      `${mean(folds).toFixed(1).padStart(5)}     ${mean(lens).toFixed(1)}`,
  )
}
