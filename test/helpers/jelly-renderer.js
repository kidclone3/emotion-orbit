export * from 'three/webgpu'

export class WebGPURenderer {
  constructor() {
    globalThis.jellyRenderer = this
    this.domElement = document.createElement('canvas')
    this.backend = { isWebGPUBackend: true }
    this.debug = {}
    this.info = { render: { drawCalls: 1, triangles: 1 } }
    this.disposals = 0
    this.liveResources = 0
  }
  async init() { if (globalThis.jellyFailInit) throw Error('unavailable') }
  setClearColor() {}
  setPixelRatio() {}
  setSize() {}
  async compileAsync() {
    this.compiling = true
    await new Promise((resolve, reject) => { this.resume = resolve; this.reject = reject })
    this.liveResources++ // The pending backend continuation acquires resources.
    this.compiling = false
  }
  render() {}
  dispose() { this.disposals++; this.liveResources = 0 }
}

export class TextureLoader {
  async loadAsync() {
    const { Texture } = await import('three/webgpu')
    const texture = new Texture({ width: 1920, height: 1080 })
    return texture
  }
}
