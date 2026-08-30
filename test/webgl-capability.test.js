import test from 'node:test'
import assert from 'node:assert/strict'
import { probeWebGLCapability } from '../src/webgl-capability.js'

test('probes WebGL2 first and releases the temporary context', () => {
  let released = 0
  const webgl2 = {
    getExtension(name) {
      assert.equal(name, 'WEBGL_lose_context')
      return { loseContext: () => { released += 1 } }
    },
  }
  const requested = []
  const capability = probeWebGLCapability({
    createCanvas: () => ({
      getContext(name) {
        requested.push(name)
        return name === 'webgl2' ? webgl2 : null
      },
    }),
  })

  assert.deepEqual(capability, { supported: true, api: 'webgl2' })
  assert.deepEqual(requested, ['webgl2'])
  assert.equal(released, 1)
})

test('reports unsupported without throwing when context creation fails', () => {
  assert.deepEqual(probeWebGLCapability({
    createCanvas: () => ({ getContext: () => null }),
  }), { supported: false, api: null })
  assert.deepEqual(probeWebGLCapability({
    createCanvas: () => { throw new Error('canvas unavailable') },
  }), { supported: false, api: null })
})

test('rejects WebGL1 when the installed renderer requires WebGL2', () => {
  const webgl1 = { getExtension: () => null }
  assert.deepEqual(probeWebGLCapability({
    createCanvas: () => ({
      getContext: (name) => name === 'webgl' ? webgl1 : null,
    }),
  }), { supported: false, api: null })
})
