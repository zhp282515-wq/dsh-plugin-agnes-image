// Consistency tests for the console's two languages.
//
// The console is a plain script with no exports, so these tests read its source
// the way a reviewer would: pull the dictionary out, then check it against the
// places that use it. The failure modes being guarded are all silent in a
// browser — an untranslated key renders as its own key name, a typo in a
// data-i18n attribute renders as the raw key, and a placeholder that exists in
// only one language drops the value on the floor in the other.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')

const CONSOLE_JS = readFileSync(join(pkgRoot, 'console', 'console.js'), 'utf8')
const CONSOLE_HTML = readFileSync(join(pkgRoot, 'console', 'index.html'), 'utf8')
const CONSOLE_CSS = readFileSync(join(pkgRoot, 'console', 'console.css'), 'utf8')

/** Slice the `const STRINGS = { ... }` literal out of console.js. */
function dictionarySource() {
  const start = CONSOLE_JS.indexOf('const STRINGS = {')
  assert.ok(start >= 0, 'console.js must declare STRINGS')
  const end = CONSOLE_JS.indexOf('/** Resolved UI language')
  assert.ok(end > start, 'the dictionary must be followed by the language resolution')
  return CONSOLE_JS.slice(start, end)
}

/**
 * Key -> its raw entry source. Slicing between key positions rather than
 * matching braces handles both the one-line and the wrapped entry layout.
 */
function dictionary() {
  const source = dictionarySource()
  const keys = [...source.matchAll(/^ {4}'([^']+)':/gm)].map((match) => ({
    key: match[1],
    at: match.index,
  }))
  assert.ok(keys.length > 50, `expected a populated dictionary, found ${keys.length} entries`)

  const entries = new Map()
  keys.forEach((entry, index) => {
    const next = index + 1 < keys.length ? keys[index + 1].at : source.length
    entries.set(entry.key, source.slice(entry.at, next))
  })
  return { entries, count: keys.length }
}

const { entries, count } = dictionary()

// ---------------------------------------------------------------------------

test('every string carries both languages', () => {
  const missing = []
  for (const [key, body] of entries) {
    if (!/\ben:\s*'/.test(body)) missing.push(`${key} (en)`)
    if (!/\bzh:\s*'/.test(body)) missing.push(`${key} (zh)`)
  }
  assert.deepEqual(missing, [], 'no entry may ship half-translated')
})

test('keys are unique', () => {
  const seen = new Set()
  const duplicates = []
  for (const key of entries.keys()) {
    if (seen.has(key)) duplicates.push(key)
    seen.add(key)
  }
  assert.deepEqual(duplicates, [])
})

test('the two languages agree on every interpolation placeholder', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  const value = (body, lang) => {
    const match = body.match(new RegExp(`\\b${lang}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))
    return match ? match[1] : ''
  }

  const mismatched = []
  for (const [key, body] of entries) {
    const en = placeholders(value(body, 'en'))
    const zh = placeholders(value(body, 'zh'))
    if (en.join(',') !== zh.join(',')) mismatched.push(`${key}: en[${en}] vs zh[${zh}]`)
  }
  assert.deepEqual(mismatched, [], 'a placeholder present in one language only would be dropped')
})

test('every key the markup asks for exists', () => {
  const wanted = new Set()
  for (const match of CONSOLE_HTML.matchAll(/data-i18n(?:-html|-placeholder|-title|-alt)?="([^"]+)"/g)) {
    wanted.add(match[1])
  }
  assert.ok(wanted.size > 20, `expected the markup to be annotated, found ${wanted.size} hooks`)

  const unknown = [...wanted].filter((key) => !entries.has(key))
  assert.deepEqual(unknown, [], 'a typo here renders the raw key into the page')
})

test('every key console.js looks up exists', () => {
  // Key-shaped single-quoted literals are the `t('...')` arguments; the one
  // dynamic lookup (`catalog.<id>.note`) is a template literal and is matched
  // by the dictionary check below instead.
  const literalKeys = new Set()
  for (const match of CONSOLE_JS.matchAll(/'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+)'/g)) {
    literalKeys.add(match[1])
  }
  assert.ok(literalKeys.size > 30, `expected lookups to be found, got ${literalKeys.size}`)

  const unknown = [...literalKeys].filter((key) => !entries.has(key))
  assert.deepEqual(unknown, [])
})

test('the dynamic model-note lookup is covered for every shipped model', () => {
  // console.js builds `catalog.<model id>.note`; a model without an entry
  // silently falls back to the host's English note.
  const catalog = readFileSync(join(pkgRoot, 'lib', 'agnes.js'), 'utf8')
  const ids = [...catalog.matchAll(/id:\s*'(agnes-image-[0-9.]+-flash)'/g)].map((match) => match[1])
  assert.ok(ids.length >= 3, `expected the image model catalogue, found ${ids.length}`)

  const untranslated = ids.filter((id) => !entries.has(`catalog.${id}.note`))
  assert.deepEqual(untranslated, [])
})

test('no translation is dead code', () => {
  const used = new Set()
  for (const match of CONSOLE_HTML.matchAll(/data-i18n(?:-html|-placeholder|-title|-alt)?="([^"]+)"/g)) {
    used.add(match[1])
  }
  for (const match of CONSOLE_JS.matchAll(/t\(\s*'([^']+)'/g)) used.add(match[1])
  // Ternary lookups: t(cond ? 'a' : 'b').
  for (const match of CONSOLE_JS.matchAll(/t\(\s*[^)]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
    used.add(match[1])
    used.add(match[2])
  }
  // Dynamic lookups: `catalog.${entry.id}.note` covers every catalog entry,
  // and the coverage test above holds each one to account.
  if (CONSOLE_JS.includes('`catalog.${')) {
    for (const key of entries.keys()) {
      if (/^catalog\..+\.note$/.test(key)) used.add(key)
    }
  }

  const unused = [...entries.keys()].filter((key) => !used.has(key))
  assert.deepEqual(unused, [], `${count} entries declared`)
})

test('no user-visible text hides in the stylesheet', () => {
  // `content:` is the one CSS property that paints words. A hard-coded one
  // here renders in English no matter which language the page is in, and no
  // amount of JavaScript can reach it.
  const painted = []
  for (const match of CONSOLE_CSS.matchAll(/(?:^|[;{\s])content:\s*([^;]+);/gm)) {
    const value = match[1].trim()
    if (/[A-Za-z]/.test(value)) painted.push(value)
  }
  assert.deepEqual(painted, [], 'translate it in console.js and style a real element')
})

test('no sentence is hard-coded outside the dictionary', () => {
  // Runs of plain lowercase words are prose; class-name lists ("btn btn-ghost")
  // and hyphenated tokens are not. Capitalised phrases and sentences ending in
  // punctuation are prose too.
  const allowed = new Set(['use strict'])

  const source = dictionarySource()
  const offset = CONSOLE_JS.indexOf(source)
  const outside = CONSOLE_JS.slice(0, offset) + CONSOLE_JS.slice(offset + source.length)

  const prose = []
  for (const match of outside.matchAll(/(['"])((?:[^'"\\\n]|\\.)+)\1/g)) {
    const value = match[2]
    if (allowed.has(value)) continue
    if (!/\s/.test(value)) continue
    const looksLikeProse =
      /^[a-z]+(?: [a-z]+)+[.?!]?$/.test(value) || /[A-Z][a-z]/.test(value) || /[.?!]$/.test(value)
    if (looksLikeProse) prose.push(value)
  }
  assert.deepEqual(prose, [], 'route it through t() so both languages get it')
})
