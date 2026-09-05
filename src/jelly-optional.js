// Optional visual loading must never gate encounter startup or expose loader errors.
export function loadOptionalJelly({ load, parent, options } = {}) {
  let mounted, disposed = false, unavailable = false
  let latest = { stage: 'story', closed: false, turnStatus: 'idle' }
  const visual = ({ stage, closed, turnStatus }) => ({ stage, closed, turnStatus })
  const safe = (method, input) => {
    latest = visual(input)
    try { mounted?.[method](latest) } catch {
      unavailable = true
      try { mounted?.dispose() } catch { /* encounter remains available */ }
      mounted = null
    }
  }
  const ready = Promise.resolve().then(load).then(module => {
    if (disposed) return
    mounted = module.mountJellyCharacter(parent, options)
    safe('sync', latest)
  }).catch(() => { unavailable = true })
  return {
    ready,
    sync(input) { safe('sync', input) },
    respond(input) { safe('respond', input) },
    getState() { return mounted?.getState() ?? { enabled: true, backend: unavailable ? 'unavailable' : 'initializing', fallback: unavailable, disposed } },
    dispose() { if (disposed) return; disposed = true; try { mounted?.dispose() } catch { /* optional */ } },
  }
}
