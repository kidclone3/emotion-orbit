import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAdaptiveQualityController,
  createContextRecoveryController,
  createRenderScheduler,
  resolveInitialQuality,
} from '../src/render-policy.js'

test('reduced-motion scheduler coalesces invalidations into requested frames', () => {
  const frames = new Map()
  let sequence = 0
  let renders = 0
  const scheduler = createRenderScheduler({
    reducedMotion: true,
    requestAnimationFrameImpl(callback) {
      const id = ++sequence
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrameImpl(id) {
      frames.delete(id)
    },
    render: () => { renders += 1 },
  })

  scheduler.request()
  scheduler.request()
  assert.equal(frames.size, 1)
  const [id, frame] = frames.entries().next().value
  frames.delete(id)
  frame()
  assert.equal(renders, 1)

  scheduler.request()
  assert.equal(frames.size, 1)
  scheduler.destroy()
  assert.equal(frames.size, 0)
})

test('adaptive quality requires sustained evidence and changes one bounded tier', () => {
  const quality = createAdaptiveQualityController({
    initialTier: 'balanced',
    downgradeSamples: 3,
    upgradeSamples: 5,
    cooldownSamples: 2,
  })

  assert.equal(quality.observe(31), null)
  assert.equal(quality.observe(58), null)
  assert.equal(quality.observe(30), null)
  assert.equal(quality.observe(29), null)
  assert.equal(quality.observe(28), 'low')
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), null)
  assert.equal(quality.observe(60), 'balanced')
  assert.equal(quality.getState().tier, 'balanced')
})

test('adaptive quality reset discards interrupted frame evidence', () => {
  const quality = createAdaptiveQualityController({
    initialTier: 'balanced',
    downgradeSamples: 3,
    cooldownSamples: 0,
  })
  quality.observe(20)
  quality.observe(20)

  quality.reset()

  assert.equal(quality.observe(20), null)
  assert.equal(quality.observe(20), null)
  assert.equal(quality.observe(20), 'low')
})

test('adaptive quality keeps evidence counters bounded at terminal tiers', () => {
  const low = createAdaptiveQualityController({
    initialTier: 'low',
    downgradeSamples: 3,
    upgradeSamples: 4,
    cooldownSamples: 0,
  })
  const high = createAdaptiveQualityController({
    initialTier: 'high',
    downgradeSamples: 3,
    upgradeSamples: 4,
    cooldownSamples: 0,
  })

  for (let sample = 0; sample < 500; sample += 1) {
    low.observe(20)
    high.observe(60)
  }

  assert.ok(low.getState().lowSamples < 3)
  assert.ok(high.getState().highSamples < 4)
})

test('automatic quality starts conservatively on mobile or low-power devices', () => {
  assert.equal(resolveInitialQuality({ requested: 'high', coarsePointer: true }), 'high')
  assert.equal(resolveInitialQuality({ requested: 'auto', coarsePointer: true }), 'low')
  assert.equal(resolveInitialQuality({ requested: 'auto', hardwareConcurrency: 4 }), 'low')
  assert.equal(resolveInitialQuality({ requested: 'auto', deviceMemory: 4 }), 'low')
  assert.equal(resolveInitialQuality({
    requested: 'auto',
    coarsePointer: false,
    hardwareConcurrency: 12,
    deviceMemory: 16,
  }), 'balanced')
})

test('context recovery ignores duplicate loss and restore transitions', () => {
  const context = createContextRecoveryController()

  assert.equal(context.lose(), true)
  assert.equal(context.lose(), false)
  assert.equal(context.restore(), true)
  assert.equal(context.restore(), false)
  assert.equal(context.getState(), 'ready')
  context.destroy()
  assert.equal(context.lose(), false)
  assert.equal(context.restore(), false)
  assert.equal(context.getState(), 'destroyed')
})
