/**
 * Rasterises public/icon.svg into the PNGs the platforms actually ask for.
 *
 * An SVG favicon covers desktop browsers, but two places refuse it: iOS wants a PNG for
 * `apple-touch-icon` (a home-screen install falls back to a screenshot of the page without
 * one), and the web manifest wants PNGs for the install prompt.
 *
 * The output is committed, exactly like levels.json — running this is a deliberate act that
 * produces a reviewable diff, not something a build silently redoes. Nobody wants the icon
 * to quietly change because a transitive dependency of a rasteriser did.
 *
 *   npm run gen:icons     # rewrites the PNGs; review the diff
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(here, '..', 'public')
const source = path.join(publicDir, 'icon.svg')

/**
 * Every size has a reason to exist; there is no "just in case" entry here.
 *
 * They are all rendered from the SVG at their target size rather than downscaled from one
 * big PNG. The icon carries 1.6px dots and a 7.5px stroke on a 64-unit grid, and resampling
 * those from 512px down to 180px smears them — rendering each size from the vector keeps
 * every edge crisp.
 */
const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180, why: 'iOS home screen' },
  { file: 'icon-192.png', size: 192, why: 'web manifest, install prompt' },
  { file: 'icon-512.png', size: 512, why: 'web manifest, splash screen' },
]

const svg = readFileSync(source)

for (const { file, size, why } of TARGETS) {
  const out = path.join(publicDir, file)
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`  ${file.padEnd(21)} ${String(size).padStart(3)}px   ${why}`)
}

console.log(`\nRendered ${TARGETS.length} PNGs from icon.svg -> public/`)
