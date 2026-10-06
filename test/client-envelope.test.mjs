// Contract tests for the browser half.
//
// The real shell loads `client/index.js` through `window.__ModuleLoader__`, so
// these tests stand up the same envelope, a minimal React, and a stub slot
// registry, then assert the things the shell actually checks: the module id,
// the declared inject list, and the exact slot registration the settings panel
// depends on. A mistake here is invisible until dsh restarts, so it is worth
// pinning down without a browser.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')

const SOURCE = readFileSync(join(pkgRoot, 'client', 'index.js'), 'utf8')
const PACKAGE = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

const SETTINGS_SLOT = 'settings.section'

/** Enough React to render a tree of plain objects. */
function makeReact() {
  return {
    createElement(type, props, ...children) {
      const flat = children.flat().filter((c) => c !== undefined && c !== null && c !== false)
      return { type, props: props ?? {}, children: flat }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
  }
}

/** Load the browser half exactly the way the shell does. */
function bootstrap({ dark = false, quiet = false } = {}) {
  let loaded = null
  const complaints = []
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (mod) => { loaded = mod } } },
    document: {
      body: { hasAttribute: (name) => dark && name === 'data-ds-dark-theme' },
      documentElement: { dataset: {} },
    },
    console: quiet ? { ...console, error: (...args) => complaints.push(args) } : console,
    URLSearchParams,
  })

  vm.runInContext(SOURCE, context, { filename: 'client/index.js' })
  assert.ok(loaded, 'client/index.js must call window.__ModuleLoader__.load')

  const react = makeReact()
  const requested = []
  const exports = loaded.factory((name) => {
    requested.push(name)
    if (name === 'react') return react
    throw new Error(`unexpected require(${JSON.stringify(name)})`)
  })

  return { loaded, exports, react, requested, complaints }
}

/** Minimal stand-in for the shell's slot service. */
function makeSlotContext() {
  const registrations = []
  const injections = []
  const ctx = {
    slots: {
      inject(slot, callback) {
        injections.push(slot)
        callback()
        return () => {}
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return { ctx, registrations, injections }
}

function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) findAll(child, predicate, found)
  return found
}

// ---------------------------------------------------------------------------

test('the loader envelope declares exactly the package id', () => {
  const { loaded } = bootstrap()
  assert.equal(loaded.id, PACKAGE.name)
  assert.equal(typeof loaded.factory, 'function')
})

test('the browser half requires react and nothing else', () => {
  const { exports, requested } = bootstrap()
  assert.ok(exports.apply, 'must export apply')
  assert.deepEqual(requested, ['react'])
})

test('the declared inject list asks for the slot service', () => {
  const { exports } = bootstrap()
  // The bundle is evaluated in its own realm, so its arrays are not this
  // realm's arrays; compare contents rather than identity.
  assert.deepEqual(Array.from(exports.inject ?? []), ['slots'])
})

test('apply registers one section in settings.section', () => {
  const { exports } = bootstrap()
  const { ctx, registrations, injections } = makeSlotContext()

  exports.apply(ctx)

  assert.deepEqual(Array.from(injections), [SETTINGS_SLOT])
  assert.equal(registrations.length, 1)

  const { options, component } = registrations[0]
  assert.equal(options.name, SETTINGS_SLOT)
  assert.equal(options.id, 'agnes-image')
  assert.equal(typeof options.order, 'number')
  assert.equal(typeof component, 'function')

  // `label` must be a function: the shell re-reads it on every projection.
  assert.equal(typeof options.label, 'function')
  assert.equal(options.label(), 'Agnes Image')
})

test('apply survives a shell with no slot service, and says so', () => {
  const { exports, complaints } = bootstrap({ quiet: true })
  assert.doesNotThrow(() => exports.apply({}))
  assert.doesNotThrow(() => exports.apply({ slots: {} }))
  assert.doesNotThrow(() =>
    exports.apply({
      slots: {
        inject() {
          throw new Error('slot not declared')
        },
      },
    }),
  )
  assert.equal(complaints.length, 3, 'each failure is reported rather than swallowed')
  assert.ok(complaints.every((args) => String(args[0]).includes('[agnes-image]')))
})

test('the section embeds the console page served by the host half', () => {
  const { exports } = bootstrap()
  const { ctx, registrations } = makeSlotContext()
  exports.apply(ctx)

  const tree = registrations[0].component()
  const iframes = findAll(tree, (node) => node.type === 'iframe')
  assert.equal(iframes.length, 1, 'exactly one iframe')

  const src = iframes[0].props.src
  assert.equal(src, '/agnes-image/console?theme=light')
  assert.ok(src.startsWith('/'), 'must be a relative URL: the loopback port is random')
  assert.equal(iframes[0].props.title, 'Agnes Image console')

  // A way out of the panel, for people who want the console full width.
  const links = findAll(tree, (node) => node.type === 'a')
  assert.equal(links.length, 1)
  assert.equal(links[0].props.href, src)
  assert.equal(links[0].props.target, '_blank')
})

test('the embedded console is told which theme the shell is using', () => {
  const light = bootstrap({ dark: false })
  const dark = bootstrap({ dark: true })

  const srcFor = ({ exports }) => {
    const { ctx, registrations } = makeSlotContext()
    exports.apply(ctx)
    const tree = registrations[0].component()
    return findAll(tree, (n) => n.type === 'iframe')[0].props.src
  }

  assert.ok(srcFor(light).endsWith('theme=light'))
  assert.ok(srcFor(dark).endsWith('theme=dark'))
})

// ---------------------------------------------------------------------------
// The manifest that makes the browser half discoverable at all
// ---------------------------------------------------------------------------

test('package.json declares the client half the way the host expects', () => {
  assert.equal(PACKAGE.name, 'dsh-plugin-agnes-image')
  assert.equal(PACKAGE.type, 'module')
  assert.ok(PACKAGE.exports['./client'], 'the ./client subpath is how the host finds the bundle')
  assert.equal(PACKAGE.dsh.client.platform, 'web')
  assert.equal(typeof PACKAGE.dsh.client.immediately, 'boolean')
  assert.ok(PACKAGE.dsh.bundle.patch, 'the host half still needs its patch file')
  assert.equal(PACKAGE.license, 'MIT')
})

test('every file the manifest promises exists', () => {
  const promised = [
    PACKAGE.main,
    PACKAGE.exports['.'],
    PACKAGE.exports['./client'],
    PACKAGE.dsh.bundle.patch,
    'README.md',
    'LICENSE',
    'console/index.html',
    'console/console.css',
    'console/console.js',
  ]
  for (const rel of promised) {
    assert.ok(existsSync(join(pkgRoot, rel)), `missing ${rel}`)
  }
})
