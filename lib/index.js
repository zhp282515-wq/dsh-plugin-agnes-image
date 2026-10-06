// DeepSeek Harness (dsh) plugin: registers an `agnes_image` tool backed by the
// Agnes image models (https://agnes-ai.com/zh-Hans/docs/agnes-image-25-flash)
// and serves the plugin's console as a standalone page at /agnes-image/console.
//
// A registered tool's schema reaches the model on every request, so there is no
// trigger gamble: the model always knows it can ask for an image. The tool saves
// a real file and returns its absolute path, because the model itself is
// text-only and cannot see what it just generated.
//
// Loaded via the cordis.patch.yml row `dsh-plugin-agnes-image`
// (see this package's package.json `dsh.bundle` manifest).

import { isAbsolute } from 'node:path'

import {
  ENDPOINT,
  IMAGE_MODELS,
  MODEL,
  MODEL_IDS,
  NATIVE_PIXELS,
  RATIOS,
  SIZES,
  defaultOutPath,
  describeKeySource,
  generate,
  resolveApiKey,
  saveImage,
} from './agnes.js'
import { appendHistory } from './history.js'
import { registerRoutes } from './routes.js'
import { DEFAULT_OUT_DIR, loadSettings } from './settings.js'

export const name = 'agnes-image'

// `tools` is a hard dependency: without it there is no plugin. `webServer` is
// acquired lazily inside apply() so the plugin still loads in a headless
// install where no web server was ever mounted.
export const inject = ['tools']

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_RETRIES = 3

const DESCRIPTION = [
  'Generate or edit an image with an Agnes image model and save it as a PNG file.',
  'Use it whenever the user asks for a picture, illustration, cover, poster, banner, card, icon concept, or any other visual asset.',
  'Write `prompt` in the documented order: [subject] + [scene/environment] + [style] + [lighting] + [composition] + [quality requirements].',
  'Prefer a native `ratio` (16:9 for wide banners, 9:16 for covers and phone screens, 21:9 for cinematic bands, 1:1 for square art); non-native pixel sizes such as 1920x1080 are silently normalized by the API, so ask for `size: "2K"` plus a `ratio` and crop later if exact pixels matter.',
  'Pass `images` (absolute local paths or http(s) URLs) to edit a reference image or compose several into one.',
  'The tool returns the absolute path of the file it wrote; the model cannot see the image, so describe the result in text and give the user the path or a markdown image link.',
  `Available models: ${MODEL_IDS.join(', ')}. The default and the Active model are configurable in the plugin console (Settings -> Agnes Image, or /agnes-image/console).`,
  'Generating takes seconds to tens of seconds, and every size tier is currently free.',
].join(' ')

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string', description: 'Absolute path of the saved PNG' },
    url: { type: ['string', 'null'], description: 'Hosted URL the API returned, when it returned one' },
    bytes: { type: 'integer', description: 'Size of the saved file in bytes' },
    model: { type: 'string' },
    size: { type: 'string' },
    ratio: { type: 'string' },
    nativePixels: { type: ['string', 'null'], description: 'Native pixel size for this ratio and tier, when known' },
    prompt: { type: 'string', description: 'The prompt that was sent' },
    revisedPrompt: { type: ['string', 'null'], description: 'The prompt the API rewrote it into, when it did' },
    keySource: { type: 'string', description: 'Where the API key came from (never the key itself)' },
  },
  required: ['ok', 'path', 'bytes', 'model', 'size', 'ratio', 'prompt'],
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function renderResult(value) {
  if (!value || typeof value !== 'object') return String(value)
  if (value.ok === false) return `Agnes image generation failed: ${value.error ?? 'unknown error'}`

  const lines = [
    `${value.model ?? MODEL} generated 1 image (${value.nativePixels ?? `${value.size} ${value.ratio}`}, ${formatBytes(value.bytes)}).`,
    `Saved to: ${value.path}`,
  ]
  if (value.url) lines.push(`Hosted URL: ${value.url}`)
  if (value.revisedPrompt && value.revisedPrompt !== value.prompt) {
    lines.push(`Revised prompt: ${value.revisedPrompt}`)
  }
  lines.push('')
  lines.push(`Markdown: ![${value.prompt?.slice(0, 80) ?? 'generated image'}](<${value.path}>)`)
  lines.push('The image itself cannot be displayed to you: describe it in words and hand the path to the user.')
  return lines.join('\n')
}

function describeCall(args) {
  if (!args || typeof args !== 'object') return 'Generating an image'
  const parts = [`Generating an image (${args.ratio ?? '1:1'} @ ${args.size ?? 'dynamic'})`]
  if (typeof args.prompt === 'string' && args.prompt.trim()) parts.push(args.prompt.trim())
  if (Array.isArray(args.images) && args.images.length > 0) {
    parts.push(`from ${args.images.length} reference image(s)`)
  }
  return parts.join('\n')
}

/**
 * Merge the three sources of truth, most specific first:
 *
 *   1. `config` — the cordis.patch.yml row, i.e. an explicit operator override.
 *   2. settings.json — what the console writes.
 *   3. built-in defaults.
 *
 * Deliberately resolved per call rather than cached at apply() time: the whole
 * point of the console is that changing a value takes effect on the next image
 * without a reload.
 */
function effectiveConfig(config = {}) {
  const settings = loadSettings()
  const pick = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')

  return {
    ...settings,
    model: pick(config.model, settings.model, MODEL),
    defaultSize: pick(config.defaultSize, settings.defaultSize, '2K'),
    defaultRatio: pick(config.defaultRatio, settings.defaultRatio, '1:1'),
    outDir: pick(config.outDir, settings.outDir, DEFAULT_OUT_DIR),
    timeoutMs: pick(config.timeoutMs, settings.timeoutMs, DEFAULT_TIMEOUT_MS),
    retries: pick(config.retries, settings.retries, DEFAULT_RETRIES),
    endpoint: pick(config.endpoint, settings.endpoint, ENDPOINT),
    keyFile: pick(config.keyFile, settings.keyFile),
  }
}

function agnesTool(toolName, config) {
  return {
    name: toolName,
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'What to draw, ordered [subject] + [scene/environment] + [style] + [lighting] + [composition] + [quality]. Be concrete and visual; name the medium and the mood rather than saying "beautiful".',
        },
        size: {
          type: 'string',
          enum: SIZES,
          description: 'Output tier: 1K, 2K (default), 3K or 4K. Higher tiers cost more time, not money.',
        },
        ratio: {
          type: 'string',
          enum: RATIOS,
          description:
            'Aspect ratio, default 1:1. Native pairs: 16:9 wide, 9:16 tall, 21:9 cinematic, 1:1 square, plus 4:3, 3:4, 3:2, 2:3.',
        },
        model: {
          type: 'string',
          enum: MODEL_IDS,
          description: `Optional model override for this one call. Defaults to the console's Active model (${MODEL}).`,
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional reference images for image-to-image editing or multi-image composition: absolute local file paths or public http(s) URLs.',
        },
        out: {
          type: 'string',
          description:
            'Optional absolute path of the PNG to write. Defaults to an auto-named file under the plugin output directory.',
        },
      },
      required: ['prompt'],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
    },
    get timeoutMs() {
      return effectiveConfig(config).timeoutMs + 60_000
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({
      card: 'generic',
      title: toolName,
      kind: 'other',
      rawInput: args,
      content: [{ type: 'text', text: describeCall(args) }],
    }),
    async execute(args, exec) {
      const prompt = args?.prompt
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error(`${toolName} needs a non-empty string "prompt".`)
      }

      const requested = typeof args.out === 'string' && args.out.trim() ? args.out.trim() : null
      if (requested && !isAbsolute(requested)) {
        throw new Error(`${toolName} needs "out" to be an absolute path (got ${JSON.stringify(requested)}).`)
      }

      // Read settings now, not at apply() time, so console edits apply at once.
      const merged = effectiveConfig(config)
      const started = Date.now()

      const result = await generate({
        prompt,
        size: typeof args.size === 'string' && args.size ? args.size : merged.defaultSize,
        ratio: typeof args.ratio === 'string' && args.ratio ? args.ratio : merged.defaultRatio,
        images: Array.isArray(args.images) ? args.images : undefined,
        model: typeof args.model === 'string' && MODEL_IDS.includes(args.model) ? args.model : merged.model,
        endpoint: merged.endpoint,
        retries: merged.retries,
        timeoutMs: merged.timeoutMs,
        signal: exec?.signal,
        config: merged,
      })

      const outPath = requested ?? defaultOutPath(result.prompt, merged.outDir)
      const saved = saveImage(result.bytes, outPath)
      const ms = Date.now() - started

      if (merged.saveHistory !== false) {
        // Bookkeeping only: appendHistory never throws, so a history problem can
        // never turn a successful generation into a failed tool call.
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
          source: 'tool',
          references: Array.isArray(args.images) ? args.images.length : 0,
        })
      }

      return {
        ok: true,
        path: saved,
        url: result.url,
        bytes: result.bytes.length,
        model: result.model,
        size: result.size,
        ratio: result.ratio,
        nativePixels: result.nativePixels,
        prompt: result.prompt,
        revisedPrompt: result.revisedPrompt,
        keySource: describeKeySource(merged),
      }
    },
  }
}

export function apply(ctx, config = {}) {
  const toolName = config.toolName || 'agnes_image'
  const disposers = []

  // Fail loudly at load time rather than at the first call: a missing key is a
  // configuration mistake, and discovering it mid-generation wastes a minute.
  try {
    resolveApiKey(effectiveConfig(config))
  } catch (error) {
    console.error(`[agnes-image] no usable API key: ${error?.message ?? error}`)
  }
  console.log(`[agnes-image] API key source: ${describeKeySource(effectiveConfig(config))}`)
  console.log(`[agnes-image] console: /agnes-image/console`)

  // A duplicate of the chosen name in the same layer, or a preview-era surface
  // change, must not take the rest of the plugin down. The disposer is returned
  // so an unmount (hot-reload, toggle off) actually unregisters the tool:
  // without it a re-mount stacks a second registration on top of the first.
  try {
    const disposeTool = ctx.tools.register(agnesTool(toolName, config))
    if (typeof disposeTool === 'function') disposers.push(disposeTool)
  } catch (error) {
    console.error(`[agnes-image] ${toolName} registration skipped: ${error}`)
  }

  // Routes are optional: a headless host has no web server, and that must not
  // stop the image tool from working.
  try {
    const disposeInject = ctx.inject(['webServer'], (scope) => {
      try {
        for (const dispose of registerRoutes(ctx, scope)) {
          if (typeof dispose === 'function') disposers.push(dispose)
        }
        console.log(`[agnes-image] console routes mounted at ${describeConsoleUrl(scope)}`)
      } catch (error) {
        console.error(`[agnes-image] console routes skipped: ${error}`)
      }
    })
    if (typeof disposeInject === 'function') disposers.push(disposeInject)
  } catch (error) {
    console.error(`[agnes-image] console unavailable: ${error}`)
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* already gone */
      }
    }
  }
}

function describeConsoleUrl(scope) {
  const port = scope?.webServer?.port
  return Number.isFinite(port) ? `http://127.0.0.1:${port}/agnes-image/console` : '/agnes-image/console'
}

export { IMAGE_MODELS, NATIVE_PIXELS, RATIOS, SIZES }
