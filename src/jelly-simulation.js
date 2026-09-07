const clamp = (value, bound) => Math.max(-bound, Math.min(bound, Number.isFinite(value) ? value : 0))
const ANIMATION_PRINCIPLES = Object.freeze({ offsetDelay: 'used', parallax: 'used', masking: 'used', obscuration: 'used', transformation: 'used', easing: 'used', parenting: 'used', dimensionality: 'used', overlay: 'used', valueChange: 'used', dollyZoom: 'deferred', cloning: 'deferred' })
const STATES = new Set(['idle', 'listening', 'correction', 'closure'])
const VIEW_FOV = 34
export const JELLY_RENDER_VIEW = Object.freeze({
  fov: VIEW_FOV,
  cameraY: .45,
  cameraZ: 6.3,
  targetY: -.05,
  rotationX: .08,
  rotationY: -.36,
  rotationZ: -.055,
  viewHeight: 2 * 6.3 * Math.tan(VIEW_FOV * .5 * Math.PI / 180),
})

// Only application-owned stage/status values enter this boundary. Never pass turn text.
export function visualStateFor({ stage, closed = false, turnStatus } = {}) {
  if (closed || stage === 'closure') return 'closure'
  if (turnStatus === 'requesting' || turnStatus === 'cancelling') return 'listening'
  return stage === 'mirror' ? 'correction' : 'idle'
}

export function sampleJellySurface(deformation = {}, nx = 0, ny = 0, out = {}) {
  const anchor = deformation.anchor || {}
  const pull = deformation.pull || {}
  const ax = clamp(anchor.x, 1), ay = clamp(anchor.y, 1)
  const sx = clamp(nx, 1), sy = clamp(ny, 1)
  const dx = sx - ax, dy = sy - ay
  const weight = Math.exp(-(dx * dx + dy * dy) * 2.8)
  const compensation = Math.max(0, Math.min(.2, Number.isFinite(deformation.compensation) ? deformation.compensation : 0))
  const response = weight - compensation * (1 - weight)
  out.x = clamp(clamp(pull.x, .2) * response, .24)
  out.y = clamp(clamp(pull.y, .18) * response, .24)
  out.weight = weight
  return out
}

export function measureJellyContactProjection(state = {}, nx = 0, ny = 0, aspect = 1) {
  const surface = sampleJellySurface(state.deformation, nx, ny)
  const sx = clamp(nx, 1), sy = clamp(ny, 1)
  const restX = sx * 1.13, restY = sy * .97
  const restZ = Math.sqrt(Math.max(.04, 1 - sx * sx - sy * sy)) * .82
  const stretch = Math.max(.7, 1 + clamp(state.squash, .3))
  const lateral = 1 / Math.sqrt(stretch)
  const wobble = clamp(state.wobble, .02)
  const time = Number.isFinite(state.time) ? state.time : 0
  const ripple = wobble * Math.sin(restY * 4 + restX * 2 + time * 2)
  const baseX = restX * lateral + clamp(state.lean, .3) * restY + ripple
  const baseY = restY * stretch + ripple * .5
  const baseZ = restZ * lateral + ripple
  const volume = Math.max(.9, Math.min(1, Number.isFinite(state.deformation?.volumeScale) ? state.deformation.volumeScale : 1))
  const localX = baseX * volume + surface.x
  const localY = baseY * volume - surface.y
  const localZ = baseZ * volume
  const scale = Math.max(.75, Math.min(1.2, Number.isFinite(state.scale) ? state.scale : 1))
  const squashY = .91 * clamp(state.squash, .3)
  const bodyX = clamp(state.position?.x, .18) * JELLY_RENDER_VIEW.viewHeight
  const bodyY = -clamp(state.position?.y, .14) * JELLY_RENDER_VIEW.viewHeight
  const project = (x, y, z, offsetX, offsetY) => {
    const cx = Math.cos(JELLY_RENDER_VIEW.rotationX), sxr = Math.sin(JELLY_RENDER_VIEW.rotationX)
    const cy = Math.cos(JELLY_RENDER_VIEW.rotationY), syr = Math.sin(JELLY_RENDER_VIEW.rotationY)
    const cz = Math.cos(JELLY_RENDER_VIEW.rotationZ), szr = Math.sin(JELLY_RENDER_VIEW.rotationZ)
    const y1 = y * cx - z * sxr, z1 = y * sxr + z * cx
    const x2 = x * cy + z1 * syr, z2 = -x * syr + z1 * cy
    const x3 = x2 * cz - y1 * szr, y3 = x2 * szr + y1 * cz
    const worldX = x3 * scale + offsetX
    const worldY = y3 * scale + squashY + offsetY
    const worldZ = z2 * scale
    const lookY = JELLY_RENDER_VIEW.targetY - JELLY_RENDER_VIEW.cameraY
    const lookZ = -JELLY_RENDER_VIEW.cameraZ
    const lookLength = Math.hypot(lookY, lookZ)
    const forwardY = lookY / lookLength, forwardZ = lookZ / lookLength
    const relativeY = worldY - JELLY_RENDER_VIEW.cameraY
    const relativeZ = worldZ - JELLY_RENDER_VIEW.cameraZ
    const viewY = relativeY * -forwardZ + relativeZ * forwardY
    const depth = Math.max(.1, relativeY * forwardY + relativeZ * forwardZ)
    const tangent = Math.tan(JELLY_RENDER_VIEW.fov * .5 * Math.PI / 180)
    const safeAspect = Math.max(.25, Math.min(4, Number.isFinite(aspect) ? aspect : 1))
    return { x: worldX / (depth * tangent * safeAspect), y: viewY / (depth * tangent) }
  }
  const baseline = project(baseX, baseY, baseZ, 0, 0)
  const followed = project(baseX, baseY, baseZ, bodyX, bodyY)
  const deformed = project(localX, localY, localZ, bodyX, bodyY)
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const body = distance(followed, baseline)
  const local = distance(deformed, followed)
  const total = distance(deformed, baseline)
  return { body, local, total, localShare: local / Math.max(.000001, body + local) }
}

export function createJellySimulation({ reducedMotion = false } = {}) {
  let state = 'idle', destination = 'idle', time = 0, age = 0
  let squash = 0, velocity = 0, lean = 0, leanVelocity = 0, glow = 0
  let responses = 0, pokes = 0, transition = 0
  let x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0, ox = 0, oy = 0
  let scale = 1, targetScale = 1, grabbed = false, hover = false, contactX = 0, contactY = 0
  let opticalX = 0, opticalY = 0, value = 0, pressure = 0
  let anchorX = 0, anchorY = 0, anchorTargetX = 0, anchorTargetY = 0
  let deformX = 0, deformY = 0, deformVX = 0, deformVY = 0
  let compensation = 0, groundImpact = 0
  let throwCount = 0, dragCount = 0, thrown = false
  const locked = () => state === 'closure' || destination === 'closure'
  const valueTarget = () => (locked() ? -.06 : state === 'listening' ? -.035 : state === 'response' ? .1 : state === 'correction' ? -.02 : grabbed ? .07 : thrown ? .045 : hover ? .025 : 0) * (reducedMotion ? .3 : 1)
  const pressureTarget = () => reducedMotion ? 0 : Math.min(1, Math.max(0, -squash) * 2 + (grabbed ? .25 : hover ? .08 : 0) + groundImpact * .35)
  const facePose = () => state === 'response' ? destination : state
  const faceSnapshot = () => {
    const pose = facePose()
    const blinking = !reducedMotion && !grabbed && (pose === 'idle' || pose === 'listening')
    const phase = (time + (pose === 'listening' ? 1.1 : 0)) % 4.4
    const blink = blinking && phase > 4.12 ? Math.sin(Math.PI * (phase - 4.12) / .28) ** 2 : 0
    const baseOpen = pose === 'closure' ? .38 : pose === 'correction' ? .92 : pose === 'listening' ? 1.06 : 1
    return {
      pose,
      blink,
      eyeOpen: Math.max(.18, Math.min(1.1, baseOpen * (1 - blink * .82))),
      mouthCurve: pose === 'listening' ? .08 : pose === 'correction' ? .02 : pose === 'closure' ? -.02 : 0,
      mouthTilt: pose === 'correction' ? -.12 : 0,
      mouthWidth: pose === 'closure' ? .72 : pose === 'correction' ? .86 : pose === 'listening' ? .92 : 1,
    }
  }
  const deformationSnapshot = () => ({
    anchor: { x: anchorX, y: anchorY },
    targetAnchor: { x: anchorTargetX, y: anchorTargetY },
    pull: { x: deformX, y: deformY },
    recoil: { x: deformVX, y: deformVY },
    compensation,
    volumeScale: 1 / Math.cbrt(1 + compensation * 1.5),
    active: grabbed || Math.hypot(deformX, deformY, deformVX, deformVY) > .0001,
  })
  const needsFrame = () => (!reducedMotion && state !== 'closure') || grabbed || transition > 0 || state === 'response' || Math.abs(glow) > .00001 ||
    Math.hypot(x, y, vx, vy) > .0001 || Math.abs(scale - targetScale) > .0001 ||
    Math.abs(squash) + Math.abs(lean) + Math.abs(velocity) + Math.abs(leanVelocity) + Math.abs(groundImpact) > .0001 ||
    Math.hypot(deformX, deformY, deformVX, deformVY) + compensation > .0001 ||
    Math.hypot(anchorTargetX - anchorX, anchorTargetY - anchorY) > .0001 ||
    Math.abs(opticalX - x) + Math.abs(opticalY - y) > .00001 || Math.abs(value - valueTarget()) > .00001 || Math.abs(pressure - pressureTarget()) > .00001
  const release = (dx = 0, dy = 0) => {
    if (!grabbed) return
    grabbed = false
    vx = reducedMotion || locked() ? 0 : clamp(dx, 1.5)
    vy = reducedMotion || locked() ? 0 : clamp(dy, 1.5)
    thrown = Math.hypot(vx, vy) > .02
    if (thrown) throwCount++
  }
  const close = () => { grabbed = hover = thrown = false; vx = vy = tx = ty = contactX = contactY = 0 }
  const rest = () => {
    grabbed = hover = thrown = false
    x = y = vx = vy = tx = ty = contactX = contactY = 0
    anchorX = anchorY = anchorTargetX = anchorTargetY = 0
    deformX = deformY = deformVX = deformVY = compensation = groundImpact = 0
  }
  const snapshot = () => ({
    interactionMode: locked() ? 'locked' : grabbed ? 'grab' : thrown ? 'throw' : hover ? 'hover' : Math.hypot(x, y) > .0001 ? 'return' : 'idle',
    grabbed, position: { x, y }, homePosition: { x: 0, y: 0 }, velocity: { x: vx, y: vy }, scale, targetScale, throwCount, dragCount,
    animationPrinciples: ANIMATION_PRINCIPLES,
    optics: { x: opticalX, y: opticalY, value, pressure },
    opticalTargets: { x, y, value: valueTarget(), pressure: pressureTarget() },
    deformation: deformationSnapshot(),
    face: faceSnapshot(),
    needsFrame: needsFrame(), transitionRemaining: transition,
    visualState: state, reducedMotion, squash, lean, glow, groundImpact, responses, pokes,
    wobble: reducedMotion || state === 'closure' ? 0 : Math.sin(time * 2.3) * .013,
    time,
  })
  return {
    getState: snapshot,
    contact(cx, cy) {
      if (locked() || grabbed) return
      hover = Number.isFinite(cx) && Number.isFinite(cy)
      contactX = hover ? clamp(cx, 1) : 0
      contactY = hover ? clamp(cy, 1) : 0
    },
    grab(px, py, localX = 0, localY = 0) {
      if (locked() || grabbed || !Number.isFinite(px) || !Number.isFinite(py)) return false
      const safeX = clamp(px, 1), safeY = clamp(py, 1)
      ox = safeX - x; oy = safeY - y; tx = x; ty = y
      const nextAnchorX = clamp(localX, 1), nextAnchorY = clamp(localY, 1)
      const deformationActive = Math.hypot(deformX, deformY, deformVX, deformVY) + compensation > .0001
      if (!deformationActive) { anchorX = nextAnchorX; anchorY = nextAnchorY }
      anchorTargetX = nextAnchorX; anchorTargetY = nextAnchorY
      grabbed = true; hover = thrown = false; vx = vy = 0; dragCount++
      return true
    },
    rebase(px, py, localX = anchorX, localY = anchorY) {
      if (grabbed && Number.isFinite(px) && Number.isFinite(py)) {
        ox = clamp(px, 1) - x; oy = clamp(py, 1) - y; tx = x; ty = y
        anchorTargetX = clamp(localX, 1); anchorTargetY = clamp(localY, 1)
      }
    },
    drag(px, py) {
      if (!grabbed || !Number.isFinite(px) || !Number.isFinite(py)) return
      tx = clamp(clamp(px, 1) - ox, .18); ty = clamp(clamp(py, 1) - oy, .14)
    },
    release,
    cancel() { release(); hover = thrown = false; vx = vy = contactX = contactY = 0 },
    resize(value) { if (!locked() && Number.isFinite(value)) targetScale = Math.max(.75, Math.min(1.2, value)) },
    settle() {
      state = destination
      rest()
      opticalX = opticalY = value = pressure = 0
      squash = lean = velocity = leanVelocity = glow = transition = 0
    },
    setReducedMotion(next) {
      reducedMotion = Boolean(next)
      vx = vy = 0; thrown = false
      squash = lean = velocity = leanVelocity = glow = transition = groundImpact = 0
      deformX = deformY = deformVX = deformVY = compensation = 0
    },
    setState(next) {
      if (locked() && next !== 'closure') return
      next = STATES.has(next) ? next : 'idle'
      if (next === 'closure') close()
      if (state === 'response' && next === destination) return
      if (state === next) return
      state = destination = next
      age = 0
      if (next === 'listening') {
        velocity = reducedMotion ? -.4 : -1.6
        transition = .22
      }
    },
    respond(next = 'idle') {
      if (locked()) return
      destination = STATES.has(next) ? next : 'idle'
      if (destination === 'closure') close()
      state = 'response'
      age = 0
      responses++
      velocity = reducedMotion ? .3 : 2
      transition = reducedMotion ? .22 : 1.25
    },
    poke(px = 0, py = 0) {
      if (locked()) return
      pokes++
      velocity = clamp(velocity - (reducedMotion ? .3 : 1.4), 2.5)
      leanVelocity = clamp(leanVelocity + clamp(px, 1) * .9 + clamp(py, 1) * .15, 1.8)
      transition = reducedMotion ? .22 : 1.25
    },
    step(delta) {
      const dt = Math.max(0, clamp(delta, .05))
      time += dt
      age += dt
      transition = Math.max(0, transition - dt)
      if (state === 'response' && age >= (reducedMotion ? .22 : 1.25)) state = destination
      glow = state === 'response' ? Math.sin(Math.PI * Math.min(1, age / (reducedMotion ? .22 : 1.25))) * (reducedMotion ? .1 : .5) : 0
      const target = reducedMotion || state === 'closure' ? 0 : Math.sin(time * 1.5) * (state === 'correction' ? .004 : .009)
      // Fixed maximum substep keeps the coupled body and local springs stable after slow frames.
      const count = Math.max(1, Math.ceil(dt / (1 / 120)))
      const h = dt / count
      for (let i = 0; i < count; i++) {
        const damping = state === 'correction' || state === 'closure' || reducedMotion ? 17 : 8
        velocity += ((target - squash) * 85 - velocity * damping) * h
        const contactLean = !locked() && !reducedMotion ? contactX * .055 : 0
        const dragLean = grabbed && !reducedMotion ? clamp((tx - x) * 2, .18) : 0
        leanVelocity += ((contactLean + dragLean - lean) * 65 - leanVelocity * damping) * h
        if (grabbed && !reducedMotion) velocity += clamp((ty - y) * -25, 3) * h
        else if (hover && !reducedMotion) velocity += contactY * -.5 * h
        scale += (targetScale - scale) * (1 - Math.exp(-12 * h))
        const stiffness = grabbed ? 72 : reducedMotion ? 180 : 18
        const drag = grabbed ? 15 : reducedMotion ? 27 : 6
        vx += (((grabbed ? tx : 0) - x) * stiffness - vx * drag) * h
        vy += (((grabbed ? ty : 0) - y) * stiffness - vy * drag) * h
        x += vx * h; y += vy * h
        if (Math.abs(x) > .18) { x = clamp(x, .18); vx *= -.35 }
        if (y > .14) {
          const incoming = Math.max(0, vy)
          y = .14
          if (incoming > .02) {
            const impact = Math.min(1, incoming / 1.5)
            groundImpact = Math.max(groundImpact, impact)
            velocity = clamp(velocity - impact * (reducedMotion ? .45 : 1.6), 2.5)
            deformVY = clamp(deformVY - impact * (reducedMotion ? .08 : .34), 2)
          }
          vy *= -.35
        } else if (y < -.14) { y = -.14; vy *= -.35 }
        const anchorDeltaX = anchorTargetX - anchorX, anchorDeltaY = anchorTargetY - anchorY
        const anchorAlpha = 1 - Math.exp(-16 * h)
        let anchorStepX = anchorDeltaX * anchorAlpha, anchorStepY = anchorDeltaY * anchorAlpha
        const anchorStepLength = Math.hypot(anchorStepX, anchorStepY)
        const anchorStepLimit = 3.2 * h
        if (anchorStepLength > anchorStepLimit) {
          const anchorStepScale = anchorStepLimit / anchorStepLength
          anchorStepX *= anchorStepScale; anchorStepY *= anchorStepScale
        }
        anchorX = clamp(anchorX + anchorStepX, 1)
        anchorY = clamp(anchorY + anchorStepY, 1)
        const pullScale = reducedMotion ? .45 : 1.85
        const localTargetX = grabbed ? clamp((tx - x) * pullScale, reducedMotion ? .08 : .2) : 0
        const localTargetY = grabbed ? clamp((ty - y) * pullScale, reducedMotion ? .07 : .18) : 0
        const deformStiffness = grabbed ? 155 : reducedMotion || locked() ? 150 : 75
        const deformDamping = grabbed ? 17 : reducedMotion || locked() ? 27 : 9
        deformVX += ((localTargetX - deformX) * deformStiffness - deformVX * deformDamping) * h
        deformVY += ((localTargetY - deformY) * deformStiffness - deformVY * deformDamping) * h
        deformX = clamp(deformX + deformVX * h, .2)
        deformY = clamp(deformY + deformVY * h, .18)
        const compensationTarget = Math.min(.2, Math.hypot(deformX / .2, deformY / .18) * .12)
        compensation += (compensationTarget - compensation) * (1 - Math.exp(-14 * h))
        groundImpact *= Math.exp(-10 * h)
        if (thrown && Math.hypot(vx, vy) < .04) thrown = false
        if (!grabbed && Math.hypot(x, y, vx, vy) < .0001) x = y = vx = vy = 0
        if (!grabbed && Math.hypot(deformX, deformY, deformVX, deformVY) < .0001) deformX = deformY = deformVX = deformVY = 0
        // Secondary responses follow the authoritative body, never the raw pointer.
        const opticalRate = reducedMotion ? 18 : 7
        opticalX += (x - opticalX) * (1 - Math.exp(-opticalRate * h))
        opticalY += (y - opticalY) * (1 - Math.exp(-opticalRate * h))
        value += (valueTarget() - value) * (1 - Math.exp(-(locked() ? 5 : 9) * h))
        pressure += (pressureTarget() - pressure) * (1 - Math.exp(-8 * h))
        squash = clamp(squash + velocity * h, .3)
        lean = clamp(lean + leanVelocity * h, .3)
      }
      if (reducedMotion && transition === 0) squash = lean = velocity = leanVelocity = glow = 0
      if (state === 'closure' && Math.abs(squash) + Math.abs(lean) + Math.abs(velocity) + Math.abs(leanVelocity) < .0001) squash = lean = velocity = leanVelocity = 0
      return snapshot()
    },
  }
}
