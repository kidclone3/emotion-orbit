// Owns asynchronous initialization, animation scheduling and the terminal GPU boundary.
export function watchJellyDevice(device, lost) {
  let active = true
  device.lost.then(info => { if (active) lost(info) })
  return () => { active = false }
}

export function createJellyLifecycle({ create, draw, fallback, schedule, cancel }) {
  let resource = null, frame = null, disposed = false, failed = false, visible = true
  let started = false, ready = false
  const released = new WeakSet()
  const releaseOnce = owned => {
    if (!owned || released.has(owned)) return
    released.add(owned)
    owned.dispose()
  }
  const stop = () => { if (frame !== null) cancel(frame); frame = null }
  const release = () => { const owned = resource; resource = null; releaseOnce(owned) }
  const scope = {
    get cancelled() { return disposed || failed },
    own(owned) { if (disposed || failed) releaseOnce(owned); else resource = owned; return owned },
  }
  const fail = error => {
    if (disposed || failed) return
    failed = true
    stop()
    try { release() } finally { fallback(error) }
  }
  const wake = () => {
    if (disposed || failed || !ready || !visible || !resource || frame !== null) return
    frame = schedule(now => {
      frame = null
      try { if (draw(resource, now) !== false) wake() } catch (error) { fail(error) }
    })
  }
  return {
    async start() {
      if (started || disposed || failed) return
      started = true
      try {
        const created = await create(scope)
        if (disposed || failed) { releaseOnce(created); return }
        resource = created
        ready = true
        wake()
      } catch (error) { fail(error) }
    },
    wake,
    fail,
    setVisible(value) { visible = value; if (visible) wake(); else stop() },
    dispose() { if (disposed) return; disposed = true; stop(); release() },
  }
}
