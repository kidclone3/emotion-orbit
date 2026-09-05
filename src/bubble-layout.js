const BUBBLE_LANES = Object.freeze({
  character: 3,
  user: 3,
  system: 1,
})

export function bubbleSlotFor(role, index) {
  const laneSize = BUBBLE_LANES[role] ?? 1
  const slot = Math.abs(Number(index) || 0) % laneSize
  return `${role}-${slot}`
}
