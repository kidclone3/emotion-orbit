export class DragOrbitController {
  constructor({ sensitivity = 0.006, dragThreshold = 6, maxPitch = 0.65, damping = 5 } = {}) {
    this.sensitivity = sensitivity
    this.dragThreshold = dragThreshold
    this.maxPitch = maxPitch
    this.damping = damping
    this.rotation = { yaw: 0, pitch: 0 }
    this.velocity = { yaw: 0, pitch: 0 }
    this.activePointerId = null
    this.lastX = 0
    this.lastY = 0
    this.totalMovement = 0
  }

  start(pointerId, x, y) {
    if (this.activePointerId !== null) return false
    this.activePointerId = pointerId
    this.lastX = x
    this.lastY = y
    this.totalMovement = 0
    this.velocity.yaw = 0
    this.velocity.pitch = 0
    return true
  }

  move(pointerId, x, y) {
    if (pointerId !== this.activePointerId) return { handled: false, dragging: false }

    const deltaX = x - this.lastX
    const deltaY = y - this.lastY
    this.lastX = x
    this.lastY = y
    this.totalMovement += Math.hypot(deltaX, deltaY)

    const yawDelta = deltaX * this.sensitivity
    const pitchDelta = deltaY * this.sensitivity
    this.rotation.yaw += yawDelta
    this.rotation.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.rotation.pitch + pitchDelta))
    this.velocity.yaw = yawDelta * 10
    this.velocity.pitch = pitchDelta * 10

    return { handled: true, dragging: this.totalMovement >= this.dragThreshold }
  }

  end(pointerId) {
    if (pointerId !== this.activePointerId) return { handled: false, dragged: false }

    const dragged = this.totalMovement >= this.dragThreshold
    this.activePointerId = null
    return { handled: true, dragged }
  }

  tick(deltaSeconds) {
    if (this.activePointerId !== null) return

    this.rotation.yaw += this.velocity.yaw * deltaSeconds
    this.rotation.pitch = Math.max(
      -this.maxPitch,
      Math.min(this.maxPitch, this.rotation.pitch + this.velocity.pitch * deltaSeconds),
    )

    const decay = Math.exp(-this.damping * deltaSeconds)
    this.velocity.yaw *= decay
    this.velocity.pitch *= decay
  }
}
