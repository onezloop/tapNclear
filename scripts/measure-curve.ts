/**
 * A tuning aid, not part of the game. Prints the difficulty curve the baker actually
 * produces, so the tier configs can be steered by measurement rather than by hope.
 *
 *   npx tsx scripts/measure-curve.ts
 */

import { generateBoard } from '../src/game/generator'
import { createRng } from '../src/game/rng'
import { TIERS } from '../src/game/tiers'

const SAMPLES = 12

for (const [name, cfg] of Object.entries(TIERS)) {
  const ratios: number[] = []
  const started = Date.now()
  for (let seed = 1; seed <= SAMPLES; seed++) {
    ratios.push(generateBoard(cfg, createRng(seed * 31337)).freeRatio)
  }
  const average = ratios.reduce((sum, r) => sum + r, 0) / ratios.length
  const perBoard = (Date.now() - started) / SAMPLES

  console.log(
    `${name.padEnd(7)} target=${cfg.targetFreeRatio.toFixed(2)}  actual=${average.toFixed(3)}  ` +
      `range=[${Math.min(...ratios).toFixed(2)}, ${Math.max(...ratios).toFixed(2)}]  ` +
      `${perBoard.toFixed(0)}ms/board`,
  )
}
