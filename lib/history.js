// Generation history: one JSON record per line, newest appended last.
//
// JSON Lines rather than a JSON array on purpose. Appending is a single
// `appendFileSync` that can never lose earlier records, and reading the tail
// does not require parsing a file that grows without bound. A truncated or
// hand-mangled line is skipped rather than thrown, because the history is a
// convenience and must never be the reason a generation fails to record.

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { HISTORY_FILE } from './settings.js'

/** Trim when the file passes this many records, down to `HISTORY_KEEP`. */
const HISTORY_COMPACT_AT = 1500
const HISTORY_KEEP = 1000
/** A record is small; anything past this is a corrupted line, not a record. */
const MAX_RECORD_BYTES = 64 * 1024

let seq = 0

function nextId() {
  seq += 1
  return `${Date.now().toString(36)}-${seq.toString(36)}`
}

function parseLine(line) {
  const text = line.trim()
  if (!text) return null
  try {
    const record = JSON.parse(text)
    return record && typeof record === 'object' ? record : null
  } catch {
    return null
  }
}

/**
 * Record one generation. Never throws: a history write failing must not turn a
 * successful (and possibly slow, possibly paid) generation into an error.
 *
 * @param {object} entry
 * @param {string} entry.path absolute path of the saved image
 * @param {string} [entry.prompt]
 * @param {string} [entry.model]
 * @param {string} [entry.size]
 * @param {string} [entry.ratio]
 * @param {string|null} [entry.nativePixels]
 * @param {number} [entry.bytes]
 * @param {number} [entry.ms] wall-clock duration of the generation
 * @param {string} [entry.url]
 * @param {string} [entry.source] 'tool' when the model called the tool, 'console' when the UI did
 * @param {number} [entry.references] how many reference images were supplied
 * @param {string} [file]
 * @returns {object|null} the stored record, or null when it could not be written
 */
export function appendHistory(entry, file = HISTORY_FILE) {
  if (!entry || typeof entry.path !== 'string' || !entry.path) return null
  const record = {
    id: nextId(),
    at: new Date().toISOString(),
    path: entry.path,
    file: basename(entry.path),
    prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
    model: typeof entry.model === 'string' ? entry.model : '',
    size: typeof entry.size === 'string' ? entry.size : '',
    ratio: typeof entry.ratio === 'string' ? entry.ratio : '',
    nativePixels: typeof entry.nativePixels === 'string' ? entry.nativePixels : null,
    bytes: Number.isFinite(entry.bytes) ? entry.bytes : null,
    ms: Number.isFinite(entry.ms) ? entry.ms : null,
    url: typeof entry.url === 'string' ? entry.url : null,
    source: entry.source === 'console' ? 'console' : 'tool',
    references: Number.isFinite(entry.references) ? entry.references : 0,
  }
  try {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    compactHistory(file)
    return record
  } catch {
    return null
  }
}

/** Keep the file bounded. Called on append; failure is ignored. */
function compactHistory(file) {
  try {
    const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim())
    if (lines.length <= HISTORY_COMPACT_AT) return
    const kept = lines.slice(-HISTORY_KEEP)
    writeFileSync(file, `${kept.join('\n')}\n`, 'utf8')
  } catch {
    /* best effort */
  }
}

/**
 * Newest first. `missing` marks records whose file has since been moved or
 * deleted, so the gallery can show a placeholder instead of a broken image.
 */
export function listHistory({ limit = 200, file = HISTORY_FILE } = {}) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return []
  }

  const records = []
  for (let index = lines.length - 1; index >= 0 && records.length < limit; index -= 1) {
    const line = lines[index]
    if (!line || line.length > MAX_RECORD_BYTES) continue
    const record = parseLine(line)
    if (!record) continue
    records.push({
      ...record,
      missing: !record.path || !existsSync(record.path),
    })
  }
  return records
}

export function historyCount(file = HISTORY_FILE) {
  try {
    statSync(file)
  } catch {
    return 0
  }
  try {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).length
  } catch {
    return 0
  }
}

/** Wipe the history. The generated images themselves are left on disk. */
export function clearHistory(file = HISTORY_FILE) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '', 'utf8')
    return true
  } catch {
    return false
  }
}

/** The set of paths the console is allowed to serve back (see routes.js). */
export function historyPaths(file = HISTORY_FILE) {
  const paths = new Set()
  for (const record of listHistory({ limit: 5000, file })) {
    if (typeof record.path === 'string' && record.path) paths.add(record.path)
  }
  return paths
}
