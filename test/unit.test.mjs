// Unit tests for the host-side modules. No network, no dsh, no side effects:
// every filesystem test runs inside its own throwaway directory.
//
//   node --test test/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import {
  ENDPOINT,
  IMAGE_MODELS,
  MODEL,
  MODEL_IDS,
  NATIVE_PIXELS,
  RATIOS,
  SIZES,
  isSize,
  nativePixelsFor,
  slugify,
  defaultOutPath,
  defaultKeyFiles,
  PRIMARY_KEY_FILE,
} from '../lib/agnes.js'

import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  loadSettings,
  saveSettings,
  maskKey,
  readKeyFile,
  writeKeyFile,
  keyFileExists,
} from '../lib/settings.js'

import { appendHistory, listHistory, historyCount, clearHistory, historyPaths } from '../lib/history.js'

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'agnes-test-'))
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) }
}

// ---------------------------------------------------------------------------
// agnes.js — the API surface
// ---------------------------------------------------------------------------

test('the image model catalog is non-empty and internally consistent', () => {
  assert.ok(IMAGE_MODELS.length >= 1)
  for (const entry of IMAGE_MODELS) {
    assert.match(entry.id, /^agnes-image-/)
    assert.equal(typeof entry.label, 'string')
    assert.ok(entry.label.length > 0)
  }
  assert.deepEqual(MODEL_IDS, IMAGE_MODELS.map((m) => m.id))
  assert.equal(MODEL, IMAGE_MODELS[0].id)
  assert.equal(new Set(MODEL_IDS).size, MODEL_IDS.length, 'model ids must be unique')
})

test('the native pixel table covers every ratio x tier combination', () => {
  assert.equal(RATIOS.length, 8)
  assert.deepEqual(SIZES, ['1K', '2K', '3K', '4K'])
  for (const ratio of RATIOS) {
    assert.ok(NATIVE_PIXELS[ratio], `missing ratio ${ratio}`)
    for (const size of SIZES) {
      assert.match(NATIVE_PIXELS[ratio][size], /^\d+x\d+$/, `${ratio} ${size}`)
    }
  }
  // Every aspect ratio in the table must actually match its stated shape.
  for (const ratio of RATIOS) {
    const [w, h] = NATIVE_PIXELS[ratio]['1K'].split('x').map(Number)
    const [rw, rh] = ratio.split(':').map(Number)
    assert.ok(
      Math.abs(w / h - rw / rh) < 0.01,
      `${ratio} 1K is ${w}x${h}, which is not ${ratio}`,
    )
  }
})

test('isSize accepts tiers and literal pixel sizes, rejects everything else', () => {
  assert.ok(isSize('2K'))
  assert.ok(isSize('1024x768'))
  assert.ok(!isSize('2k'), 'tiers are case-sensitive')
  assert.ok(!isSize('huge'))
  assert.ok(!isSize(''))
  assert.ok(!isSize(null))
  assert.ok(!isSize(2048))
})

test('nativePixelsFor predicts tiers and passes literal sizes through', () => {
  assert.equal(nativePixelsFor('1K', '16:9'), '1312x736')
  assert.equal(nativePixelsFor('4K', '1:1'), '4096x4096')
  assert.equal(nativePixelsFor('1024x768', '1:1'), '1024x768')
  assert.equal(nativePixelsFor('1K', 'nonsense'), null)
  assert.equal(nativePixelsFor('9K', '1:1'), null)
})

test('slugify produces a short, filesystem-safe stem', () => {
  assert.equal(slugify('A Red Lantern!'), 'a-red-lantern')
  assert.equal(slugify('   '), 'image')
  assert.equal(slugify('---'), 'image')
  assert.ok(slugify('x'.repeat(200)).length <= 48)
  assert.ok(!/[-]$/.test(slugify('hello world---')))
  assert.ok(!/[^a-z0-9-]/.test(slugify('汉语 prompt with 汉字')))
})

test('defaultOutPath lands under the output directory and ends in .png', () => {
  const path = defaultOutPath('a red lantern', 'C:\\out')
  assert.ok(path.startsWith('C:\\out'))
  assert.match(path, /\.png$/)
  assert.match(path, /a-red-lantern/)
})

test('the canonical key file is the documented one, consulted first', () => {
  assert.equal(basename(PRIMARY_KEY_FILE), 'agnes_key.txt')
  assert.equal(basename(dirname(PRIMARY_KEY_FILE)), '.dsh')
  assert.equal(defaultKeyFiles()[0], PRIMARY_KEY_FILE)
  assert.ok(defaultKeyFiles().length >= 1)
})

test('the endpoint is the documented one', () => {
  assert.equal(ENDPOINT, 'https://apihub.agnes-ai.com/v1/images/generations')
})

// ---------------------------------------------------------------------------
// settings.js — defaults, validation, atomic persistence
// ---------------------------------------------------------------------------

test('normalizeSettings repairs bad input instead of throwing', () => {
  const fallback = normalizeSettings()
  assert.equal(fallback.model, DEFAULT_SETTINGS.model)
  assert.equal(fallback.defaultSize, DEFAULT_SETTINGS.defaultSize)
  assert.equal(fallback.defaultRatio, DEFAULT_SETTINGS.defaultRatio)
  assert.ok(Number.isFinite(fallback.timeoutMs) && fallback.timeoutMs > 0)
  assert.ok(Number.isInteger(fallback.retries) && fallback.retries >= 0)
  assert.ok(Array.isArray(fallback.presets))

  const junk = normalizeSettings({
    model: 'not-a-model',
    defaultSize: '99K',
    defaultRatio: '5:7',
    timeoutMs: -1,
    retries: 'many',
    outDir: '',
    presets: 'nope',
  })
  assert.ok(MODEL_IDS.includes(junk.model), 'unknown model falls back to a known one')
  assert.ok(SIZES.includes(junk.defaultSize))
  assert.ok(RATIOS.includes(junk.defaultRatio))
  assert.notEqual(junk.timeoutMs, -1)
  assert.equal(typeof junk.retries, 'number')
  assert.ok(Array.isArray(junk.presets))

  // null/undefined must not explode.
  assert.ok(normalizeSettings(null))
  assert.ok(normalizeSettings(undefined))
})

test('normalizeSettings keeps values that are legitimate', () => {
  const kept = normalizeSettings({
    model: 'agnes-image-2.1-flash',
    defaultSize: '4K',
    defaultRatio: '21:9',
    timeoutMs: 12345,
    retries: 7,
    saveHistory: false,
  })
  assert.equal(kept.model, 'agnes-image-2.1-flash')
  assert.equal(kept.defaultSize, '4K')
  assert.equal(kept.defaultRatio, '21:9')
  assert.equal(kept.timeoutMs, 12345)
  assert.equal(kept.retries, 7)
  assert.equal(kept.saveHistory, false)
})

test('settings round-trip through disk, and report what changed', () => {
  const box = sandbox()
  const file = join(box.dir, 'settings.json')
  try {
    assert.equal(loadSettings(file).model, DEFAULT_SETTINGS.model, 'missing file yields defaults')

    const first = saveSettings({ defaultSize: '3K' }, file)
    assert.deepEqual(first.changed, ['defaultSize'])
    assert.equal(loadSettings(file).defaultSize, '3K')

    const again = saveSettings({ defaultSize: '3K' }, file)
    assert.deepEqual(again.changed, [], 'a no-op write reports no change')

    const more = saveSettings({ defaultRatio: '16:9', retries: 5 }, file)
    assert.deepEqual(more.changed.sort(), ['defaultRatio', 'retries'])
    assert.equal(loadSettings(file).defaultRatio, '16:9')
    assert.equal(loadSettings(file).retries, 5)
    assert.equal(loadSettings(file).defaultSize, '3K', 'earlier values survive later writes')
  } finally {
    box.done()
  }
})

test('a corrupt settings file degrades to defaults rather than throwing', () => {
  const box = sandbox()
  const file = join(box.dir, 'settings.json')
  try {
    writeFileSync(file, '{ this is not json')
    assert.equal(loadSettings(file).model, DEFAULT_SETTINGS.model)
    writeFileSync(file, 'null')
    assert.equal(loadSettings(file).defaultSize, DEFAULT_SETTINGS.defaultSize)
  } finally {
    box.done()
  }
})

test('saving settings leaves no temp file behind', () => {
  const box = sandbox()
  const file = join(box.dir, 'settings.json')
  try {
    saveSettings({ retries: 2 }, file)
    const leftovers = readFileSync(file, 'utf8')
    assert.ok(leftovers.includes('"retries": 2') || leftovers.includes('"retries":2'))
  } finally {
    box.done()
  }
})

test('the key file is written owner-only where the platform supports it', () => {
  const box = sandbox()
  const file = join(box.dir, 'agnes_key.txt')
  try {
    assert.equal(keyFileExists(file), false)
    writeKeyFile('sk-test-1234', file)
    assert.equal(keyFileExists(file), true)
    assert.equal(readKeyFile(file), 'sk-test-1234')
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600)
    }
    assert.equal(readKeyFile(join(box.dir, 'absent.txt')), '')
  } finally {
    box.done()
  }
})

test('maskKey never reveals the middle of a key', () => {
  const masked = maskKey('sk-WsdkVpQZJpAJhD0s6KCMddPkM8MhyCUaHayIKZiM5OKaJ8FR')
  assert.ok(!masked.includes('VpQZJpAJhD0s6KCMddPk'))
  assert.ok(masked.startsWith('sk-W'))
  assert.ok(masked.endsWith('J8FR'))
  assert.equal(maskKey(''), '')
  assert.equal(maskKey(undefined), '')
  assert.ok(!maskKey('short').includes('short'))
})

// ---------------------------------------------------------------------------
// history.js — a JSONL log that must never take the tool down
// ---------------------------------------------------------------------------

test('history appends, lists newest first, and counts', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  try {
    assert.equal(historyCount(file), 0)
    assert.deepEqual(listHistory({ file }), [])

    appendHistory({ path: join(box.dir, 'a.png'), prompt: 'first' }, file)
    appendHistory({ path: join(box.dir, 'b.png'), prompt: 'second' }, file)
    appendHistory({ path: join(box.dir, 'c.png'), prompt: 'third' }, file)

    assert.equal(historyCount(file), 3)
    const listed = listHistory({ file })
    assert.equal(listed.length, 3)
    assert.deepEqual(listed.map((i) => i.prompt), ['third', 'second', 'first'], 'newest first')
    assert.ok(listed.every((i) => typeof i.missing === 'boolean'))
    assert.equal(listed[0].file, 'c.png', 'records carry the basename for display')
  } finally {
    box.done()
  }
})

test('a record without a path is refused rather than half-written', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  try {
    assert.equal(appendHistory({ prompt: 'no path' }, file), null)
    assert.equal(historyCount(file), 0)
  } finally {
    box.done()
  }
})

test('history survives a truncated or corrupt line', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  try {
    appendHistory({ path: join(box.dir, 'good.png') }, file)
    writeFileSync(file, readFileSync(file, 'utf8') + '{ half a line\n' + 'not json at all\n')
    appendHistory({ path: join(box.dir, 'later.png') }, file)
    const listed = listHistory({ file })
    assert.deepEqual(listed.map((i) => i.file), ['later.png', 'good.png'])
  } finally {
    box.done()
  }
})

test('appendHistory never throws, even on an unwritable path', () => {
  assert.doesNotThrow(() => appendHistory({ path: 'x' }, join('\u0000invalid', 'nope', 'h.jsonl')))
})

test('missing files are flagged instead of served as broken images', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  try {
    appendHistory({ path: join(box.dir, 'never-written.png') }, file)
    const [record] = listHistory({ file })
    assert.equal(record.missing, true)
    writeFileSync(join(box.dir, 'never-written.png'), 'x')
    assert.equal(listHistory({ file })[0].missing, false)
  } finally {
    box.done()
  }
})

test('historyPaths exposes every recorded path for route containment checks', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  try {
    appendHistory({ path: join(box.dir, 'a.png') }, file)
    appendHistory({ path: join(box.dir, 'b.png') }, file)
    const paths = historyPaths(file)
    assert.equal(paths.size, 2)
    assert.ok([...paths].some((p) => String(p).endsWith('a.png')))
    assert.ok([...paths].some((p) => String(p).endsWith('b.png')))
  } finally {
    box.done()
  }
})

test('clearHistory empties the log but leaves the images alone', () => {
  const box = sandbox()
  const file = join(box.dir, 'history.jsonl')
  const image = join(box.dir, 'keep.png')
  try {
    writeFileSync(image, 'x')
    appendHistory({ path: image }, file)
    assert.equal(historyCount(file), 1)
    clearHistory(file)
    assert.equal(historyCount(file), 0)
    assert.deepEqual(listHistory({ file }), [])
    assert.equal(existsSync(image), true, 'clearing history must not delete generated files')
  } finally {
    box.done()
  }
})
