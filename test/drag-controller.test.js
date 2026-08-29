import test from 'node:test'
import assert from 'node:assert/strict'
import { DragOrbitController } from '../src/drag-controller.js'

test('ignores movement from pointers that did not start the gesture', () => {
  const drag = new DragOrbitController()

  assert.equal(drag.move(2, 20, 20).handled, false)
  assert.deepEqual(drag.rotation, { yaw: 0, pitch: 0 })
})

test('updates yaw and pitch while preserving the active pointer', () => {
  const drag = new DragOrbitController({ sensitivity: 0.01 })

  drag.start(7, 100, 100)
  const result = drag.move(7, 130, 80)

  assert.equal(result.handled, true)
  assert.equal(result.dragging, true)
  assert.equal(drag.rotation.yaw, 0.3)
  assert.equal(drag.rotation.pitch, -0.2)
  assert.equal(drag.move(8, 200, 200).handled, false)
})

test('clamps vertical tilt so the egg remains controllable', () => {
  const drag = new DragOrbitController({ sensitivity: 0.01, maxPitch: 0.65 })

  drag.start(1, 0, 0)
  drag.move(1, 0, 500)
  assert.equal(drag.rotation.pitch, 0.65)

  drag.move(1, 0, -500)
  assert.equal(drag.rotation.pitch, -0.65)
})

test('distinguishes a click from a drag using total movement', () => {
  const drag = new DragOrbitController({ dragThreshold: 6 })

  drag.start(1, 10, 10)
  drag.move(1, 13, 12)
  assert.deepEqual(drag.end(1), { handled: true, dragged: false })

  drag.start(2, 10, 10)
  drag.move(2, 30, 10)
  assert.deepEqual(drag.end(2), { handled: true, dragged: true })
})

test('applies and damps release inertia without allocating new rotation state', () => {
  const drag = new DragOrbitController({ sensitivity: 0.01, damping: 5 })
  const rotation = drag.rotation

  drag.start(1, 0, 0)
  drag.move(1, 40, 0)
  drag.end(1)
  const yawAtRelease = drag.rotation.yaw
  drag.tick(0.1)
  const yawAfterTick = drag.rotation.yaw
  const velocityAfterTick = drag.velocity.yaw
  drag.tick(0.1)

  assert.equal(drag.rotation, rotation)
  assert.ok(yawAfterTick > yawAtRelease)
  assert.ok(drag.rotation.yaw > yawAfterTick)
  assert.ok(drag.velocity.yaw < velocityAfterTick)
  assert.ok(drag.velocity.yaw > 0)
})
