// Browser half of the Agnes Image plugin.
//
// It contributes exactly one thing: a section in Settings that embeds the
// console page the host half serves at /agnes-image/console.
//
// Why an iframe instead of a real React panel:
//
//   * The client bundle only reloads when dsh restarts. A panel written against
//     component APIs that differ between releases turns every small fix into a
//     restart-fail-restart loop, while the console page can be reloaded (or
//     opened in a tab, or screenshotted headless) as often as needed.
//   * It depends on `react` alone. No client store, no ui-primitives component
//     signatures, no slot styling conventions to keep in step with the shell.
//   * The page is a plain URL, so it is also usable outside dsh entirely.
//
// Everything real happens on the host: this file is only the doorway.

window.__ModuleLoader__.load({
  id: 'dsh-plugin-agnes-image',
  factory: (require) => {
    const React = require('react')

    const module = { exports: {} }
    const exports = module.exports

    const SECTION_ID = 'agnes-image'
    const CONSOLE_PATH = '/agnes-image/console'
    const SETTINGS_SLOT = 'settings.section'

    /** The shell marks a dark theme on <body>; the iframe cannot inherit it. */
    function currentTheme() {
      try {
        if (document.body?.hasAttribute('data-ds-dark-theme')) return 'dark'
        const dataset = document.documentElement?.dataset
        if (dataset?.dsDarkTheme !== undefined) return 'dark'
      } catch {
        /* fall through to the default */
      }
      return 'light'
    }

    /**
     * The console resolves `auto` from this hint. It has to come from here
     * because the iframe cannot see the application's own locale, and its own
     * `prefers-color-scheme`-style fallbacks follow the OS instead. The shell
     * sets `<html lang>` when a locale is configured; the browser tag is the
     * fallback.
     */
    function currentLang() {
      try {
        const tag = document.documentElement?.lang || navigator.language || ''
        return String(tag).toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'en'
      }
    }

    function consoleUrl() {
      return `${CONSOLE_PATH}?theme=${currentTheme()}&lang=${currentLang()}`
    }

    const TEXT = {
      en: {
        summary:
          'Model, defaults, API key, presets, history and a generation workbench. Changes apply to the next image immediately.',
        open: 'Open in a new tab',
        title: 'Agnes Image console',
        section: 'Agnes Image',
      },
      zh: {
        summary: '模型、默认参数、API 密钥、提示词预设、历史记录，以及一个生成工作台。改动对下一张图立即生效。',
        open: '在新标签页打开',
        title: 'Agnes 生图控制台',
        section: 'Agnes 生图',
      },
    }

    const text = () => TEXT[currentLang()]

    function ConsoleSection() {
      const [url] = React.useState(consoleUrl)

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 } },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            },
          },
          React.createElement(
            'p',
            { style: { margin: 0, fontSize: 12, opacity: 0.62, lineHeight: 1.5 } },
            text().summary,
          ),
          React.createElement(
            'a',
            { href: url, target: '_blank', rel: 'noreferrer', style: { fontSize: 12, whiteSpace: 'nowrap' } },
            text().open,
          ),
        ),
        React.createElement('iframe', {
          src: url,
          title: text().title,
          style: {
            width: '100%',
            minHeight: 560,
            border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.28))',
            borderRadius: 10,
            background: 'transparent',
            display: 'block',
          },
        }),
      )
    }

    // `slots` is the only service this half needs; declaring it keeps apply()
    // from running before the slot registry exists.
    const inject = ['slots']

    function apply(ctx) {
      try {
        ctx.slots.inject(SETTINGS_SLOT, () =>
          ctx.slots.register(
            {
              name: SETTINGS_SLOT,
              id: SECTION_ID,
              order: 500,
              // A function, not a string: the shell re-reads it on every projection.
              label: () => text().section,
            },
            ConsoleSection,
          ),
        )
      } catch (error) {
        // A missing settings slot must never take the tool down with it.
        console.error('[agnes-image] settings section skipped:', error)
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
