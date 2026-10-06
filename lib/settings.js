// Persistent settings for the Agnes image plugin.
//
// Deliberately a plain JSON file rather than a harness-internal store: the file
// is inspectable, diffable, hand-editable, survives a reinstall, and keeps this
// package free of dependencies on unpublished dsh internals. Every read goes
// through `loadSettings`, which normalizes and repairs, so a hand-edited or
// half-written file degrades to defaults instead of breaking the tool.
//
// Layout of the state directory (`~/.dsh/agnes-image/`):
//   settings.json   user preferences (this module)
//   history.jsonl   one JSON record per generated image (see history.js)
//
// The API key is NOT stored here: it lives in its own 0600 file
// (`~/.dsh/agnes_key.txt` by default) so it can be kept out of backups of the
// settings file, and so an existing key file keeps working untouched.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import { MODEL, MODEL_IDS, PRIMARY_KEY_FILE, RATIOS, SIZES, isSize } from './agnes.js'

export const STATE_DIR = join(homedir(), '.dsh', 'agnes-image')
export const SETTINGS_FILE = join(STATE_DIR, 'settings.json')
export const HISTORY_FILE = join(STATE_DIR, 'history.jsonl')
export const DEFAULT_OUT_DIR = join(homedir(), 'Desktop', 'agnes-out')

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  model: MODEL,
  defaultSize: '2K',
  defaultRatio: '1:1',
  outDir: DEFAULT_OUT_DIR,
  keyFile: PRIMARY_KEY_FILE,
  timeoutMs: 300_000,
  retries: 3,
  endpoint: '',
  saveHistory: true,
  presets: [],
})

const MIN_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 3_600_000

function coerceString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function coerceAbsolutePath(value, fallback) {
  const text = coerceString(value, '')
  return text && isAbsolute(text) ? text : fallback
}

function coerceInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  const rounded = Math.round(number)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

let presetSeq = 0

/** A stable id, so the console can edit and delete presets without index churn. */
export function newPresetId() {
  presetSeq += 1
  return `p${Date.now().toString(36)}${presetSeq.toString(36)}`
}

function coercePreset(raw) {
  if (!raw || typeof raw !== 'object') return null
  const prompt = coerceString(raw.prompt, '')
  if (!prompt) return null
  const size = isSize(raw.size) ? String(raw.size) : DEFAULT_SETTINGS.defaultSize
  const ratio = RATIOS.includes(raw.ratio) ? raw.ratio : DEFAULT_SETTINGS.defaultRatio
  return {
    id: coerceString(raw.id, newPresetId()),
    name: coerceString(raw.name, prompt.slice(0, 40)),
    prompt,
    size,
    ratio,
  }
}

/**
 * Repair an arbitrary object into a complete, valid settings object. Unknown
 * keys are dropped; every invalid field falls back to its default. This is the
 * only place that decides what a settings value may be, so callers can treat
 * the returned object as trusted.
 */
export function normalizeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const presets = []
  if (Array.isArray(source.presets)) {
    const seen = new Set()
    for (const entry of source.presets) {
      const preset = coercePreset(entry)
      if (!preset) continue
      if (seen.has(preset.id)) preset.id = newPresetId()
      seen.add(preset.id)
      presets.push(preset)
      if (presets.length >= 100) break
    }
  }

  const model = MODEL_IDS.includes(source.model) ? source.model : DEFAULT_SETTINGS.model
  return {
    version: 1,
    model,
    defaultSize: isSize(source.defaultSize) ? String(source.defaultSize) : DEFAULT_SETTINGS.defaultSize,
    defaultRatio: RATIOS.includes(source.defaultRatio) ? source.defaultRatio : DEFAULT_SETTINGS.defaultRatio,
    outDir: coerceAbsolutePath(source.outDir, DEFAULT_SETTINGS.outDir),
    keyFile: coerceAbsolutePath(source.keyFile, DEFAULT_SETTINGS.keyFile),
    timeoutMs: coerceInt(source.timeoutMs, DEFAULT_SETTINGS.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    retries: coerceInt(source.retries, DEFAULT_SETTINGS.retries, 0, 10),
    endpoint: coerceString(source.endpoint, ''),
    saveHistory: source.saveHistory !== false,
    presets,
  }
}

export function loadSettings(file = SETTINGS_FILE) {
  try {
    return normalizeSettings(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return normalizeSettings({})
  }
}

/**
 * Merge a partial update into the stored settings and write atomically
 * (temp file + rename) so a crash mid-write cannot leave a truncated file.
 * @returns {{settings: object, file: string, changed: string[]}}
 */
export function saveSettings(patch, file = SETTINGS_FILE) {
  const before = loadSettings(file)
  const settings = normalizeSettings({ ...before, ...(patch && typeof patch === 'object' ? patch : {}) })
  mkdirSync(dirname(file), { recursive: true })

  const changed = Object.keys(DEFAULT_SETTINGS).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(settings[key]),
  )

  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
  return { settings, file, changed }
}

/** Never echo the secret: the console only ever sees a masked fingerprint. */
export function maskKey(key) {
  const text = typeof key === 'string' ? key.trim() : ''
  if (!text) return ''
  if (text.length <= 12) return `${text.slice(0, 2)}${'*'.repeat(Math.max(text.length - 2, 0))}`
  return `${text.slice(0, 6)}${'*'.repeat(8)}${text.slice(-4)}`
}

export function readKeyFile(file) {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * Write the key to its own file with owner-only permissions. On Windows chmod
 * is close to a no-op, but the call is harmless and matters on macOS/Linux.
 */
export function writeKeyFile(key, file = PRIMARY_KEY_FILE) {
  const text = typeof key === 'string' ? key.trim() : ''
  if (!text) throw new Error('API key must be a non-empty string')
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* best effort */
  }
  return file
}

export function keyFileExists(file = PRIMARY_KEY_FILE) {
  return existsSync(file)
}
