// Optional visual loading must never gate encounter startup or expose loader errors.
function mountLoadingShell(parent) {
  if (!parent?.append || typeof document === 'undefined') return null
  const shell = document.createElement('div')
  shell.className = 'alone-jelly jelly-loading'
  shell.setAttribute('aria-hidden', 'true')
  shell.setAttribute('inert', '')
  shell.inert = true
  shell.innerHTML = '<div class="jelly-shadow"></div><div class="jelly-static-form"><span class="jelly-static-limb jelly-static-arm jelly-static-arm-left"><span class="jelly-forming-shimmer"></span></span><span class="jelly-static-limb jelly-static-arm jelly-static-arm-right"><span class="jelly-forming-shimmer"></span></span><span class="jelly-static-limb jelly-static-leg jelly-static-leg-left"><span class="jelly-forming-shimmer"></span></span><span class="jelly-static-limb jelly-static-leg jelly-static-leg-right"><span class="jelly-forming-shimmer"></span></span><div class="jelly-static"><span class="jelly-forming-shimmer"></span></div></div>'
  parent.append(shell)
  return shell
}

export function loadOptionalJelly({ load, parent, options } = {}) {
  let mounted, disposed = false, unavailable = false, loading = mountLoadingShell(parent)
  let latest = { stage: 'story', closed: false, turnStatus: 'idle' }
  const visual = ({ stage, closed, turnStatus }) => ({ stage, closed, turnStatus })
  const removeLoading = () => {
    if (!loading) return
    loading.remove()
    loading = null
  }
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
    removeLoading()
    safe('sync', latest)
  }).catch(() => {
    unavailable = true
    removeLoading()
  })
  return {
    ready,
    sync(input) { safe('sync', input) },
    respond(input) { safe('respond', input) },
    getState() { return mounted?.getState() ?? { enabled: true, backend: unavailable ? 'unavailable' : 'initializing', fallback: unavailable, disposed } },
    dispose() { if (disposed) return; disposed = true; removeLoading(); try { mounted?.dispose() } catch { /* optional */ } },
  }
}
