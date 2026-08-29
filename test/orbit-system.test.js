import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrganicFormGeometry, createOrbitPath } from '../src/orbit-system.js'

test('creates a deterministic organic cloth surface with a tapered asymmetric silhouette', () => {
  const options = { columns: 18, rows: 12, seed: 73, width: 1.4, height: 1.1, depth: 0.24 }
  const first = createOrganicFormGeometry(options)
  const second = createOrganicFormGeometry(options)
  const different = createOrganicFormGeometry({ ...options, seed: 74 })

  assert.deepEqual(first.positions, second.positions)
  assert.deepEqual(first.indices, second.indices)
  assert.notDeepEqual(first.positions, different.positions)
  assert.equal(first.positions.length, (options.columns + 1) * (options.rows + 1) * 3)
  assert.equal(first.uvs.length, (options.columns + 1) * (options.rows + 1) * 2)
  assert.equal(first.seeds.length, (options.columns + 1) * (options.rows + 1))
  assert.equal(first.indices.length, options.columns * options.rows * 6)

  const sharedInteriorVertex = 1 + (options.columns + 1)
  assert.ok(
    Array.from(first.indices).filter((index) => index === sharedInteriorVertex).length >= 3,
    'interior vertices are shared by neighboring triangles for coherent smooth normals',
  )
  assert.ok(first.indices.every((index) => index < first.positions.length / 3))

  let minimumX = Infinity
  let maximumX = -Infinity
  let minimumY = Infinity
  let maximumY = -Infinity
  let minimumZ = Infinity
  let maximumZ = -Infinity
  for (let index = 0; index < first.positions.length; index += 3) {
    minimumX = Math.min(minimumX, first.positions[index])
    maximumX = Math.max(maximumX, first.positions[index])
    minimumY = Math.min(minimumY, first.positions[index + 1])
    maximumY = Math.max(maximumY, first.positions[index + 1])
    minimumZ = Math.min(minimumZ, first.positions[index + 2])
    maximumZ = Math.max(maximumZ, first.positions[index + 2])
  }

  assert.ok(maximumX - minimumX > options.width * 0.82)
  assert.ok(maximumY - minimumY > options.height * 0.82)
  assert.ok(maximumZ - minimumZ > options.depth * 0.45)
})

test('creates a closed inclined ellipse with bounded eccentric axes', () => {
  const path = createOrbitPath({ segments: 192, radiusX: 4.4, radiusY: 2.1, inclination: 0.7, yaw: -0.35 })

  assert.equal(path.length, 192 * 3)
  assert.ok(path.every(Number.isFinite))
  assert.ok(Math.max(...path.filter((_, index) => index % 3 === 0)) > 3.4)
  assert.ok(Math.max(...path.filter((_, index) => index % 3 === 1)) > 1.2)
  assert.ok(Math.max(...path.filter((_, index) => index % 3 === 2)) > 1.2)
})

test('rejects geometry resolutions that cannot form triangles', () => {
  assert.throws(() => createOrganicFormGeometry({ columns: 1, rows: 8 }), RangeError)
  assert.throws(() => createOrbitPath({ segments: 2 }), RangeError)
})
