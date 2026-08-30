import test from 'node:test'
import assert from 'node:assert/strict'
import { createSafeLiquidExperience } from '../src/safe-liquid-experience.js'

test('WebGL construction failure returns a fully safe static experience', () => {
  const failures = []
  const liquid = createSafeLiquidExperience({
    create() { throw new Error('WebGL unavailable') },
    onFailure: (error) => failures.push(error.message),
  })

  assert.doesNotThrow(() => {
    liquid.setVisual({ primary: '#fff' })
    liquid.pulse()
    liquid.scheduleResize()
    liquid.setHidden(false)
    liquid.requestFrame('test')
    liquid.destroy()
  })
  assert.deepEqual(failures, ['WebGL unavailable'])
  assert.deepEqual(liquid.getState(), {
    renderer: 'fallback',
    context: 'unavailable',
    quality: { tier: 'static', adaptive: false },
    renderMode: 'static',
  })
})
