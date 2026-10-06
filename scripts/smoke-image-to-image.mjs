// Live smoke test for the image-to-image path: a local PNG is sent back to the
// API as a data-URI reference image and restaged under a new prompt.
//
//   node scripts/smoke-image-to-image.mjs <reference.png> ["prompt"] ["outDir"]
//
// Generate a reference first if you do not have one:
//   node scripts/smoke-text-to-image.mjs

import { join } from 'node:path'
import { homedir } from 'node:os'

import { defaultOutPath, describeKeySource, generate, saveImage } from '../lib/agnes.js'

const reference = process.argv[2]
if (!reference) {
  console.error('usage: node scripts/smoke-image-to-image.mjs <reference.png> ["prompt"] ["outDir"]')
  process.exit(2)
}

const prompt =
  process.argv[3] ||
  'Keep this exact composition and silhouette, but restage it as a snowy winter night with cold blue moonlight and falling snow'
const outDir = process.argv[4] || join(homedir(), 'Desktop', 'agnes-out')

console.log(`[smoke-img2img] key source: ${describeKeySource()}`)
console.log(`[smoke-img2img] reference: ${reference}`)

const started = Date.now()
const result = await generate({ prompt, size: '1K', ratio: '1:1', images: [reference] })
const path = saveImage(result.bytes, defaultOutPath(prompt, outDir))

console.log(
  JSON.stringify(
    {
      ok: true,
      path,
      bytes: result.bytes.length,
      nativePixels: result.nativePixels,
      elapsedMs: Date.now() - started,
    },
    null,
    2,
  ),
)
