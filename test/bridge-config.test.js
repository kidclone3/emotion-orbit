import test from 'node:test'
import assert from 'node:assert/strict'
import { bridgeSupportsChat, resolveBridgeConfig } from '../src/bridge-config.js'

test('uses same-origin chat except on unconfigured GitHub Pages', () => {
  assert.deepEqual(resolveBridgeConfig({
    pageLocation: { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' },
  }), {
    mode: 'same-origin',
    url: 'ws://localhost:5173/chat',
  })
  assert.deepEqual(resolveBridgeConfig({
    pageLocation: {
      protocol: 'https:',
      host: 'delus.github.io',
      hostname: 'delus.github.io',
    },
  }), {
    mode: 'local-only',
    url: null,
  })
})

test('accepts only credential-free WebSocket build-time bridge URLs', () => {
  const pageLocation = {
    protocol: 'https:',
    host: 'delus.github.io',
    hostname: 'delus.github.io',
  }

  assert.deepEqual(resolveBridgeConfig({
    pageLocation,
    configuredUrl: 'wss://bridge.example/chat',
  }), {
    mode: 'configured',
    url: 'wss://bridge.example/chat',
  })
  assert.deepEqual(resolveBridgeConfig({
    pageLocation,
    configuredUrl: 'https://bridge.example/chat',
  }), {
    mode: 'local-only',
    url: null,
  })
  assert.deepEqual(resolveBridgeConfig({
    pageLocation,
    configuredUrl: 'wss://token@bridge.example/chat',
  }), {
    mode: 'local-only',
    url: null,
  })
})

test('only configured bridge modes start chat networking', () => {
  assert.equal(bridgeSupportsChat({ mode: 'same-origin' }), true)
  assert.equal(bridgeSupportsChat({ mode: 'configured' }), true)
  assert.equal(bridgeSupportsChat({ mode: 'local-only' }), false)
})

test('rejects mixed-content bridge URLs while allowing ws on HTTP pages', () => {
  assert.deepEqual(resolveBridgeConfig({
    pageLocation: {
      protocol: 'https:',
      host: 'delus.github.io',
      hostname: 'delus.github.io',
    },
    configuredUrl: 'ws://bridge.example/chat',
  }), {
    mode: 'local-only',
    url: null,
  })
  assert.deepEqual(resolveBridgeConfig({
    pageLocation: {
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
    },
    configuredUrl: 'ws://localhost:8787/chat',
  }), {
    mode: 'configured',
    url: 'ws://localhost:8787/chat',
  })
})
