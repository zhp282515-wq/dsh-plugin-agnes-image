// Agnes Image console.
//
// Plain DOM, no framework and no build step: this page is served straight off
// disk by the plugin's host half, so anything requiring a bundler would turn
// every small change into a packaging problem. Requests use absolute
// `/agnes-image/...` paths so the page behaves the same at `/console`,
// `/console/`, and inside the settings iframe (where the base URL differs).
//
// All copy lives in STRINGS below and is applied through `t()`, so the whole
// page switches between English and Chinese without a reload.

(() => {
  'use strict'

  const PREFIX = '/agnes-image'
  const $ = (id) => document.getElementById(id)

  // -------------------------------------------------------------- strings --
  //
  // One entry per string, both languages side by side: a missing translation is
  // then obvious in review rather than hiding in a parallel file. `{name}`
  // placeholders are filled from the params object passed to `t()`.

  const STRINGS = {
    'app.title': { en: 'Agnes Image · Console', zh: 'Agnes 生图 · 控制台' },
    'app.name': { en: 'Agnes Image', zh: 'Agnes 生图' },
    'boot.loading': { en: 'Loading…', zh: '加载中…' },
    'boot.failed': { en: 'Failed to load state', zh: '状态加载失败' },

    'lang.title': { en: 'Language', zh: '语言' },
    'lang.auto': { en: 'Auto', zh: '跟随界面' },
    'lang.en': { en: 'English', zh: 'English' },
    'lang.zh': { en: '中文', zh: '中文' },

    'action.openTab': { en: 'Open in tab', zh: '在新标签页打开' },
    'action.reload': { en: 'Reload', zh: '刷新' },
    'action.refresh': { en: 'Refresh', zh: '刷新' },
    'action.clear': { en: 'Clear', zh: '清除' },
    'action.use': { en: 'Use', zh: '使用' },
    'action.delete': { en: 'Delete', zh: '删除' },
    'action.saveKey': { en: 'Save key', zh: '保存密钥' },
    'action.openFolder': { en: 'Open folder', zh: '打开文件夹' },
    'action.testConnection': { en: 'Test connection', zh: '测试连接' },
    'action.testGenerate': { en: 'Test with a real generation', zh: '实测生成一次' },
    'action.addPreset': { en: 'Add preset', zh: '新增预设' },
    'action.addRefs': { en: 'Add reference image…', zh: '添加参考图…' },
    'action.generate': { en: 'Generate', zh: '生成' },
    'action.uploadFailed': { en: 'upload failed', zh: '上传失败' },

    'model.title': { en: 'Active model', zh: '当前模型' },
    'model.desc': {
      en: 'The model the <code>agnes_image</code> tool uses unless a call overrides it.',
      zh: '除非调用时单独指定，<code>agnes_image</code> 工具默认使用该模型。',
    },
    'model.defaultTag': { en: 'default', zh: '默认' },

    'catalog.agnes-image-2.5-flash.note': {
      en: 'Newest flash image model. Text-to-image, image-to-image and multi-image composition.',
      zh: '最新的 flash 图像模型，支持文生图、图生图与多图合成。',
    },
    'catalog.agnes-image-2.1-flash.note': {
      en: 'Tuned for high-information-density scenes and complex compositions.',
      zh: '面向高信息密度场景与复杂构图调优。',
    },
    'catalog.agnes-image-2.0-flash.note': {
      en: 'Earlier flash image model; simplest of the three.',
      zh: '较早的 flash 图像模型，三者中最简单的一个。',
    },

    'defaults.title': { en: 'Defaults', zh: '默认参数' },
    'defaults.desc': {
      en: 'Applied to every generation that does not name its own values.',
      zh: '未在调用中单独指定时，使用这里的取值。',
    },
    'defaults.size': { en: 'Size tier', zh: '尺寸档位' },
    'defaults.ratio': { en: 'Aspect ratio', zh: '画幅比例' },
    'defaults.pixels': { en: 'Native canvas for {size} at {ratio}: {pixels}', zh: '{size} 档 {ratio} 的原生画布：{pixels}' },
    'defaults.pixelsUnknown': { en: 'unknown native size', zh: '未知原生尺寸' },

    'output.title': { en: 'Output', zh: '输出' },
    'output.desc': { en: 'Where generated PNG files are written.', zh: '生成图片的落盘目录。' },
    'output.placeholder': { en: '/path/to/output', zh: '输出目录的绝对路径' },
    'output.hint': { en: 'Default: {path}', zh: '默认：{path}' },

    'key.title': { en: 'API key', zh: 'API 密钥' },
    'key.desc': {
      en: 'The key is never sent back to this page — only its source and a masked fingerprint.',
      zh: '密钥永远不会回传到本页面，页面只能看到它的来源与掩码指纹。',
    },
    'key.placeholder': { en: 'Paste a new API key to replace the stored one', zh: '粘贴新密钥以替换已保存的那把' },
    'key.notSet': { en: 'not set', zh: '未设置' },
    'key.unknown': { en: 'key: unknown', zh: '密钥：未知' },
    'key.pill': { en: 'key: {source}', zh: '密钥：{source}' },
    'key.pillMissing': { en: 'key: not set', zh: '密钥：未设置' },
    'key.storedIn': { en: 'stored in {path}', zh: '保存在 {path}' },
    'key.fromEnv': {
      en: 'supplied by the environment; the console cannot change it',
      zh: '由环境变量提供，控制台无法修改',
    },
    'key.none': { en: 'no key found', zh: '未找到密钥' },
    'key.needPaste': { en: 'Paste a key first', zh: '请先粘贴一把密钥' },

    'advanced.title': { en: 'Advanced', zh: '高级' },
    'advanced.desc': {
      en: 'Timeouts, retries and the endpoint. Leave the endpoint empty for the default.',
      zh: '超时、重试与接口地址。接口地址留空即使用默认值。',
    },
    'advanced.timeout': { en: 'Timeout (ms)', zh: '超时（毫秒）' },
    'advanced.retries': { en: 'Retries', zh: '重试次数' },
    'advanced.endpoint': { en: 'Endpoint', zh: '接口地址' },
    'advanced.history': { en: 'Record every generated image in the history', zh: '把每次生成的图片记入历史' },

    'presets.title': { en: 'Prompt presets', zh: '提示词预设' },
    'presets.desc': { en: 'Reusable prompts, offered in the Generate panel.', zh: '可复用的提示词，在生成面板里选用。' },
    'presets.namePlaceholder': { en: 'Preset name', zh: '预设名称' },
    'presets.promptPlaceholder': { en: 'Prompt text', zh: '提示词内容' },
    'presets.none': { en: '— none —', zh: '— 不使用 —' },
    'presets.empty': { en: 'No presets yet.', zh: '暂无预设。' },
    'presets.needPrompt': { en: 'A preset needs a prompt', zh: '预设至少要有一段提示词' },

    'generate.title': { en: 'Generate', zh: '生成' },
    'generate.desc': { en: 'Runs through the same client the tool uses.', zh: '与工具走同一条客户端链路。' },
    'generate.preset': { en: 'Preset', zh: '预设' },
    'generate.prompt': { en: 'Prompt', zh: '提示词' },
    'generate.promptPlaceholder': {
      en: '[subject] + [scene] + [style] + [lighting] + [composition] + [quality]',
      zh: '[主体] + [场景] + [风格] + [光照] + [构图] + [质量要求]',
    },
    'generate.needPrompt': { en: 'Write a prompt first', zh: '请先写一段提示词' },
    'generate.running': { en: 'Generating…', zh: '生成中…' },
    'generate.waiting': {
      en: 'Waiting on the API; this usually takes 10-60 s.',
      zh: '正在等待接口返回，通常需要 10–60 秒。',
    },
    'generate.done': { en: 'Done.', zh: '完成。' },
    'generate.failed': { en: 'Generation failed', zh: '生成失败' },
    'generate.ok': { en: 'Image generated', zh: '图片已生成' },
    'generate.resultAlt': { en: 'Generated result', zh: '生成结果' },
    'generate.remove': { en: 'Remove', zh: '移除' },
    'generate.imageAlt': { en: 'generated image', zh: '生成的图片' },

    'history.title': { en: 'History', zh: '历史记录' },
    'history.none': { en: 'Nothing recorded yet', zh: '暂无记录' },
    'history.missing': { en: 'file missing', zh: '文件已丢失' },
    'history.countOne': { en: '{n} recorded image', zh: '已记录 {n} 张' },
    'history.countMany': { en: '{n} recorded images', zh: '已记录 {n} 张' },
    'history.cleared': { en: 'History cleared', zh: '历史已清空' },

    'test.running': { en: 'Testing…', zh: '测试中…' },
    'test.authOk': {
      en: 'Key accepted in {ms} ms; {found}/{total} image models visible.',
      zh: '密钥有效，耗时 {ms} 毫秒；可见 {found}/{total} 个图像模型。',
    },
    'test.genOk': {
      en: 'Real generation succeeded in {s} s ({pixels}, {bytes}).',
      zh: '实测生成成功，耗时 {s} 秒（{pixels}，{bytes}）。',
    },
    'test.failed': { en: 'Failed at {stage}: {error}', zh: '在 {stage} 阶段失败：{error}' },

    'toast.modelSet': { en: 'Model set to {name}', zh: '模型已切换为 {name}' },
    'toast.sizeSaved': { en: 'Default size saved', zh: '默认档位已保存' },
    'toast.ratioSaved': { en: 'Default ratio saved', zh: '默认画幅已保存' },
    'toast.outDirSaved': { en: 'Output directory saved', zh: '输出目录已保存' },
    'toast.keySaved': { en: 'API key saved', zh: 'API 密钥已保存' },
    'toast.keyCleared': { en: 'Stored API key removed', zh: '已删除保存的 API 密钥' },
    'toast.timeoutSaved': { en: 'Timeout saved', zh: '超时已保存' },
    'toast.retriesSaved': { en: 'Retries saved', zh: '重试次数已保存' },
    'toast.endpointSaved': { en: 'Endpoint saved', zh: '接口地址已保存' },
    'toast.historyOn': { en: 'History on', zh: '历史记录已开启' },
    'toast.historyOff': { en: 'History off', zh: '历史记录已关闭' },
    'toast.presetAdded': { en: 'Preset added', zh: '预设已新增' },
    'toast.presetDeleted': { en: 'Preset deleted', zh: '预设已删除' },
    'toast.presetLoaded': { en: 'Loaded preset "{name}"', zh: '已载入预设“{name}”' },
    'toast.revealFailed': { en: 'could not open the folder', zh: '无法打开该文件夹' },
    'toast.errorPrefix': { en: '', zh: '失败：' },
  }

  /** Resolved UI language: 'en' or 'zh'. */
  let lang = 'en'

  function t(key, params, fallback) {
    const entry = STRINGS[key]
    let text = entry ? entry[lang] ?? entry.en : undefined
    if (text === undefined) text = fallback === undefined ? key : fallback
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      )
    }
    return text
  }

  /**
   * An explicit choice wins over everything; otherwise the host page decides
   * (`?lang=`, set by the settings panel) and only then the browser. The
   * settings panel is what makes this correct inside the iframe, where the
   * page cannot see the application's own locale.
   */
  function resolveLang(saved) {
    if (saved === 'en' || saved === 'zh') return saved
    const requested = new URLSearchParams(location.search).get('lang')
    if (requested === 'en' || requested === 'zh') return requested
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language || '']
    return tags.some((tag) => String(tag).toLowerCase().startsWith('zh')) ? 'zh' : 'en'
  }

  function localeTag() {
    return lang === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** Fill in every static string and attribute marked up in index.html. */
  function applyI18n() {
    document.documentElement.lang = localeTag()
    document.title = t('app.title')
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n)
    // Only our own dictionary reaches innerHTML — it exists so a description
    // can keep its inline <code> element while still being translatable.
    for (const node of document.querySelectorAll('[data-i18n-html]')) node.innerHTML = t(node.dataset.i18nHtml)
    for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
      node.placeholder = t(node.dataset.i18nPlaceholder)
    }
    for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle)
    for (const node of document.querySelectorAll('[data-i18n-alt]')) node.alt = t(node.dataset.i18nAlt)
  }

  // Pick a theme before the first paint. The host passes `?theme=` when it
  // embeds this page in the settings panel; a bare tab falls back to the OS.
  {
    const requested = new URLSearchParams(location.search).get('theme')
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches === true
    document.documentElement.dataset.theme =
      requested === 'light' || requested === 'dark' ? requested : prefersLight ? 'light' : 'dark'
  }

  // Tokens this stylesheet consumes. tokens.css ships a copy of the values dsh
  // was built with; when the host embeds us, we re-read the live ones so the
  // console keeps matching a shell that has since been restyled. Deliberately
  // an allow-list rather than a sweep of every --dsw-* property: a fixed list
  // cannot pick up something unexpected and repaint the page with it.
  const HOST_TOKENS = [
    '--dsw-radius-sm',
    '--dsw-radius-md',
    '--dsw-focus-ring-width',
    '--dsw-font-family',
    '--dsh-content-font-size',
    '--dsh-content-font-size-secondary',
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--dsw-alias-border-l4',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-label-caption',
    '--dsw-alias-label-primary-foreground',
    '--dsw-alias-brand-primary',
    '--dsw-alias-button-primary-hover',
    '--dsw-alias-button-ghost-active-fill',
    '--dsw-alias-button-elevated-fill',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-hover-solid',
    '--dsw-alias-interactive-bg-active',
    '--dsw-alias-link',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-toast-bg',
  ]

  function syncHostTokens() {
    let hostDocument = null
    try {
      if (window.parent === window) return
      hostDocument = window.parent.document
      if (!hostDocument?.body) return
    } catch {
      return // cross-origin parent: keep the values tokens.css shipped with
    }
    const computed = window.parent.getComputedStyle(hostDocument.body)
    const style = document.documentElement.style
    for (const name of HOST_TOKENS) {
      const value = computed.getPropertyValue(name).trim()
      if (value) style.setProperty(name, value)
    }
  }

  syncHostTokens()

  /** @type {any} */
  let state = null
  /** Reference images queued for the next generation (absolute paths). */
  let refs = []

  // ------------------------------------------------------------------ http --

  async function api(path, options = {}) {
    const init = { method: options.method || 'GET', headers: {} }
    if (options.body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
    const response = await fetch(PREFIX + path, init)
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { ok: false, error: text || `HTTP ${response.status}` }
    }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    return data
  }

  // ----------------------------------------------------------------- toast --

  let toastTimer = 0

  function toast(message, kind = '') {
    const node = $('toast')
    node.textContent = message
    node.className = `toast${kind ? ` toast-${kind}` : ''}`
    node.hidden = false
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      node.hidden = true
    }, kind === 'bad' ? 6000 : 2600)
  }

  // Server errors are technical strings from the host half and stay as they
  // are; only the surrounding sentence is translated.
  function fail(error) {
    toast(`${t('toast.errorPrefix')}${String(error?.message || error)}`, 'bad')
  }

  // ---------------------------------------------------------------- helpers --

  function option(value, label) {
    const node = document.createElement('option')
    node.value = value
    node.textContent = label
    return node
  }

  function fillSelect(node, values, current) {
    node.replaceChildren(...values.map((value) => option(value, value)))
    if (current !== undefined) node.value = current
  }

  function pixelsFor(size, ratio) {
    return state?.catalog?.nativePixels?.[ratio]?.[size] || t('defaults.pixelsUnknown')
  }

  function human(bytes) {
    if (!Number.isFinite(bytes)) return '?'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function shortTime(iso) {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString(localeTag())
  }

  // ----------------------------------------------------------------- state --

  async function save(patch, message) {
    const next = await api('/settings', { method: 'POST', body: patch })
    applyState(next)
    if (message) toast(message, 'ok')
  }

  function applyState(next) {
    // The server response for /settings is a full state object; /history and
    // /key return one too, so everything funnels through here.
    if (next && next.settings) state = next
    renderTopbar()
    renderModels()
    renderDefaults()
    renderOutput()
    renderKey()
    renderAdvanced()
    renderPresets()
  }

  async function refreshHistory() {
    const data = await api('/history?limit=120')
    const grid = $('history-grid')
    const items = Array.isArray(data.items) ? data.items : []

    $('history-sub').textContent = data.count
      ? t(data.count === 1 ? 'history.countOne' : 'history.countMany', { n: data.count })
      : t('history.none')

    grid.replaceChildren(
      ...items.map((item) => {
        const tile = document.createElement('a')
        tile.className = `tile${item.missing ? ' tile-bad' : ''}`
        tile.href = `${PREFIX}/image?path=${encodeURIComponent(item.path)}`
        tile.target = '_blank'
        tile.rel = 'noreferrer'
        tile.title = `${item.path}\n${item.prompt || ''}`

        if (!item.missing) {
          const img = document.createElement('img')
          img.loading = 'lazy'
          img.alt = item.prompt || t('generate.imageAlt')
          img.src = tile.href
          tile.append(img)
        } else {
          const badge = document.createElement('span')
          badge.className = 'tile-badge'
          badge.textContent = t('history.missing')
          tile.append(badge)
        }

        const meta = document.createElement('div')
        meta.className = 'tile-meta'
        meta.textContent = [item.nativePixels || `${item.size || ''} ${item.ratio || ''}`.trim(), item.model, shortTime(item.at)]
          .filter(Boolean)
          .join('\n')
        tile.append(meta)
        return tile
      }),
    )
  }

  // ---------------------------------------------------------------- render --

  function renderTopbar() {
    const key = state.key || {}
    const pill = $('key-pill')
    pill.textContent = key.present ? t('key.pill', { source: key.source }) : t('key.pillMissing')
    pill.className = `pill ${key.present ? 'pill-ok' : 'pill-warn'}`

    $('sel-lang').value = state.settings.locale || 'auto'

    const model = (state.catalog?.models || []).find((entry) => entry.id === state.settings.model)
    $('brand-sub').textContent = `${model?.label || state.settings.model} · ${state.settings.defaultSize} ${state.settings.defaultRatio}`
  }

  function renderModels() {
    const container = $('models-list')
    const active = state.settings.model
    container.replaceChildren(
      ...(state.catalog?.models || []).map((entry) => {
        const label = document.createElement('label')
        label.className = `model${entry.id === active ? ' is-active' : ''}`

        const input = document.createElement('input')
        input.type = 'radio'
        input.name = 'agnes-model'
        input.value = entry.id
        input.checked = entry.id === active
        input.addEventListener('change', () => {
          if (input.checked) save({ model: entry.id }, t('toast.modelSet', { name: entry.label })).catch(fail)
        })

        const body = document.createElement('div')
        body.className = 'model-body'

        const name = document.createElement('div')
        name.className = 'model-name'
        name.append(entry.label)
        if (entry.id === state.defaults?.model) {
          const tag = document.createElement('span')
          tag.className = 'tag'
          tag.textContent = t('model.defaultTag')
          name.append(tag)
        }

        const id = document.createElement('div')
        id.className = 'model-id'
        id.textContent = entry.id

        // The host half ships English notes with the catalogue; translate by
        // model id and fall back to whatever the server sent, so a model added
        // later still renders something sensible.
        const note = document.createElement('div')
        note.className = 'model-note'
        note.textContent = t(`catalog.${entry.id}.note`, null, entry.note || '')

        body.append(name, id, note)
        label.append(input, body)
        return label
      }),
    )
  }

  function renderDefaults() {
    fillSelect($('sel-size'), state.catalog?.sizes || [], state.settings.defaultSize)
    fillSelect($('sel-ratio'), state.catalog?.ratios || [], state.settings.defaultRatio)
    renderPixelPreview()

    fillSelect($('gen-size'), state.catalog?.sizes || [], state.settings.defaultSize)
    fillSelect($('gen-ratio'), state.catalog?.ratios || [], state.settings.defaultRatio)
    $('gen-model').replaceChildren(
      ...(state.catalog?.models || []).map((entry) => option(entry.id, entry.label)),
    )
    $('gen-model').value = state.settings.model
  }

  function renderPixelPreview() {
    const size = $('sel-size').value || state.settings.defaultSize
    const ratio = $('sel-ratio').value || state.settings.defaultRatio
    $('pixel-preview').textContent = t('defaults.pixels', { size, ratio, pixels: pixelsFor(size, ratio) })
  }

  function renderOutput() {
    $('in-outdir').value = state.settings.outDir
    $('outdir-hint').textContent = t('output.hint', { path: state.defaults?.outDir || '' })
  }

  function renderKey() {
    const key = state.key || {}
    $('key-masked').textContent = key.masked || t('key.notSet')
    $('key-source').textContent = key.file
      ? t('key.storedIn', { path: key.file })
      : key.present
        ? t('key.fromEnv')
        : t('key.none')
    $('btn-key-clear').disabled = !key.editable
  }

  function renderAdvanced() {
    $('in-timeout').value = state.settings.timeoutMs
    $('in-retries').value = state.settings.retries
    $('in-endpoint').value = state.settings.endpoint || ''
    $('in-endpoint').placeholder = state.endpoint || ''
    $('chk-history').checked = state.settings.saveHistory !== false
  }

  function renderPresets() {
    const presets = state.settings.presets || []
    if (!presets.length) {
      const empty = document.createElement('p')
      empty.className = 'field-hint'
      empty.textContent = t('presets.empty')
      $('presets-list').replaceChildren(empty)
    } else {
      $('presets-list').replaceChildren(
        ...presets.map((preset) => {
          const row = document.createElement('div')
          row.className = 'preset'

          const body = document.createElement('div')
          body.className = 'preset-body'
          const name = document.createElement('div')
          name.className = 'preset-name'
          name.textContent = preset.name
          const prompt = document.createElement('div')
          prompt.className = 'preset-prompt'
          prompt.textContent = `${preset.size} ${preset.ratio} · ${preset.prompt}`
          body.append(name, prompt)

          const use = document.createElement('button')
          use.type = 'button'
          use.className = 'btn btn-ghost'
          use.textContent = t('action.use')
          use.addEventListener('click', () => {
            $('gen-prompt').value = preset.prompt
            fillSelect($('gen-size'), state.catalog.sizes, preset.size)
            fillSelect($('gen-ratio'), state.catalog.ratios, preset.ratio)
            $('sel-preset').value = preset.id
            toast(t('toast.presetLoaded', { name: preset.name }), 'ok')
          })

          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'btn btn-danger'
          remove.textContent = t('action.delete')
          remove.addEventListener('click', () => {
            save({ presets: presets.filter((entry) => entry.id !== preset.id) }, t('toast.presetDeleted')).catch(fail)
          })

          row.append(body, use, remove)
          return row
        }),
      )
    }

    const select = $('sel-preset')
    select.replaceChildren(option('', t('presets.none')), ...presets.map((preset) => option(preset.id, preset.name)))
  }

  // -------------------------------------------------------------- generate --

  function renderRefs() {
    $('refs-list').replaceChildren(
      ...refs.map((path, index) => {
        const row = document.createElement('div')
        row.className = 'ref'

        const text = document.createElement('span')
        text.textContent = path
        text.title = path

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.textContent = '×'
        remove.title = t('generate.remove')
        remove.addEventListener('click', () => {
          refs.splice(index, 1)
          renderRefs()
        })

        row.append(text, remove)
        return row
      }),
    )
  }

  async function generate() {
    const prompt = $('gen-prompt').value.trim()
    if (!prompt) {
      toast(t('generate.needPrompt'), 'bad')
      return
    }

    const button = $('btn-generate')
    button.disabled = true
    const original = button.textContent
    button.innerHTML = `<span class="spinner"></span> ${t('generate.running')}`
    $('gen-status').textContent = t('generate.waiting')
    $('gen-status').className = 'hint'

    try {
      const result = await api('/generate', {
        method: 'POST',
        body: {
          prompt,
          size: $('gen-size').value,
          ratio: $('gen-ratio').value,
          model: $('gen-model').value,
          images: refs,
        },
      })

      if (!result.ok) throw new Error(result.error || t('generate.failed'))

      $('gen-image').src = `${result.viewUrl}&v=${Date.now()}`
      $('gen-result').hidden = false
      $('gen-meta').textContent = [
        result.nativePixels || '',
        human(result.bytes),
        `${(result.ms / 1000).toFixed(1)} s`,
        result.model,
        result.path,
      ]
        .filter(Boolean)
        .join('\n')
      $('gen-status').textContent = t('generate.done')
      $('gen-status').className = 'hint hint-ok'
      toast(t('generate.ok'), 'ok')
      await refreshHistory()
    } catch (error) {
      $('gen-status').textContent = String(error?.message || error)
      $('gen-status').className = 'hint hint-bad'
      toast(t('generate.failed'), 'bad')
    } finally {
      button.disabled = false
      button.textContent = original
    }
  }

  async function testKey(mode) {
    const label = $('test-result')
    label.textContent = t('test.running')
    label.className = 'hint'
    try {
      const result = await api('/test', { method: 'POST', body: { mode } })
      if (result.ok) {
        label.textContent =
          mode === 'generate'
            ? t('test.genOk', {
                s: (result.ms / 1000).toFixed(1),
                pixels: result.nativePixels,
                bytes: human(result.bytes),
              })
            : t('test.authOk', {
                ms: result.ms,
                found: result.imageModels.length,
                total: state.catalog.models.length,
              })
        label.className = 'hint hint-ok'
      } else {
        label.textContent = t('test.failed', { stage: result.stage, error: result.error })
        label.className = 'hint hint-bad'
      }
    } catch (error) {
      label.textContent = String(error?.message || error)
      label.className = 'hint hint-bad'
    }
  }

  // ---------------------------------------------------------------- language --

  /**
   * Switch the whole page to `next`, optionally persisting the choice. A
   * persisted value of `auto` still resolves to a concrete language here, so
   * `next` is always 'en' or 'zh'.
   */
  function setLang(next) {
    lang = next === 'zh' ? 'zh' : 'en'
    applyI18n()
    if (!state) return
    renderTopbar()
    renderModels()
    renderDefaults()
    renderOutput()
    renderKey()
    renderAdvanced()
    renderPresets()
    renderRefs()
    renderPixelPreview()
  }

  // ------------------------------------------------------------------ wiring --

  function bind() {
    $('btn-reload').addEventListener('click', () => location.reload())
    $('btn-open-tab').addEventListener('click', () =>
      window.open(
        `${PREFIX}/console?theme=${document.documentElement.dataset.theme}&lang=${lang}`,
        '_blank',
        'noopener',
      ),
    )

    $('sel-lang').addEventListener('change', (event) => {
      // Chrome restores form state on reload and dispatches a synthetic change
      // for it, which used to overwrite the saved preference with whatever the
      // picker happened to be showing. Only a real pick should persist.
      if (!event.isTrusted) return
      const choice = event.target.value
      // Apply immediately so the page never lags behind the picker, then save;
      // the saved value decides what the next load resolves to.
      setLang(choice === 'auto' ? resolveLang('auto') : choice)
      save({ locale: choice }).catch(fail)
      refreshHistory().catch(() => {})
    })

    $('sel-size').addEventListener('change', (event) => {
      renderPixelPreview()
      save({ defaultSize: event.target.value }, t('toast.sizeSaved')).catch(fail)
    })
    $('sel-ratio').addEventListener('change', (event) => {
      renderPixelPreview()
      save({ defaultRatio: event.target.value }, t('toast.ratioSaved')).catch(fail)
    })

    const saveOutDir = () => {
      const value = $('in-outdir').value.trim()
      if (!value || value === state.settings.outDir) return
      save({ outDir: value }, t('toast.outDirSaved')).catch(fail)
    }
    $('in-outdir').addEventListener('blur', saveOutDir)
    $('in-outdir').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveOutDir()
    })
    $('btn-reveal').addEventListener('click', () => {
      api(`/reveal?path=${encodeURIComponent($('in-outdir').value.trim())}`, { method: 'POST' })
        .then((result) => {
          if (!result.ok) toast(result.error || t('toast.revealFailed'), 'bad')
        })
        .catch(fail)
    })

    $('btn-key-save').addEventListener('click', async () => {
      const key = $('in-key').value.trim()
      if (!key) {
        toast(t('key.needPaste'), 'bad')
        return
      }
      try {
        applyState(await api('/key', { method: 'POST', body: { key } }))
        $('in-key').value = ''
        toast(t('toast.keySaved'), 'ok')
      } catch (error) {
        fail(error)
      }
    })

    $('btn-key-clear').addEventListener('click', async () => {
      try {
        applyState(await api('/key', { method: 'POST', body: { clear: true } }))
        toast(t('toast.keyCleared'), 'ok')
      } catch (error) {
        fail(error)
      }
    })

    $('btn-key-test').addEventListener('click', () => testKey('auth'))
    $('btn-key-test-gen').addEventListener('click', () => testKey('generate'))

    const bindNumber = (id, field, message) => {
      const element = $(id)
      const commit = () => {
        const value = Number(element.value)
        if (!Number.isFinite(value) || value === state.settings[field]) return
        save({ [field]: value }, message).catch(fail)
      }
      element.addEventListener('blur', commit)
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commit()
      })
    }
    bindNumber('in-timeout', 'timeoutMs', t('toast.timeoutSaved'))
    bindNumber('in-retries', 'retries', t('toast.retriesSaved'))

    const endpoint = $('in-endpoint')
    const saveEndpoint = () => {
      const value = endpoint.value.trim()
      if (value === (state.settings.endpoint || '')) return
      save({ endpoint: value }, t('toast.endpointSaved')).catch(fail)
    }
    endpoint.addEventListener('blur', saveEndpoint)
    endpoint.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveEndpoint()
    })

    $('chk-history').addEventListener('change', (event) => {
      save(
        { saveHistory: event.target.checked },
        t(event.target.checked ? 'toast.historyOn' : 'toast.historyOff'),
      ).catch(fail)
    })

    $('btn-preset-add').addEventListener('click', () => {
      const name = $('in-preset-name').value.trim()
      const prompt = $('in-preset-prompt').value.trim()
      if (!prompt) {
        toast(t('presets.needPrompt'), 'bad')
        return
      }
      const preset = {
        name: name || prompt.slice(0, 40),
        prompt,
        size: $('sel-size').value,
        ratio: $('sel-ratio').value,
      }
      save({ presets: [...(state.settings.presets || []), preset] }, t('toast.presetAdded'))
        .then(() => {
          $('in-preset-name').value = ''
          $('in-preset-prompt').value = ''
        })
        .catch(fail)
    })

    $('sel-preset').addEventListener('change', (event) => {
      const preset = (state.settings.presets || []).find((entry) => entry.id === event.target.value)
      if (!preset) return
      $('gen-prompt').value = preset.prompt
      fillSelect($('gen-size'), state.catalog.sizes, preset.size)
      fillSelect($('gen-ratio'), state.catalog.ratios, preset.ratio)
    })

    $('gen-size').addEventListener('change', renderPixelPreview)
    $('gen-ratio').addEventListener('change', renderPixelPreview)

    $('btn-pick-refs').addEventListener('click', () => $('ref-input').click())
    $('ref-input').addEventListener('change', async (event) => {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      for (const file of files) {
        try {
          const response = await fetch(`${PREFIX}/upload`, {
            method: 'POST',
            headers: { 'x-filename': encodeURIComponent(file.name) },
            body: file,
          })
          const data = await response.json()
          if (!data.ok) throw new Error(data.error || t('action.uploadFailed'))
          refs.push(data.path)
          renderRefs()
        } catch (error) {
          fail(error)
        }
      }
    })

    $('btn-generate').addEventListener('click', generate)

    $('btn-history-refresh').addEventListener('click', () => {
      refreshHistory().catch(fail)
    })
    $('btn-history-clear').addEventListener('click', () => {
      api('/history/clear', { method: 'POST' })
        .then(() => {
          toast(t('history.cleared'), 'ok')
          return refreshHistory()
        })
        .catch(fail)
    })
  }

  // -------------------------------------------------------------------- boot --

  async function boot() {
    bind()
    // Paint the static shell in the best-guess language before the first
    // request lands, so a slow host never shows an English flash to a Chinese
    // reader.
    setLang(resolveLang('auto'))
    try {
      const next = await api('/state')
      state = next
      setLang(resolveLang(next?.settings?.locale))
      await refreshHistory()
    } catch (error) {
      $('brand-sub').textContent = t('boot.failed')
      fail(error)
    }
  }

  document.addEventListener('DOMContentLoaded', boot)
})()
