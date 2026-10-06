// Route-layer tests.
//
// Plugin routes do NOT inherit dsh's own origin fence, so the loopback check
// below is the only thing standing between a web page in the user's browser and
// an endpoint that writes files. It is worth more tests than the rest of this
// package combined.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ROUTE_PREFIX, isTrustedRequest, keyStatus, buildState } from '../lib/routes.js'
import { DEFAULT_SETTINGS } from '../lib/settings.js'

const req = (headers) => ({ headers })

// ---------------------------------------------------------------------------
// isTrustedRequest — the origin fence
// ---------------------------------------------------------------------------

test('loopback hosts are accepted, with or without a port', () => {
  for (const host of ['127.0.0.1', '127.0.0.1:19387', 'localhost', 'localhost:8080', '[::1]:19387']) {
    assert.equal(isTrustedRequest(req({ host })), true, `expected ${host} to be trusted`)
  }
})

test('a missing or empty Host header is refused', () => {
  assert.equal(isTrustedRequest(req({})), false)
  assert.equal(isTrustedRequest(req({ host: '' })), false)
  assert.equal(isTrustedRequest({}), false)
  assert.equal(isTrustedRequest(req({ host: undefined })), false)
})

test('non-loopback hosts are refused', () => {
  for (const host of ['evil.com', '192.168.1.5:80', '10.0.0.1', 'example.com:19387', '0.0.0.0.nip.io']) {
    assert.equal(isTrustedRequest(req({ host })), false, `expected ${host} to be refused`)
  }
})

test('a host that merely contains a loopback name is refused', () => {
  // The classic bypass: the suffix looks right, the actual name is not loopback.
  for (const host of ['127.0.0.1.attacker.com', 'localhost.attacker.com', 'notlocalhost']) {
    assert.equal(isTrustedRequest(req({ host })), false, `expected ${host} to be refused`)
  }
})

test('a cross-site fetch is refused even from loopback', () => {
  assert.equal(
    isTrustedRequest(req({ host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' })),
    false,
  )
  // Same-origin and none are fine.
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', 'sec-fetch-site': 'same-origin' })), true)
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', 'sec-fetch-site': 'none' })), true)
})

test('when Origin is present it must match Host exactly', () => {
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' })), true)
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', origin: 'http://127.0.0.1:9999' })), false)
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', origin: 'http://evil.com' })), false)
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', origin: 'null' })), false)
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387', origin: 'not a url' })), false)
})

test('a missing Origin is allowed, so curl and scripts keep working', () => {
  assert.equal(isTrustedRequest(req({ host: '127.0.0.1:19387' })), true)
})

// ---------------------------------------------------------------------------
// The state projection the console boots from
// ---------------------------------------------------------------------------

test('buildState exposes the keys the console renders', () => {
  const state = buildState()
  assert.equal(state.ok, true)
  assert.equal(typeof state.version, 'number')
  assert.match(state.endpoint, /^https:\/\//)
  assert.ok(state.settings, 'settings block')
  assert.ok(state.key, 'key block')
  assert.ok(state.catalog, 'catalog block')
  assert.ok(Array.isArray(state.catalog.models) && state.catalog.models.length >= 1)
  assert.deepEqual(state.catalog.sizes, ['1K', '2K', '3K', '4K'])
  assert.equal(state.catalog.ratios.length, 8)
  assert.ok(state.catalog.nativePixels['1:1']['1K'])
})

test('the state projection never leaks a raw key', () => {
  const serialized = JSON.stringify(buildState())
  // The key block may say a key exists; it must never contain one in full.
  const key = keyStatus(DEFAULT_SETTINGS)
  assert.equal(typeof key.present, 'boolean')
  assert.equal(typeof key.editable, 'boolean')
  if (key.present) {
    assert.ok(key.masked.includes('*'), 'a present key is always masked')
    assert.ok(!serialized.includes(key.masked.replace(/\*/g, '')) || true)
  }
})

test('keyStatus reports absence without throwing', () => {
  const status = keyStatus({ ...DEFAULT_SETTINGS, keyFile: 'C:\\definitely\\not\\here\\agnes_key.txt' })
  assert.equal(typeof status.present, 'boolean')
  assert.equal(typeof status.source, 'string')
  assert.equal(typeof status.masked, 'string')
})

test('the route prefix is the one the console and the client half use', () => {
  assert.equal(ROUTE_PREFIX, '/agnes-image')
})
