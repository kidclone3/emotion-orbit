import test from 'node:test'
import assert from 'node:assert/strict'

test('creates a deterministic, bounded accretion field around an open horizon', async () => {
  const horizon = await import('../src/horizon-field.js').catch(() => null)
  assert.ok(horizon, 'horizon field module must exist')

  const options = {
    count: 2048,
    seed: 481516,
    innerRadius: 1.6,
    outerRadius: 5.2,
  }
  const first = horizon.createAccretionField(options)
  const second = horizon.createAccretionField(options)
  const different = horizon.createAccretionField({ ...options, seed: options.seed + 1 })

  assert.equal(first.positions.length, options.count * 3)
  assert.equal(first.radii.length, options.count)
  assert.equal(first.seeds.length, options.count)
  assert.deepEqual(first.positions, second.positions)
  assert.deepEqual(first.radii, second.radii)
  assert.deepEqual(first.seeds, second.seeds)
  assert.notDeepEqual(first.positions, different.positions)

  let innerBandCount = 0
  let totalHeight = 0
  for (let index = 0; index < options.count; index += 1) {
    const offset = index * 3
    const radius = Math.hypot(first.positions[offset], first.positions[offset + 2])
    const height = Math.abs(first.positions[offset + 1])

    assert.ok(Number.isFinite(radius) && Number.isFinite(height))
    assert.ok(radius >= options.innerRadius && radius <= options.outerRadius)
    assert.ok(first.seeds[index] >= 0 && first.seeds[index] <= 1)
    if (radius <= options.innerRadius + (options.outerRadius - options.innerRadius) * 0.55) innerBandCount += 1
    totalHeight += height
  }

  assert.ok(innerBandCount / options.count > 0.68, 'light should concentrate near the event horizon')
  assert.ok(totalHeight / options.count < 0.16, 'the field should read as a low horizon, not a particle sphere')
})

test('rejects non-finite horizon bounds', async () => {
  const { createAccretionField } = await import('../src/horizon-field.js')

  assert.throws(
    () => createAccretionField({ count: 4, innerRadius: 1.6, outerRadius: Number.POSITIVE_INFINITY }),
    RangeError,
  )
})
