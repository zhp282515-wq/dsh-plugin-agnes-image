// Core Agnes Image 2.5 Flash client.
//
// Dependency-free on purpose: node builtins plus the global `fetch` that ships
// with node >= 18 (the dsh runtime is on node 24). The plugin package therefore
// needs no install step and cannot drift from a lockfile.
//
// API contract (https://agnes-ai.com/zh-Hans/docs/agnes-image-25-flash):
//   POST https://apihub.agnes-ai.com/v1/images/generations
//   Authorization: Bearer <key>
//   { model, prompt, size, ratio, extra_body: { response_format, image? } }
// Two documented traps this file honors:
//   * `response_format` must NOT sit at the top level of the body - it belongs
//     inside `extra_body`. A top-level one is ignored (or rejected).
//   * image-to-image must NOT pass `tags: ["img2img"]`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'

export const ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations'

/**
 * Image models this client knows about, cross-checked against the live
 * `GET https://apihub.agnes-ai.com/v1/models`. All three were probed and accept
 * the documented `size` tiers together with `ratio`; they share the native
 * pixel table below.
 */
export const IMAGE_MODELS = [
  {
    id: 'agnes-image-2.5-flash',
    label: 'Agnes Image 2.5 Flash',
    note: 'Newest flash image model. Text-to-image, image-to-image and multi-image composition.',
  },
  {
    id: 'agnes-image-2.1-flash',
    label: 'Agnes Image 2.1 Flash',
    note: 'Tuned for high-information-density scenes and complex compositions.',
  },
  {
    id: 'agnes-image-2.0-flash',
    label: 'Agnes Image 2.0 Flash',
    note: 'Earlier flash image model; simplest of the three.',
  },
]

export const MODEL = IMAGE_MODELS[0].id
export const MODEL_IDS = IMAGE_MODELS.map((entry) => entry.id)

export const SIZES = ['1K', '2K', '3K', '4K']
export const RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9']

/**
 * Native output pixels per ratio and tier, so a caller can predict the exact
 * canvas before spending a generation. Probed rather than assumed: 1K rows were
 * confirmed against real responses on 2.5 and 2.1 (`2:3` -> 832x1248, `3:4` ->
 * 864x1152) and on 2.0 (`16:9` -> 1312x736). The API also tolerates a literal
 * `WxH` size, but normalizes unsupported ones, so tiers stay the reliable path.
 */
export const NATIVE_PIXELS = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '3K': '3072x3072', '4K': '4096x4096' },
  '3:4': { '1K': '864x1152', '2K': '1728x2304', '3K': '2592x3456', '4K': '3456x4608' },
  '4:3': { '1K': '1152x864', '2K': '2304x1728', '3K': '3456x2592', '4K': '4608x3456' },
  '16:9': { '1K': '1312x736', '2K': '2624x1472', '3K': '3936x2208', '4K': '5248x2944' },
  '9:16': { '1K': '736x1312', '2K': '1472x2624', '3K': '2208x3936', '4K': '2944x5248' },
  '2:3': { '1K': '832x1248', '2K': '1664x2496', '3K': '2496x3744', '4K': '3328x4992' },
  '3:2': { '1K': '1248x832', '2K': '2496x1664', '3K': '3744x2496', '4K': '4992x3328' },
  '21:9': { '1K': '1568x672', '2K': '3136x1344', '3K': '4704x2016', '4K': '6272x2688' },
}

const PIXEL_SIZE_RE = /^\d{2,5}x\d{2,5}$/

/** True for a tier (`2K`) or a literal pixel size (`1024x768`) the API tolerates. */
export function isSize(value) {
  return typeof value === 'string' && (SIZES.includes(value) || PIXEL_SIZE_RE.test(value))
}

/** Best-known native pixels for a size/ratio pair; `null` when it cannot be predicted. */
export function nativePixelsFor(size, ratio) {
  if (PIXEL_SIZE_RE.test(String(size))) return String(size)
  return NATIVE_PIXELS[ratio]?.[size] ?? null
}

// Statuses worth another attempt: rate limits, transient upstream hiccups, and
// gateway timeouts. Everything else is a real answer and must not be retried.
const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * Key files consulted when neither an explicit key nor the environment
 * variable provides one. `~/.dsh/agnes_key.txt` is the canonical location;
 * the second entry is the legacy path from an earlier arrangement, kept so an
 * existing file there keeps working.
 */
export const PRIMARY_KEY_FILE = join(homedir(), '.dsh', 'agnes_key.txt')

export function defaultKeyFiles() {
  return [PRIMARY_KEY_FILE, join(homedir(), '.agnes', 'api_key.txt')]
}

function readKeyFile(file) {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * Resolution order, highest priority first:
 *   1. an explicit `apiKey`
 *   2. the environment (`AGNES_AI_API_KEY`, then `AGNES_API_KEY`) - the
 *      environment deliberately overrides the key file so a rotated key can be
 *      injected without touching anything on disk
 *   3. an explicit `keyFile` / `keyFiles`
 *   4. the default candidate files
 */
export function resolveApiKey({ apiKey, keyFile, keyFiles } = {}) {
  if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim()

  for (const envName of ['AGNES_AI_API_KEY', 'AGNES_API_KEY']) {
    const value = process.env[envName]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const candidates = []
  if (typeof keyFile === 'string' && keyFile.trim()) candidates.push(keyFile.trim())
  if (Array.isArray(keyFiles)) {
    for (const entry of keyFiles) {
      if (typeof entry === 'string' && entry.trim()) candidates.push(entry.trim())
    }
  }
  candidates.push(...defaultKeyFiles())

  for (const candidate of candidates) {
    const key = readKeyFile(candidate)
    if (key) return key
  }

  throw new Error(
    `No Agnes API key found. Set the AGNES_AI_API_KEY environment variable, or put the key in one of: ${[...new Set(candidates)].join(', ')}`,
  )
}

/** Where a key would come from, without ever returning the secret itself. */
export function describeKeySource(config = {}) {
  if (typeof config.apiKey === 'string' && config.apiKey.trim()) return 'plugin config apiKey'
  for (const envName of ['AGNES_AI_API_KEY', 'AGNES_API_KEY']) {
    if (process.env[envName]?.trim()) return `environment ${envName}`
  }
  const candidates = []
  if (typeof config.keyFile === 'string' && config.keyFile.trim()) candidates.push(config.keyFile.trim())
  if (Array.isArray(config.keyFiles)) candidates.push(...config.keyFiles.filter((e) => typeof e === 'string' && e.trim()))
  candidates.push(...defaultKeyFiles())
  for (const candidate of candidates) {
    if (readKeyFile(candidate)) return `key file ${candidate}`
  }
  return 'none'
}

/**
 * Normalize one reference image into something the API accepts: a public URL
 * passes through untouched, anything else is read off disk and inlined as a
 * Data URI.
 */
export function toImageRef(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('each entry of `images` must be a non-empty string')
  }
  const value = source.trim()
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value

  const file = resolve(value)
  if (!existsSync(file)) throw new Error(`reference image not found: ${file}`)
  const mime = MIME_BY_EXT[extname(file).toLowerCase()] ?? 'image/png'
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`
}

function abortAfter(ms, signal) {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * One request with retries. Returns the raw body as a Buffer so the same loop
 * serves both the JSON call and the binary download of the produced image.
 */
async function fetchOk(url, init, { retries = 3, timeoutMs = 300_000, signal, onRetry, what = 'Agnes request' } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      const delay = Math.min(1500 * 2 ** (attempt - 1), 30_000)
      onRetry?.({ attempt, delay, error: lastError })
      await sleep(delay)
    }
    if (signal?.aborted) throw new Error(`${what} aborted`)

    let response
    try {
      response = await fetch(url, { ...init, signal: abortAfter(timeoutMs, signal) })
    } catch (error) {
      if (signal?.aborted) throw new Error(`${what} aborted`, { cause: error })
      lastError = new Error(`${what} failed: ${error?.message ?? String(error)}`)
      if (attempt === retries) throw lastError
      continue
    }

    const body = Buffer.from(await response.arrayBuffer())
    if (response.ok) return { status: response.status, headers: response.headers, body }

    const snippet = body.toString('utf8').trim().slice(0, 400)
    const error = new Error(
      `${what} HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${snippet ? `: ${snippet}` : ''}`,
    )
    error.status = response.status
    if (!RETRY_STATUS.has(response.status) || attempt === retries) throw error
    lastError = error
  }
  throw lastError ?? new Error(`${what} failed`)
}

/**
 * Generate (or edit/compose) one image.
 *
 * @returns {Promise<{bytes: Buffer, url: string|null, revisedPrompt: string|null,
 *   model: string, size: string, ratio: string, prompt: string, nativePixels: string|null}>}
 */
export async function generate({
  prompt,
  size = '2K',
  ratio = '1:1',
  images,
  model = MODEL,
  endpoint = ENDPOINT,
  retries = 3,
  timeoutMs = 300_000,
  signal,
  onRetry,
  config = {},
} = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('prompt must be a non-empty string')
  }
  if (!SIZES.includes(size)) {
    throw new Error(`size must be one of ${SIZES.join(', ')} (got ${JSON.stringify(size)})`)
  }
  if (ratio != null && !RATIOS.includes(ratio)) {
    throw new Error(`ratio must be one of ${RATIOS.join(', ')} (got ${JSON.stringify(ratio)})`)
  }

  const key = resolveApiKey(config)

  const body = { model, prompt: prompt.trim(), size }
  if (ratio) body.ratio = ratio
  const extraBody = { response_format: 'url' }
  if (Array.isArray(images) && images.length > 0) {
    extraBody.image = images.map(toImageRef)
  }
  body.extra_body = extraBody

  const response = await fetchOk(
    endpoint,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { retries, timeoutMs, signal, onRetry, what: 'Agnes generation' },
  )

  let payload
  try {
    payload = JSON.parse(response.body.toString('utf8'))
  } catch {
    throw new Error(`Agnes returned non-JSON: ${response.body.toString('utf8').trim().slice(0, 300)}`)
  }

  const first = payload?.data?.[0]
  if (!first) {
    throw new Error(`Agnes returned no image: ${JSON.stringify(payload).slice(0, 400)}`)
  }

  let bytes
  const url = typeof first.url === 'string' ? first.url : null
  if (typeof first.b64_json === 'string' && first.b64_json) {
    bytes = Buffer.from(first.b64_json, 'base64')
  } else if (url) {
    const download = await fetchOk(url, { method: 'GET' }, { retries, timeoutMs, signal, onRetry, what: 'Agnes image download' })
    bytes = download.body
  } else {
    throw new Error(`Agnes returned neither url nor b64_json: ${JSON.stringify(first).slice(0, 300)}`)
  }

  return {
    bytes,
    url,
    revisedPrompt: typeof first.revised_prompt === 'string' ? first.revised_prompt : null,
    model,
    size,
    ratio: ratio ?? '',
    prompt: prompt.trim(),
    nativePixels: NATIVE_PIXELS[ratio]?.[size] ?? null,
  }
}

/** Filesystem-safe slug of a prompt, for default output filenames. */
export function slugify(text, maxLength = 48) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (slug || 'image').slice(0, maxLength).replace(/-+$/, '')
}

export function defaultOutPath(prompt, outDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return join(outDir, `agnes-${stamp}-${slugify(prompt)}.png`)
}

export function saveImage(bytes, outPath) {
  const file = resolve(outPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return file
}
