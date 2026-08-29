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

export function createAccretionField({
  count = 7000,
  seed = 481516,
  innerRadius = 1.6,
  outerRadius = 5.2,
} = {}) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer')
  if (!Number.isFinite(innerRadius) || !Number.isFinite(outerRadius) || innerRadius <= 0 || outerRadius <= innerRadius) {
    throw new RangeError('outerRadius must exceed a finite, positive innerRadius')
  }

  const random = seededRandom(seed)
  const positions = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  const angles = new Float32Array(count)
  const heights = new Float32Array(count)
  const seeds = new Float32Array(count)
  const span = outerRadius - innerRadius
  const radialMargin = Math.min(0.001, span * 0.001)
  const safeSpan = span - radialMargin * 2

  for (let index = 0; index < count; index += 1) {
    const radialProgress = Math.pow(random(), 2.3)
    const radius = innerRadius + radialMargin + radialProgress * safeSpan
    const angle = random() * Math.PI * 2
    const thickness = 0.055 + radialProgress * 0.19
    const height = (random() + random() + random() - 1.5) * thickness
    const offset = index * 3

    positions[offset] = Math.cos(angle) * radius
    positions[offset + 1] = height
    positions[offset + 2] = Math.sin(angle) * radius
    radii[index] = radius
    angles[index] = angle
    heights[index] = height
    seeds[index] = random()
  }

  return { positions, radii, angles, heights, seeds }
}
