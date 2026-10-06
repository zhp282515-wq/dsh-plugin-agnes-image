// Host HTTP surface for the console.
//
// Everything the browser half (and the standalone console page) can do goes
// through these routes. Three rules shape the whole file:
//
//   1. Loopback same-origin only. `isTrustedRequest` is the same fence dsh puts
//      in front of its own /api, and it matters twice over here: one route
//      writes an API key and another reads arbitrary-looking file paths off
//      disk. Host is the header DNS rebinding cannot forge, so it must name a
//      loopback authority; Origin and Sec-Fetch-Site then rule out a cross-site
//      page running on this machine.
//   2. The key never travels back out. The console sees a masked fingerprint
//      and the name of the source, never the secret.
//   3. Reads of images are containment-checked: a path is served only if it
//      sits inside the configured output directory or is recorded in the
//      history. That keeps `?path=` from becoming an arbitrary file read.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ENDPOINT,
  IMAGE_MODELS,
  MODEL,
  MODEL_IDS,
  NATIVE_PIXELS,
  RATIOS,
  SIZES,
  generate,
  isSize,
  resolveApiKey,
  saveImage,
  slugify,
} from './agnes.js'
import { appendHistory, clearHistory, historyCount, historyPaths, listHistory } from './history.js'
import { DEFAULT_OUT_DIR, STATE_DIR, loadSettings, maskKey, readKeyFile, saveSettings, writeKeyFile } from './settings.js'

export const ROUTE_PREFIX = '/agnes-image'
const CONSOLE_DIR = fileURLToPath(new URL('../console/', import.meta.url))
const UPLOAD_DIR = join(STATE_DIR, 'uploads')

const ROUTE_REFUSAL = 'request refused: this route answers same-origin loopback only'
const MAX_JSON_BODY = 1024 * 1024
const MAX_UPLOAD_BODY = 32 * 1024 * 1024

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

// ---------------------------------------------------------------------------
// request helpers
// ---------------------------------------------------------------------------

function isLoopbackHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') return true
  return false
}

export function isTrustedRequest(req) {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers })
  res.end(body)
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' })
}

function refuse(res) {
  sendJson(res, 403, { ok: false, error: ROUTE_REFUSAL })
}

async function readBody(req, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody(req, maxBytes = MAX_JSON_BODY) {
  const raw = await readBody(req, maxBytes)
  if (raw.length === 0) return {}
  const text = raw.toString('utf8').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be a JSON object')
    return parsed
  } catch (error) {
    throw new Error(`invalid JSON body: ${error?.message ?? error}`)
  }
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams
}

// ---------------------------------------------------------------------------
// state projection
// ---------------------------------------------------------------------------

/** Where the key currently comes from, and a safe fingerprint of it. */
export function keyStatus(settings) {
  for (const envName of ['AGNES_AI_API_KEY', 'AGNES_API_KEY']) {
    const value = process.env[envName]
    if (typeof value === 'string' && value.trim()) {
      return { present: true, masked: maskKey(value), source: `environment ${envName}`, file: null, editable: false }
    }
  }
  const file = settings.keyFile
  const key = readKeyFile(file)
  if (key) return { present: true, masked: maskKey(key), source: `key file ${file}`, file, editable: true }
  return { present: false, masked: '', source: 'none', file, editable: true }
}

/** The full picture the console renders from. */
export function buildState() {
  const settings = loadSettings()
  return {
    ok: true,
    version: 1,
    endpoint: settings.endpoint || ENDPOINT,
    settings,
    key: keyStatus(settings),
    catalog: {
      models: IMAGE_MODELS,
      sizes: SIZES,
      ratios: RATIOS,
      nativePixels: NATIVE_PIXELS,
    },
    defaults: {
      outDir: DEFAULT_OUT_DIR,
      model: MODEL,
    },
    history: {
      count: historyCount(),
      dir: settings.outDir,
    },
  }
}

// ---------------------------------------------------------------------------
// route handlers
// ---------------------------------------------------------------------------

function handleState(_req, res) {
  sendJson(res, 200, buildState())
}

async function handleSettings(req, res) {
  const patch = await readJsonBody(req)
  const { settings, changed } = saveSettings(patch)
  sendJson(res, 200, { ...buildState(), settings, changed })
}

async function handleKey(req, res) {
  const body = await readJsonBody(req)
  const settings = loadSettings()
  const file = settings.keyFile

  if (body.clear === true) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch (error) {
      sendJson(res, 500, { ok: false, error: `could not remove ${file}: ${error?.message ?? error}` })
      return
    }
    sendJson(res, 200, buildState())
    return
  }

  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) {
    sendJson(res, 400, { ok: false, error: 'body must carry a non-empty "key" string, or "clear": true' })
    return
  }
  try {
    writeKeyFile(key, file)
  } catch (error) {
    sendJson(res, 500, { ok: false, error: `could not write ${file}: ${error?.message ?? error}` })
    return
  }
  sendJson(res, 200, buildState())
}

/**
 * Connectivity check. `mode: "auth"` only lists models (cheap, and it proves
 * the key works); `mode: "generate"` runs one real generation, which is the
 * only way to prove the whole path end to end.
 */
async function handleTest(req, res) {
  const body = await readJsonBody(req)
  const settings = loadSettings()
  const endpoint = settings.endpoint || ENDPOINT
  const started = Date.now()

  let key
  try {
    key = resolveApiKey(settings)
  } catch (error) {
    sendJson(res, 200, { ok: false, stage: 'key', error: String(error?.message ?? error) })
    return
  }

  if (body.mode === 'generate') {
    try {
      const result = await generate({
        prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : 'A single red apple on a white table',
        size: isSize(body.size) ? body.size : settings.defaultSize,
        ratio: RATIOS.includes(body.ratio) ? body.ratio : settings.defaultRatio,
        model: MODEL_IDS.includes(body.model) ? body.model : settings.model,
        endpoint,
        retries: settings.retries,
        timeoutMs: settings.timeoutMs,
        config: settings,
      })
      const saved = saveImage(result.bytes, join(settings.outDir, `agnes-test-${slugify(result.prompt, 32)}.png`))
      sendJson(res, 200, {
        ok: true,
        stage: 'generate',
        ms: Date.now() - started,
        path: saved,
        nativePixels: result.nativePixels,
        bytes: result.bytes.length,
        model: result.model,
      })
    } catch (error) {
      sendJson(res, 200, { ok: false, stage: 'generate', ms: Date.now() - started, error: String(error?.message ?? error) })
    }
    return
  }

  // Derive /v1/models from the configured generations endpoint.
  let modelsUrl = ''
  try {
    const url = new URL(endpoint)
    url.pathname = url.pathname.replace(/\/images\/generations\/?$/, '/models')
    if (url.pathname.endsWith('/models')) modelsUrl = url.toString()
  } catch {
    /* fall through */
  }
  if (!modelsUrl) {
    sendJson(res, 200, { ok: false, stage: 'auth', error: `cannot derive a models URL from ${endpoint}` })
    return
  }

  try {
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(Math.min(settings.timeoutMs, 60_000)),
    })
    const text = await response.text()
    if (!response.ok) {
      sendJson(res, 200, {
        ok: false,
        stage: 'auth',
        ms: Date.now() - started,
        error: `HTTP ${response.status}: ${text.trim().slice(0, 300)}`,
      })
      return
    }
    let ids = []
    try {
      const payload = JSON.parse(text)
      ids = Array.isArray(payload?.data) ? payload.data.map((m) => m?.id).filter((id) => typeof id === 'string') : []
    } catch {
      /* leave ids empty */
    }
    sendJson(res, 200, {
      ok: true,
      stage: 'auth',
      ms: Date.now() - started,
      modelsUrl,
      seen: ids.length,
      imageModels: MODEL_IDS.filter((id) => ids.includes(id)),
      missing: MODEL_IDS.filter((id) => !ids.includes(id)),
    })
  } catch (error) {
    sendJson(res, 200, { ok: false, stage: 'auth', ms: Date.now() - started, error: String(error?.message ?? error) })
  }
}

function handleHistory(req, res) {
  const limit = Number(query(req).get('limit'))
  const items = listHistory({ limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 200 })
  sendJson(res, 200, { ok: true, count: historyCount(), items })
}

function handleHistoryClear(_req, res) {
  sendJson(res, 200, { ok: clearHistory(), count: historyCount() })
}

/** Containment check: only files under the output directory or in history. */
function resolveServable(rawPath, settings) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null
  const target = resolve(rawPath.trim())
  if (!existsSync(target)) return null
  try {
    if (!statSync(target).isFile()) return null
  } catch {
    return null
  }
  const extension = extname(target).toLowerCase()
  if (!IMAGE_EXT.has(extension)) return null

  const outDir = resolve(settings.outDir)
  if (target === outDir || target.startsWith(outDir.endsWith(sep) ? outDir : outDir + sep)) return target
  if (historyPaths().has(target)) return target
  return null
}

function handleImage(req, res) {
  const settings = loadSettings()
  const target = resolveServable(query(req).get('path'), settings)
  if (!target) {
    sendJson(res, 404, { ok: false, error: 'not found, or not inside the output directory' })
    return
  }
  try {
    const bytes = readFileSync(target)
    const mime = MIME_BY_EXT[extname(target).toLowerCase()] ?? 'application/octet-stream'
    send(res, 200, bytes, { 'content-type': mime, 'content-length': String(bytes.length), 'cache-control': 'private, max-age=60' })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
  }
}

async function handleGenerate(req, res) {
  const body = await readJsonBody(req)
  const settings = loadSettings()

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    sendJson(res, 400, { ok: false, error: '"prompt" must be a non-empty string' })
    return
  }

  const images = Array.isArray(body.images) ? body.images.filter((entry) => typeof entry === 'string' && entry.trim()) : []
  const outDir = typeof body.outDir === 'string' && body.outDir.trim() ? body.outDir.trim() : settings.outDir
  const started = Date.now()

  try {
    const result = await generate({
      prompt,
      size: isSize(body.size) ? body.size : settings.defaultSize,
      ratio: RATIOS.includes(body.ratio) ? body.ratio : settings.defaultRatio,
      images: images.length > 0 ? images : undefined,
      model: MODEL_IDS.includes(body.model) ? body.model : settings.model,
      endpoint: settings.endpoint || ENDPOINT,
      retries: settings.retries,
      timeoutMs: settings.timeoutMs,
      config: settings,
    })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const target = resolve(join(outDir, `agnes-${stamp}-${slugify(result.prompt)}.png`))
    const saved = saveImage(result.bytes, target)
    const ms = Date.now() - started

    if (settings.saveHistory) {
      appendHistory({
        path: saved,
        prompt: result.prompt,
        model: result.model,
        size: result.size,
        ratio: result.ratio,
        nativePixels: result.nativePixels,
        bytes: result.bytes.length,
        ms,
        url: result.url,
        source: 'console',
        references: images.length,
      })
    }

    sendJson(res, 200, {
      ok: true,
      path: saved,
      viewUrl: `${ROUTE_PREFIX}/image?path=${encodeURIComponent(saved)}`,
      url: result.url,
      bytes: result.bytes.length,
      ms,
      model: result.model,
      size: result.size,
      ratio: result.ratio,
      nativePixels: result.nativePixels,
      revisedPrompt: result.revisedPrompt,
    })
  } catch (error) {
    sendJson(res, 200, { ok: false, ms: Date.now() - started, error: String(error?.message ?? error) })
  }
}

/** Save one uploaded reference image and hand its path back to the console. */
async function handleUpload(req, res) {
  const raw = await readBody(req, MAX_UPLOAD_BODY)
  if (raw.length === 0) {
    sendJson(res, 400, { ok: false, error: 'empty upload' })
    return
  }
  const header = typeof req.headers?.['x-filename'] === 'string' ? req.headers['x-filename'] : 'reference.png'
  const decoded = (() => {
    try {
      return decodeURIComponent(header)
    } catch {
      return 'reference.png'
    }
  })()
  const extension = extname(decoded).toLowerCase()
  const safeExt = IMAGE_EXT.has(extension) ? extension : '.png'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const target = join(UPLOAD_DIR, `${stamp}-${slugify(basename(decoded, extension), 32)}${safeExt}`)
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(target, raw)
    sendJson(res, 200, { ok: true, path: target, bytes: raw.length })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
  }
}

/** Open a folder in the desktop file manager. Best effort, never fatal. */
function handleReveal(req, res) {
  const settings = loadSettings()
  const requested = query(req).get('path')
  const target = requested && requested.trim() ? resolve(requested.trim()) : resolve(settings.outDir)
  const folder = existsSync(target) && statSync(target).isDirectory() ? target : dirname(target)

  const command = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    const child = spawn(command, [folder], { detached: true, stdio: 'ignore' })
    child.unref()
    sendJson(res, 200, { ok: true, folder, command })
  } catch (error) {
    sendJson(res, 200, { ok: false, folder, error: String(error?.message ?? error) })
  }
}

// ---------------------------------------------------------------------------
// static console assets
// ---------------------------------------------------------------------------

const CONSOLE_ASSETS = {
  [`${ROUTE_PREFIX}/console`]: 'index.html',
  [`${ROUTE_PREFIX}/console/`]: 'index.html',
  [`${ROUTE_PREFIX}/console.css`]: 'console.css',
  [`${ROUTE_PREFIX}/console.js`]: 'console.js',
  [`${ROUTE_PREFIX}/tokens.css`]: 'tokens.css',
}

function handleAsset(fileName) {
  return (_req, res) => {
    try {
      const bytes = readFileSync(join(CONSOLE_DIR, fileName))
      send(res, 200, bytes, {
        'content-type': MIME_BY_EXT[extname(fileName).toLowerCase()] ?? 'application/octet-stream',
        'content-length': String(bytes.length),
        'cache-control': 'no-store',
      })
    } catch (error) {
      send(res, 500, `console asset ${fileName} unavailable: ${error?.message ?? error}`, {
        'content-type': 'text/plain; charset=utf-8',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------

/**
 * Mount every route. Routes are registered through `ctx.effect` so unloading
 * the plugin (hot-toggle, restart) actually releases the sockets entries.
 *
 * @param {object} ctx the plugin context
 * @param {object} scope a context that carries `webServer` (see index.js)
 * @returns {Array<() => void>} disposers
 */
export function registerRoutes(ctx, scope) {
  const webServer = scope?.webServer
  if (!webServer || typeof webServer.register !== 'function') return []

  const routes = [
    ['state', 'GET', `${ROUTE_PREFIX}/state`, handleState],
    ['settings', 'POST', `${ROUTE_PREFIX}/settings`, handleSettings],
    ['key', 'POST', `${ROUTE_PREFIX}/key`, handleKey],
    ['test', 'POST', `${ROUTE_PREFIX}/test`, handleTest],
    ['history', 'GET', `${ROUTE_PREFIX}/history`, handleHistory],
    ['history-clear', 'POST', `${ROUTE_PREFIX}/history/clear`, handleHistoryClear],
    ['image', 'GET', `${ROUTE_PREFIX}/image`, handleImage],
    ['generate', 'POST', `${ROUTE_PREFIX}/generate`, handleGenerate],
    ['upload', 'POST', `${ROUTE_PREFIX}/upload`, handleUpload],
    ['reveal', 'POST', `${ROUTE_PREFIX}/reveal`, handleReveal],
  ]

  const disposers = []

  for (const [label, method, path, fn] of routes) {
    const handler = async (req, res) => {
      try {
        if (!isTrustedRequest(req)) {
          refuse(res)
          return
        }
        if (req.method !== method) {
          sendJson(res, 405, { ok: false, error: `${path} answers ${method} only` })
          return
        }
        await fn(req, res)
      } catch (error) {
        try {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        } catch {
          /* response already gone */
        }
      }
    }
    disposers.push(registerOne(ctx, webServer, { name: `agnes-image-${label}`, kind: 'exact', path, handler }))
  }

  for (const [path, fileName] of Object.entries(CONSOLE_ASSETS)) {
    disposers.push(
      registerOne(ctx, webServer, {
        name: `agnes-image-asset-${fileName}-${path.length}`,
        kind: 'exact',
        path,
        handler: handleAsset(fileName),
      }),
    )
  }

  return disposers
}

/** Register through `ctx.effect` when available so the fiber unwinds cleanly. */
function registerOne(ctx, webServer, route) {
  if (typeof ctx?.effect === 'function') {
    return ctx.effect(() => webServer.register(route), `agnes-image: ${route.name}`)
  }
  return webServer.register(route)
}
