import test from 'node:test'
import assert from 'node:assert/strict'
import viteConfig from '../vite.config.js'

function configFor(mode) {
  return viteConfig({ mode })
}

test('static builds disable chat', () => {
  assert.equal(
    configFor('static').define['import.meta.env.VITE_CHAT_ENABLED'],
    JSON.stringify('false'),
  )
})

test('server builds enable chat', () => {
  assert.equal(
    configFor('server').define['import.meta.env.VITE_CHAT_ENABLED'],
    JSON.stringify('true'),
  )
})
