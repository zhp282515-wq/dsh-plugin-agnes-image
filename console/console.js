// Agnes Image console.
//
// Plain DOM, no framework and no build step: this page is served straight off
// disk by the plugin's host half, so anything requiring a bundler would turn
// every small change into a packaging problem. Requests use absolute
// `/agnes-image/...` paths so the page behaves the same at `/console`,
// `/console/` and inside the settings iframe (where the base URL differs).

(() => {
  'use strict'

  const PREFIX = '/agnes-image'
  const $ = (id) => document.getElementById(id)

  // Pick a theme before the first paint. The host passes `?theme=` when it
  // embeds this page in the settings panel; a bare tab falls back to the OS.
  {
    const requested = new URLSearchParams(location.search).get('theme')
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches === true
    document.documentElement.dataset.theme =
      requested === 'light' || requested === 'dark' ? requested : prefersLight ? 'light' : 'dark'
  }

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

  function fail(error) {
    toast(String(error?.message || error), 'bad')
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
    return state?.catalog?.nativePixels?.[ratio]?.[size] || 'unknown native size'
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
    return date.toLocaleString()
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
      ? `${data.count} recorded image${data.count === 1 ? '' : 's'}`
      : 'Nothing recorded yet'

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
          img.alt = item.prompt || 'generated image'
          img.src = tile.href
          tile.append(img)
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
    pill.textContent = key.present ? `key: ${key.source}` : 'key: not set'
    pill.className = `pill ${key.present ? 'pill-ok' : 'pill-warn'}`

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
          if (input.checked) save({ model: entry.id }, `Model set to ${entry.label}`).catch(fail)
        })

        const body = document.createElement('div')
        body.className = 'model-body'

        const name = document.createElement('div')
        name.className = 'model-name'
        name.append(entry.label)
        if (entry.id === state.defaults?.model) {
          const tag = document.createElement('span')
          tag.className = 'tag'
          tag.textContent = 'default'
          name.append(tag)
        }

        const id = document.createElement('div')
        id.className = 'model-id'
        id.textContent = entry.id

        const note = document.createElement('div')
        note.className = 'model-note'
        note.textContent = entry.note || ''

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
    $('pixel-preview').textContent = `Native canvas for ${size} at ${ratio}: ${pixelsFor(size, ratio)}`
  }

  function renderOutput() {
    $('in-outdir').value = state.settings.outDir
    $('outdir-hint').textContent = `Default: ${state.defaults?.outDir || ''}`
  }

  function renderKey() {
    const key = state.key || {}
    $('key-masked').textContent = key.masked || 'not set'
    $('key-source').textContent = key.file
      ? `stored in ${key.file}`
      : key.present
        ? 'supplied by the environment; the console cannot change it'
        : 'no key found'
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
        use.textContent = 'Use'
        use.addEventListener('click', () => {
          $('gen-prompt').value = preset.prompt
          fillSelect($('gen-size'), state.catalog.sizes, preset.size)
          fillSelect($('gen-ratio'), state.catalog.ratios, preset.ratio)
          $('sel-preset').value = preset.id
          toast(`Loaded preset "${preset.name}"`, 'ok')
        })

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'btn btn-danger'
        remove.textContent = 'Delete'
        remove.addEventListener('click', () => {
          save({ presets: presets.filter((entry) => entry.id !== preset.id) }, 'Preset deleted').catch(fail)
        })

        row.append(body, use, remove)
        return row
      }),
    )

    const select = $('sel-preset')
    select.replaceChildren(option('', '— none —'), ...presets.map((preset) => option(preset.id, preset.name)))
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
        remove.title = 'Remove'
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
      toast('Write a prompt first', 'bad')
      return
    }

    const button = $('btn-generate')
    button.disabled = true
    const original = button.textContent
    button.innerHTML = '<span class="spinner"></span> Generating…'
    $('gen-status').textContent = 'Waiting on the API; this usually takes 10-60 s.'
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

      if (!result.ok) throw new Error(result.error || 'generation failed')

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
      $('gen-status').textContent = 'Done.'
      $('gen-status').className = 'hint hint-ok'
      toast('Image generated', 'ok')
      await refreshHistory()
    } catch (error) {
      $('gen-status').textContent = String(error?.message || error)
      $('gen-status').className = 'hint hint-bad'
      toast('Generation failed', 'bad')
    } finally {
      button.disabled = false
      button.textContent = original
    }
  }

  async function testKey(mode) {
    const label = $('test-result')
    label.textContent = 'Testing…'
    label.className = 'hint'
    try {
      const result = await api('/test', { method: 'POST', body: { mode } })
      if (result.ok) {
        label.textContent =
          mode === 'generate'
            ? `Real generation succeeded in ${(result.ms / 1000).toFixed(1)} s (${result.nativePixels}, ${human(result.bytes)}).`
            : `Key accepted in ${result.ms} ms; ${result.imageModels.length}/${state.catalog.models.length} image models visible.`
        label.className = 'hint hint-ok'
      } else {
        label.textContent = `Failed at ${result.stage}: ${result.error}`
        label.className = 'hint hint-bad'
      }
    } catch (error) {
      label.textContent = String(error?.message || error)
      label.className = 'hint hint-bad'
    }
  }

  // ------------------------------------------------------------------ wiring --

  function bind() {
    $('btn-reload').addEventListener('click', () => location.reload())
    $('btn-open-tab').addEventListener('click', () =>
      window.open(`${PREFIX}/console?theme=${document.documentElement.dataset.theme}`, '_blank', 'noopener'),
    )

    $('sel-size').addEventListener('change', (event) => {
      renderPixelPreview()
      save({ defaultSize: event.target.value }, 'Default size saved').catch(fail)
    })
    $('sel-ratio').addEventListener('change', (event) => {
      renderPixelPreview()
      save({ defaultRatio: event.target.value }, 'Default ratio saved').catch(fail)
    })

    const saveOutDir = () => {
      const value = $('in-outdir').value.trim()
      if (!value || value === state.settings.outDir) return
      save({ outDir: value }, 'Output directory saved').catch(fail)
    }
    $('in-outdir').addEventListener('blur', saveOutDir)
    $('in-outdir').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveOutDir()
    })
    $('btn-reveal').addEventListener('click', () => {
      api(`/reveal?path=${encodeURIComponent($('in-outdir').value.trim())}`, { method: 'POST' })
        .then((result) => {
          if (!result.ok) toast(result.error || 'could not open the folder', 'bad')
        })
        .catch(fail)
    })

    $('btn-key-save').addEventListener('click', async () => {
      const key = $('in-key').value.trim()
      if (!key) {
        toast('Paste a key first', 'bad')
        return
      }
      try {
        applyState(await api('/key', { method: 'POST', body: { key } }))
        $('in-key').value = ''
        toast('API key saved', 'ok')
      } catch (error) {
        fail(error)
      }
    })

    $('btn-key-clear').addEventListener('click', async () => {
      try {
        applyState(await api('/key', { method: 'POST', body: { clear: true } }))
        toast('Stored API key removed', 'ok')
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
    bindNumber('in-timeout', 'timeoutMs', 'Timeout saved')
    bindNumber('in-retries', 'retries', 'Retries saved')

    const endpoint = $('in-endpoint')
    const saveEndpoint = () => {
      const value = endpoint.value.trim()
      if (value === (state.settings.endpoint || '')) return
      save({ endpoint: value }, 'Endpoint saved').catch(fail)
    }
    endpoint.addEventListener('blur', saveEndpoint)
    endpoint.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveEndpoint()
    })

    $('chk-history').addEventListener('change', (event) => {
      save({ saveHistory: event.target.checked }, event.target.checked ? 'History on' : 'History off').catch(fail)
    })

    $('btn-preset-add').addEventListener('click', () => {
      const name = $('in-preset-name').value.trim()
      const prompt = $('in-preset-prompt').value.trim()
      if (!prompt) {
        toast('A preset needs a prompt', 'bad')
        return
      }
      const preset = {
        name: name || prompt.slice(0, 40),
        prompt,
        size: $('sel-size').value,
        ratio: $('sel-ratio').value,
      }
      save({ presets: [...(state.settings.presets || []), preset] }, 'Preset added')
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
          if (!data.ok) throw new Error(data.error || 'upload failed')
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
          toast('History cleared', 'ok')
          return refreshHistory()
        })
        .catch(fail)
    })
  }

  // -------------------------------------------------------------------- boot --

  async function boot() {
    bind()
    try {
      applyState(await api('/state'))
      await refreshHistory()
    } catch (error) {
      $('brand-sub').textContent = 'Failed to load state'
      fail(error)
    }
  }

  document.addEventListener('DOMContentLoaded', boot)
})()
