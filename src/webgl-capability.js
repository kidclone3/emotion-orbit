export function probeWebGLCapability({
  createCanvas = () => globalThis.document.createElement('canvas'),
} = {}) {
  try {
    const canvas = createCanvas()
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false,
    })
    if (!context) return { supported: false, api: null }
    context.getExtension?.('WEBGL_lose_context')?.loseContext()
    return { supported: true, api: 'webgl2' }
  } catch {
    return { supported: false, api: null }
  }
}
