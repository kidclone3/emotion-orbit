import test from 'node:test'
import assert from 'node:assert/strict'
import * as input from '../src/jelly-input.js'
import { createJellySimulation } from '../src/jelly-simulation.js'

test('recent monotonic samples throw; stale, invalid and repeated timestamps do not', () => {
  const history = input.createPointerHistory()
  history.add(0, 0, 0); history.add(.1, .05, 50); history.add(.2, .1, 100)
  assert.deepEqual(history.velocity(110), { x: 1.5, y: 1 })
  assert.deepEqual(history.velocity(300), { x: 0, y: 0 })
  history.clear(); history.add(0, 0, 10); history.add(Infinity, 0, 20); history.add(1, 0, 10)
  assert.deepEqual(history.velocity(30), { x: 0, y: 0 })
})
test('two touches resize while dragging, handoff rebases, cancel clears all and closure rejects input', () => {
  const sim = createJellySimulation()
  const g = input.createJellyGestures(sim)
  g.down(1, 'touch', -.1, 0, 0); g.down(2, 'touch', .1, 0, 1)
  assert.equal(g.getState().activePointerCount, 2)
  assert.equal(g.getState().pinch.active, true)
  g.move(2, .2, 0, 30)
  assert.equal(sim.getState().targetScale, 1.2)
  g.up(2, 35)
  assert.equal(g.getState().pinch.active, false)
  assert.equal(sim.getState().grabbed, true)
  g.move(1, 0, 0, 50); g.cancel()
  assert.equal(g.getState().activePointerCount, 0)
  assert.equal(sim.getState().grabbed, false)
  assert.equal(sim.getState().throwCount, 0)
  sim.setState('closure')
  assert.equal(g.down(3, 'pen', 0, 0, 60), false)
  assert.equal(g.getState().activePointerCount, 0)
})
