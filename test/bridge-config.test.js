import test from 'node:test'
import assert from 'node:assert/strict'
import { bridgeSupportsChat, resolveBridgeConfig } from '../src/bridge-config.js'

test('disables chat unless the build explicitly enables it', () => {
  assert.deepEqual(resolveBridgeConfig({
    chatEnabled: false,
    pageLocation: { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' },
  }), {
    mode: 'disabled',
    url: null,
  })
  assert.deepEqual(resolveBridgeConfig({
    chatEnabled: false,
    pageLocation: {
      protocol: 'https:',
      host: 'delus.github.io',
      hostname: 'delus.github.io',
    },
  }), {
    mode: 'disabled',
    url: null,
  })
})

test('uses same-origin chat when the build enables it', () => {
  assert.deepEqual(resolveBridgeConfig({
    chatEnabled: true,
    pageLocation: { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' },
  }), {
    mode: 'same-origin',
    url: 'ws://localhost:5173/chat',
  })
})

test('server builds keep chat on the bundled same-origin bridge', () => {
  assert.deepEqual(resolveBridgeConfig({
    chatEnabled: true,
    pageLocation: { protocol: 'https:', host: 'emotion.example', hostname: 'emotion.example' },
    configuredUrl: 'wss://bridge.example/chat',
  }), {
    mode: 'same-origin',
    url: 'wss://emotion.example/chat',
  })
})

test('only the enabled same-origin mode starts chat networking', () => {
  assert.equal(bridgeSupportsChat({ mode: 'same-origin' }), true)
  assert.equal(bridgeSupportsChat({ mode: 'configured' }), false)
  assert.equal(bridgeSupportsChat({ mode: 'disabled' }), false)
})
