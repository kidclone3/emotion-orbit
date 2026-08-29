function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createOrbitalDustField({
  count = 900,
  seed = 9127,
  innerRadius = 2.18,
  outerRadius = 4.75,
} = {}) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer')
  if (![innerRadius, outerRadius].every((value) => Number.isFinite(value) && value > 0)
    || outerRadius <= innerRadius) {
    throw new RangeError('orbital dust radii must be finite, positive, and ordered')
  }

  const random = seededRandom(seed)
  const positions = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  const seeds = new Float32Array(count)

  for (let index = 0; index < count; index += 1) {
    const radiusMix = Math.pow(random(), 1.55)
    const radius = innerRadius + (outerRadius - innerRadius) * radiusMix
    const angle = random() * Math.PI * 2
    const inclination = (random() - 0.5) * (0.28 + radiusMix * 0.42)
    const offset = index * 3
    positions[offset] = Math.cos(angle) * radius
    positions[offset + 1] = Math.sin(inclination) * radius * 0.62
    positions[offset + 2] = Math.sin(angle) * radius
    radii[index] = radius
    seeds[index] = random()
  }

  return { positions, radii, seeds }
}

export function createOrganicFormGeometry({
  columns = 24,
  rows = 18,
  seed = 1,
  width = 1,
  height = 0.8,
  depth = 0.2,
} = {}) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) {
    throw new RangeError('columns and rows must be integers of at least 2')
  }
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('width, height, and depth must be finite and positive')
  }

  const random = seededRandom(seed)
  const vertexColumns = columns + 1
  const vertexRows = rows + 1
  const points = new Float32Array(vertexColumns * vertexRows * 3)
  const pointSeeds = new Float32Array(vertexColumns * vertexRows)

  for (let row = 0; row < vertexRows; row += 1) {
    const v = row / rows
    const vertical = v * 2 - 1
    const taper = 0.26 + Math.pow(Math.sin(v * Math.PI), 0.62) * 0.76
    for (let column = 0; column < vertexColumns; column += 1) {
      const u = column / columns
      const horizontal = u * 2 - 1
      const edge = Math.abs(horizontal)
      const asymmetry = 1 + Math.sin(v * 7.1 + seed * 0.17) * 0.08 + horizontal * 0.06
      const ruffle = Math.sin(u * 15.5 + v * 5.2 + seed) * edge * 0.08
      const bowl = (1 - horizontal * horizontal) * (0.36 + Math.sin(v * Math.PI) * 0.24)
      const flutter = Math.sin(u * 7.4 + v * 9.2 + seed * 0.31) * 0.18
        + Math.cos(u * 13.2 - v * 5.8 + seed * 0.47) * 0.08
      const pointIndex = row * vertexColumns + column
      const offset = pointIndex * 3

      points[offset] = horizontal * width * 0.5 * taper * asymmetry + ruffle * width
      points[offset + 1] = vertical * height * 0.5 + Math.sin(horizontal * 2.4 + seed) * height * 0.035
      points[offset + 2] = depth * (bowl + flutter - 0.18) + (random() - 0.5) * depth * 0.06
      pointSeeds[pointIndex] = random()
    }
  }

  const uvs = new Float32Array(vertexColumns * vertexRows * 2)
  const indices = new Uint16Array(columns * rows * 6)

  for (let row = 0; row < vertexRows; row += 1) {
    for (let column = 0; column < vertexColumns; column += 1) {
      const pointIndex = row * vertexColumns + column
      const uvOffset = pointIndex * 2
      uvs[uvOffset] = column / columns
      uvs[uvOffset + 1] = row / rows
    }
  }

  let indexOffset = 0
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * vertexColumns + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + vertexColumns
      const bottomRight = bottomLeft + 1
      indices.set(
        [topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft],
        indexOffset,
      )
      indexOffset += 6
    }
  }

  return { positions: points, uvs, seeds: pointSeeds, indices }
}

export function createOrbitPath({
  segments = 240,
  radiusX = 4,
  radiusY = 2,
  inclination = 0,
  yaw = 0,
  phase = 0,
} = {}) {
  if (!Number.isInteger(segments) || segments < 3) throw new RangeError('segments must be an integer of at least 3')
  if (![radiusX, radiusY].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('orbit radii must be finite and positive')
  }

  const positions = new Float32Array(segments * 3)
  const cosInclination = Math.cos(inclination)
  const sinInclination = Math.sin(inclination)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  for (let index = 0; index < segments; index += 1) {
    const angle = phase + (index / segments) * Math.PI * 2
    const localX = Math.cos(angle) * radiusX
    const localZ = Math.sin(angle) * radiusY
    const inclinedY = -localZ * sinInclination
    const inclinedZ = localZ * cosInclination
    const offset = index * 3
    positions[offset] = localX * cosYaw + inclinedZ * sinYaw
    positions[offset + 1] = inclinedY
    positions[offset + 2] = -localX * sinYaw + inclinedZ * cosYaw
  }

  return positions
}
