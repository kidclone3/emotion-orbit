import test from 'node:test'
import assert from 'node:assert/strict'
import viteConfig from '../vite.config.js'

function configFor(mode) {
  return viteConfig({ mode })
}

test('static builds disable chat', () => {
  const config = configFor('static')
  assert.equal(config.define['import.meta.env.VITE_CHAT_ENABLED'], JSON.stringify('false'))
  assert.equal(config.define['import.meta.env.VITE_EXPERIENCE_MODE'], JSON.stringify('liquid-field'))
})

test('server builds enable chat', () => {
  const config = configFor('server')
  assert.equal(config.define['import.meta.env.VITE_CHAT_ENABLED'], JSON.stringify('true'))
  assert.equal(config.define['import.meta.env.VITE_EXPERIENCE_MODE'], JSON.stringify('roleplay'))
})
