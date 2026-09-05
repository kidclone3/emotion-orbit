const clamp = (value, bound) => Math.max(-bound, Math.min(bound, Number.isFinite(value) ? value : 0))
const ANIMATION_PRINCIPLES = Object.freeze({ offsetDelay: 'used', parallax: 'used', masking: 'used', obscuration: 'used', transformation: 'used', easing: 'used', parenting: 'used', dimensionality: 'used', overlay: 'used', valueChange: 'used', dollyZoom: 'deferred', cloning: 'deferred' })
const STATES = new Set(['idle', 'listening', 'correction', 'closure'])

// Only application-owned stage/status values enter this boundary. Never pass turn text.
export function visualStateFor({ stage, closed = false, turnStatus } = {}) {
  if (closed || stage === 'closure') return 'closure'
  if (turnStatus === 'requesting' || turnStatus === 'cancelling') return 'listening'
  return stage === 'mirror' ? 'correction' : 'idle'
}

export function createJellySimulation({ reducedMotion = false } = {}) {
  let state = 'idle', destination = 'idle', time = 0, age = 0
  let squash = 0, velocity = 0, lean = 0, leanVelocity = 0, glow = 0
  let responses = 0, pokes = 0, transition = 0
  let x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0, ox = 0, oy = 0
  let scale = 1, targetScale = 1, grabbed = false, hover = false, contactX = 0, contactY = 0
  let opticalX = 0, opticalY = 0, value = 0, pressure = 0
  let throwCount = 0, dragCount = 0, thrown = false
  const locked = () => state === 'closure' || destination === 'closure'
  const valueTarget = () => (locked() ? -.06 : state === 'listening' ? -.035 : state === 'response' ? .1 : state === 'correction' ? -.02 : grabbed ? .07 : thrown ? .045 : hover ? .025 : 0) * (reducedMotion ? .3 : 1)
  const pressureTarget = () => reducedMotion ? 0 : Math.min(1, Math.max(0, -squash) * 2 + (grabbed ? .25 : hover ? .08 : 0))
  const needsFrame = () => (!reducedMotion && state !== 'closure') || grabbed || transition > 0 || state === 'response' || Math.abs(glow) > .00001 ||
    Math.hypot(x, y, vx, vy) > .0001 || Math.abs(scale - targetScale) > .0001 ||
    Math.abs(squash) + Math.abs(lean) + Math.abs(velocity) + Math.abs(leanVelocity) > .0001 ||
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
  const rest = () => { grabbed = hover = thrown = false; x = y = vx = vy = tx = ty = contactX = contactY = 0 }
  const snapshot = () => ({
    interactionMode: locked() ? 'locked' : grabbed ? 'grab' : thrown ? 'throw' : hover ? 'hover' : Math.hypot(x, y) > .0001 ? 'return' : 'idle',
    grabbed, position: { x, y }, homePosition: { x: 0, y: 0 }, velocity: { x: vx, y: vy }, scale, targetScale, throwCount, dragCount,
    animationPrinciples: ANIMATION_PRINCIPLES,
    optics: { x: opticalX, y: opticalY, value, pressure },
    opticalTargets: { x, y, value: valueTarget(), pressure: pressureTarget() },
    needsFrame: needsFrame(), transitionRemaining: transition,
    visualState: state, reducedMotion, squash, lean, glow, responses, pokes,
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
    grab(px, py) {
      if (locked() || grabbed || !Number.isFinite(px + py)) return false
      ox = px - x; oy = py - y; tx = x; ty = y
      grabbed = true; hover = thrown = false; vx = vy = 0; dragCount++
      return true
    },
    rebase(px, py) { if (grabbed) { ox = px - x; oy = py - y; tx = x; ty = y } },
    drag(px, py) {
      if (!grabbed || !Number.isFinite(px) || !Number.isFinite(py)) return
      tx = clamp(px - ox, .18); ty = clamp(py - oy, .14)
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
    setReducedMotion(value) {
      reducedMotion = Boolean(value)
      vx = vy = 0; thrown = false
      squash = lean = velocity = leanVelocity = glow = transition = 0
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
    poke(x = 0, y = 0) {
      if (locked()) return
      pokes++
      velocity = clamp(velocity - (reducedMotion ? .3 : 1.4), 2.5)
      leanVelocity = clamp(leanVelocity + clamp(x, 1) * .9 + clamp(y, 1) * .15, 1.8)
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
      // Fixed maximum substep keeps the under-damped spring stable after slow frames.
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
        const stiffness = grabbed ? 150 : reducedMotion ? 180 : 18
        const drag = grabbed ? 21 : reducedMotion ? 27 : 6
        vx += (((grabbed ? tx : 0) - x) * stiffness - vx * drag) * h
        vy += (((grabbed ? ty : 0) - y) * stiffness - vy * drag) * h
        x += vx * h; y += vy * h
        if (Math.abs(x) > .18) { x = clamp(x, .18); vx *= -.35 }
        if (Math.abs(y) > .14) { y = clamp(y, .14); vy *= -.35 }
        if (thrown && Math.hypot(vx, vy) < .04) thrown = false
        if (!grabbed && Math.hypot(x, y, vx, vy) < .0001) x = y = vx = vy = 0
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
