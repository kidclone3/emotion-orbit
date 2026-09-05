import test from 'node:test'
import assert from 'node:assert/strict'
import * as optional from '../src/jelly-optional.js'

test('optional rejected loader and throwing mount resolve unavailable without sensitive errors', async () => {
  for (const load of [async () => { throw Error('secret') }, async () => ({ mountJellyCharacter() { throw Error('secret') } })]) {
    const jelly = optional.loadOptionalJelly({ load })
    assert.equal(jelly.getState().backend, 'initializing')
    await jelly.ready
    assert.equal(jelly.getState().backend, 'unavailable')
    assert.ok(!JSON.stringify(jelly.getState()).includes('secret'))
  }
})
test('late mount receives only latest visual state and disposal prevents mounting', async () => {
  let resolve, mounted = 0, received
  const load = () => new Promise(r => { resolve = r })
  const jelly = optional.loadOptionalJelly({ load })
  jelly.sync({ stage: 'mirror', closed: false, turnStatus: 'idle', history: ['private'] })
  await Promise.resolve()
  resolve({ mountJellyCharacter() { mounted++; return { sync(s) { received = s }, dispose() {} } } })
  await jelly.ready
  assert.deepEqual(received, { stage: 'mirror', closed: false, turnStatus: 'idle' })
  const late = optional.loadOptionalJelly({ load })
  await Promise.resolve()
  late.dispose()
  resolve({ mountJellyCharacter() { mounted++ } })
  await late.ready
  assert.equal(mounted, 1)
})
