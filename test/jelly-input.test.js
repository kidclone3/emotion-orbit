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

test('pinch entry and either-finger handoff transition toward combined and remaining rest anchors', () => {
  for (const [lifted, expected] of [
    [1, { x: .6, y: -.4 }],
    [2, { x: -.8, y: .2 }],
  ]) {
    const sim = createJellySimulation()
    const gestures = input.createJellyGestures(sim)
    gestures.down(1, 'touch', -.1, 0, 0, -.8, .2)
    gestures.down(2, 'touch', .1, 0, 1, .6, -.4)
    let deformation = sim.getState().deformation
    assert.deepEqual(deformation.anchor, { x: -.8, y: .2 })
    assert.ok(Math.abs(deformation.targetAnchor.x + .1) < 1e-12 && Math.abs(deformation.targetAnchor.y + .1) < 1e-12)
    for (let i = 0; i < 120; i++) sim.step(1 / 120)
    deformation = sim.getState().deformation
    assert.ok(Math.hypot(deformation.anchor.x + .1, deformation.anchor.y + .1) < .0001)
    gestures.up(lifted, 1010)
    deformation = sim.getState().deformation
    assert.ok(Math.hypot(deformation.anchor.x + .1, deformation.anchor.y + .1) < .0001)
    assert.deepEqual(deformation.targetAnchor, expected)
    assert.equal(sim.getState().grabbed, true)
    for (let i = 0; i < 120; i++) sim.step(1 / 120)
    deformation = sim.getState().deformation
    assert.ok(Math.hypot(deformation.anchor.x - expected.x, deformation.anchor.y - expected.y) < .0001)
    gestures.cancel()
  }
})

test('bound pointer input forwards normalized local surface coordinates and cancel releases capture', () => {
  class Button extends EventTarget {
    captured = new Set()
    addEventListener(...args) { super.addEventListener(...args) }
    removeEventListener(...args) { super.removeEventListener(...args) }
    getBoundingClientRect() { return { left: 20, top: 40, width: 200, height: 100 } }
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
    focus() {}
  }
  const event = (type, values) => {
    const result = new Event(type, { cancelable: true })
    for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value })
    return result
  }
  const sim = createJellySimulation()
  const button = new Button()
  const host = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) }
  let wakes = 0
  const binding = input.bindJellyInput(button, host, sim, () => wakes++)
  button.dispatchEvent(event('pointerdown', {
    button: 0, pointerId: 7, pointerType: 'pen', clientX: 70, clientY: 115,
  }))
  assert.deepEqual(sim.getState().deformation.anchor, { x: -.5, y: -.5 })
  assert.equal(button.captured.has(7), true)
  button.dispatchEvent(event('pointercancel', { pointerId: 7 }))
  assert.equal(sim.getState().grabbed, false)
  assert.equal(button.captured.size, 0)
  assert.equal(binding.getState().capturesAcquired, 1)
  assert.equal(binding.getState().capturesReleased, 1)
  assert.ok(wakes >= 2)
  button.dispatchEvent(event('pointerdown', {
    button: 0, pointerId: 8, pointerType: 'pen', clientX: -1000, clientY: 1000,
  }))
  assert.deepEqual(sim.getState().deformation.anchor, { x: -1, y: -1 })
  button.dispatchEvent(event('pointercancel', { pointerId: 8 }))
  binding.dispose()
})

test('renderer surface resolver wins over rectangle anchor approximation', () => {
  class Button extends EventTarget {
    captured = new Set()
    getBoundingClientRect() { return { left: 20, top: 40, width: 200, height: 100 } }
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
    focus() {}
  }
  const event = new Event('pointerdown', { cancelable: true })
  for (const [key, value] of Object.entries({
    button: 0, pointerId: 9, pointerType: 'mouse', clientX: 70, clientY: 115,
  })) Object.defineProperty(event, key, { value })
  const sim = createJellySimulation()
  const button = new Button()
  const host = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) }
  const binding = input.bindJellyInput(button, host, sim, () => {}, () => ({ x: .74, y: .36 }))
  button.dispatchEvent(event)
  assert.deepEqual(sim.getState().deformation.anchor, { x: .74, y: .36 })
  binding.dispose()
})
