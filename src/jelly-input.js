// Timestamped input history and gesture interpretation contain no DOM or renderer state.
export function createPointerHistory() {
  const samples = []
  return {
    clear() { samples.length = 0 },
    add(x, y, t) {
      if (![x, y, t].every(Number.isFinite) || (samples.length && t <= samples.at(-1).t)) return
      samples.push({ x, y, t })
      while (samples.length > 16 || samples.length > 1 && t - samples[0].t > 100) samples.shift()
    },
    velocity(now) {
      const a = samples[0], b = samples.at(-1)
      if (!a || !b || !Number.isFinite(now) || now < b.t || now - b.t > 80 || b.t - a.t < 8) return { x: 0, y: 0 }
      const bound = v => Math.max(-1.5, Math.min(1.5, v))
      return { x: bound((b.x - a.x) * 1000 / (b.t - a.t)), y: bound((b.y - a.y) * 1000 / (b.t - a.t)) }
    },
  }
}

export function createJellyGestures(sim) {
  const pointers = new Map()
  const history = createPointerHistory()
  let pinchDistance = 0, pinchScale = 1
  const pair = () => [...pointers.values()]
  const center = () => {
    const values = pair()
    return { x: values.reduce((v, p) => v + p.x, 0) / values.length, y: values.reduce((v, p) => v + p.y, 0) / values.length }
  }
  const distance = () => { const [a, b] = pair(); return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const rebase = t => {
    history.clear()
    const c = center()
    sim.rebase(c.x, c.y)
    history.add(c.x, c.y, t)
    pinchDistance = distance()
    pinchScale = sim.getState().targetScale
  }
  return {
    getState: () => ({ activePointerCount: pointers.size, pinch: { active: pointers.size === 2, distance: pinchDistance, startScale: pinchScale } }),
    has: id => pointers.has(id),
    down(id, type, x, y, t) {
      if (pointers.has(id) || pointers.size >= 2 || ![x, y, t].every(Number.isFinite) || sim.getState().interactionMode === 'locked') return false
      if (pointers.size && (type !== 'touch' || pair()[0].type !== 'touch')) return false
      if (!pointers.size && !sim.grab(x, y)) return false
      pointers.set(id, { type, x, y })
      if (pointers.size === 2) rebase(t)
      else { history.clear(); history.add(x, y, t) }
      return true
    },
    move(id, x, y, t) {
      const p = pointers.get(id)
      if (!p || ![x, y, t].every(Number.isFinite)) return
      p.x = x; p.y = y
      const c = center()
      sim.drag(c.x, c.y)
      if (pointers.size === 2 && pinchDistance > .005) sim.resize(pinchScale * distance() / pinchDistance)
      history.add(c.x, c.y, t)
    },
    up(id, t) {
      if (!pointers.has(id)) return
      pointers.delete(id)
      if (pointers.size) rebase(t)
      else { const v = history.velocity(t); sim.release(v.x, v.y); history.clear(); pinchDistance = 0 }
    },
    cancel() { pointers.clear(); history.clear(); pinchDistance = 0; sim.cancel() },
  }
}

// Pointer capture and listener ownership live here, separate from gesture mathematics.
export function bindJellyInput(button, host, sim, wake) {
  const gestures = createJellyGestures(sim)
  const captures = new Set()
  const removers = []
  let disposed = false, capturesAcquired = 0, capturesReleased = 0
  const on = (type, fn, options) => {
    button.addEventListener(type, fn, options)
    removers.push(() => button.removeEventListener(type, fn, options))
  }
  const point = e => {
    const rect = host.getBoundingClientRect()
    // Equal units in both axes preserve physical pinch distance on rectangular stages.
    return { x: (e.clientX - rect.left - rect.width / 2) / rect.height, y: (e.clientY - rect.top - rect.height / 2) / rect.height }
  }
  const release = id => {
    if (!captures.delete(id)) return
    capturesReleased++
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id)
  }
  const cancel = () => { gestures.cancel(); for (const id of captures) release(id); wake() }
  on('pointerdown', e => {
    if (e.button !== 0) return
    const p = point(e)
    if (!gestures.down(e.pointerId, e.pointerType, p.x, p.y, e.timeStamp)) return
    try { button.setPointerCapture(e.pointerId); captures.add(e.pointerId); capturesAcquired++ }
    catch { cancel(); return }
    button.focus({ preventScroll: true })
    e.preventDefault(); wake()
  })
  on('pointermove', e => {
    if (gestures.has(e.pointerId)) {
      const p = point(e)
      gestures.move(e.pointerId, p.x, p.y, e.timeStamp)
    } else if (e.pointerType !== 'touch') {
      const r = button.getBoundingClientRect()
      sim.contact((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1)
    }
    wake()
  })
  on('pointerleave', () => { sim.contact(); wake() })
  on('pointerup', e => { gestures.up(e.pointerId, e.timeStamp); release(e.pointerId); wake() })
  on('pointercancel', cancel)
  on('lostpointercapture', e => { if (captures.has(e.pointerId)) cancel() })
  on('wheel', e => {
    if (sim.getState().interactionMode === 'locked' || !Number.isFinite(e.deltaY)) return
    e.preventDefault()
    const delta = Math.max(-100, Math.min(100, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)))
    sim.resize(sim.getState().targetScale * Math.exp(-delta * .002)); wake()
  }, { passive: false })
  on('keydown', e => {
    if (!['+', '=', '-', '_', '0'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    sim.resize(e.key === '0' ? 1 : sim.getState().targetScale + (['+', '='].includes(e.key) ? .05 : -.05)); wake()
  })
  on('click', e => { if (e.detail === 0) { sim.poke(); wake() } })
  return {
    getState: () => ({ ...gestures.getState(), capturesAcquired, capturesReleased, inputListeners: removers.length }),
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); for (const remove of removers) remove(); removers.length = 0 },
  }
}
