// Live smoke test: one text-to-image generation, saved to disk.
//
// Hits the real API and costs a real request, so it is run by hand rather than
// by `node --test`:
//
//   node scripts/smoke-text-to-image.mjs ["prompt"] ["outDir"] [size] [ratio]
//
// Requires a key in AGNES_AI_API_KEY or ~/.dsh/agnes_key.txt.

import { join } from 'node:path'
import { homedir } from 'node:os'

import { defaultOutPath, describeKeySource, generate, saveImage } from '../lib/agnes.js'

const prompt =
  process.argv[2] ||
  'A minimal ink-wash illustration of a water buffalo silhouette at dusk, vast negative space, warm amber sky, soft grain'
const outDir = process.argv[3] || join(homedir(), 'Desktop', 'agnes-out')
const size = process.argv[4] || '1K'
const ratio = process.argv[5] || '1:1'

console.log(`[smoke] key source: ${describeKeySource()}`)

const started = Date.now()
const result = await generate({ prompt, size, ratio })
const path = saveImage(result.bytes, defaultOutPath(result.prompt, outDir))

console.log(
  JSON.stringify(
    {
      ok: true,
      path,
      bytes: result.bytes.length,
      nativePixels: result.nativePixels,
      url: result.url,
      revisedPrompt: result.revisedPrompt,
      elapsedMs: Date.now() - started,
    },
    null,
    2,
  ),
)
