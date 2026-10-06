// Live smoke test for the plugin entry point, exercised the way dsh uses it:
// a stub `ctx` carrying `tools.register`, then a real call to the registered
// tool's `execute()` and to the model-facing `output.render()`.
//
//   node scripts/smoke-tool.mjs [outDir]

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { apply, inject, name } from '../lib/index.js'

const outDir = process.argv[2] || join(homedir(), 'Desktop', 'agnes-out')

// --- registration shape ----------------------------------------------------

const registered = []
const ctx = { tools: { register: (tool) => registered.push(tool) } }

apply(ctx, {})

assert.equal(name, 'agnes-image')
assert.deepEqual(inject, ['tools'])
assert.equal(registered.length, 1, 'apply() must register exactly one tool')

const tool = registered[0]
assert.equal(tool.name, 'agnes_image')
assert.ok(tool.description.length > 100, 'the description is what the model chooses on')
assert.deepEqual(tool.parameters.required, ['prompt'])
assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [
  'images',
  'model',
  'out',
  'prompt',
  'ratio',
  'size',
])
assert.equal(typeof tool.execute, 'function')
assert.equal(tool.isConcurrencySafe(), true)

console.log('[smoke-tool] registration shape OK:', tool.name)
console.log('[smoke-tool] parameters:', Object.keys(tool.parameters.properties).join(', '))

// --- a real generation through the tool ------------------------------------

const out = join(outDir, 'smoke-tool-16x9.png')
const value = await tool.execute(
  {
    prompt:
      'A wide cinematic ink-wash band of wheat fields at golden hour, a lone water buffalo silhouette on the horizon, generous empty sky, muted amber and grey palette, soft paper grain',
    size: '1K',
    ratio: '16:9',
    out,
  },
  {},
)

assert.equal(value.ok, true)
assert.equal(value.path, out)
assert.equal(value.nativePixels, '1312x736')
assert.equal(value.ratio, '16:9')
assert.ok(value.bytes > 1000)

console.log('\n[smoke-tool] execute() OK')
console.log(JSON.stringify(value, null, 2))
console.log('\n[smoke-tool] render() as the model would see it:\n' + tool.output.render({}, value)[0].text)
