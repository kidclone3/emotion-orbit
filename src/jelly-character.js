import { bindJellyInput } from './jelly-input.js'
import { createJellySimulation, visualStateFor } from './jelly-simulation.js'
import { createJellyLifecycle, watchJellyDevice } from './jelly-lifecycle.js'

// This entire module is loaded only by the opt-in role-play entrypoint.
export function mountJellyCharacter(parent, { debug = false } = {}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const simulation = createJellySimulation({ reducedMotion: media.matches })
  const host = document.createElement('div')
  host.className = 'alone-jelly'
  host.innerHTML = '<div class="jelly-shadow" aria-hidden="true"></div><div class="jelly-static" aria-hidden="true"></div><button class="jelly-poke" type="button" aria-label="Gently move Alone. Drag to hold and release to throw. Wheel or pinch to resize; plus and minus change size, zero resets size."><span class="sr-only">Gently poke Alone</span></button>'
  parent.append(host)
  const button = host.querySelector('button')
  const staticBody = host.querySelector('.jelly-static')
  const shadow = host.querySelector('.jelly-shadow')
  const overlay = debug ? document.createElement('output') : null
  if (overlay) { overlay.className = 'jelly-debug'; host.append(overlay) }
  let backend = 'initializing', fallback = false, disposed = false, failureReason = null
  let staticFrame = null, resourcesReleased = 0
  let frames = 0, resizeCount = 0, last = 0, dirty = true
  let width = 0, height = 0, drawCalls = 0, triangles = 0, frameMs = 0
  const getState = () => ({
    enabled: true, renderer: backend === 'static' ? 'CSS' : 'WebGPURenderer', backend,
    ...simulation.getState(), ...input.getState(), resourcesReleased, fallback, failureReason, disposed, visible: !document.hidden,
    frames, resizeCount, width, height, drawCalls, triangles, frameMs,
    opticalModel: 'screen-space forest refraction + Beer-Lambert absorption',
  })
  const updateDOM = s => {
    host.dataset.grabbed = String(s.grabbed)
    host.dataset.locked = String(s.interactionMode === 'locked')
    if (s.interactionMode === 'locked') {
      button.disabled = true
      button.setAttribute('aria-label', 'Alone is resting. This encounter has ended.')
      if (document.activeElement === button) button.blur()
    }
    const h = host.clientHeight
    const transform = `translate(${s.position.x * h}px, ${s.position.y * h}px) scale(${s.scale})`
    staticBody.style.transform = transform
    staticBody.style.filter = `brightness(${1 + s.optics.value})`
    // A small relative lag stays attached to the body; scale suggests lift, not camera travel.
    shadow.style.transform = `translate(${(s.position.x + (s.optics.x - s.position.x) * .15) * h}px, ${s.position.y * h}px) scale(${s.scale * (1 - (s.scale - 1) * .25)}, ${s.scale * (1 + s.optics.pressure * .12)})`
    shadow.style.opacity = String(.88 - (s.scale - 1) * .35 + s.optics.pressure * .12)
    if (backend === 'static' || backend === 'initializing') {
      button.style.left = '25%'; button.style.top = '24%'; button.style.width = '50%'; button.style.height = '48%'
      button.style.transform = transform
    }
    if (overlay) overlay.textContent = `${backend} · ${s.visualState} · ${s.interactionMode}\n${input.getState().activePointerCount} pointers · scale ${s.scale.toFixed(2)}/${s.targetScale.toFixed(2)}\n${width}×${height} · ${triangles} triangles · ${frames} frames`
  }
  const staticTick = now => {
    staticFrame = null
    if (disposed || document.hidden) return
    const s = simulation.step(last ? (now - last) / 1000 : 1 / 60)
    last = now
    updateDOM(s)
    if (s.needsFrame) staticFrame = requestAnimationFrame(staticTick)
  }
  const wake = () => {
    if (disposed) return
    if (backend === 'static' && !document.hidden && staticFrame === null) staticFrame = requestAnimationFrame(staticTick)
    else lifecycle.wake()
  }
  const input = bindJellyInput(button, host, simulation, wake)

  const lifecycle = createJellyLifecycle({
    schedule: requestAnimationFrame,
    cancel: cancelAnimationFrame,
    create: async scope => {
      const [T, N] = await Promise.all([import('three/webgpu'), import('three/tsl')])
      if (scope.cancelled) return null
      const owned = []
      const own = value => { if (scope.cancelled) value.dispose(); else owned.push(value); return value }
      let renderer, canvas, unwatchDevice, initialized = false, released = false
      let pendingRendererWork = false, releaseRequested = false
      const release = () => {
        if (released) return
        releaseRequested = true
        unwatchDevice?.()
        canvas?.removeEventListener('webglcontextlost', lost)
        canvas?.remove()
        // Async renderer work may still acquire pipelines/bindings. Keep its backend
        // and inputs alive, then destroy everything once after that work settles.
        if (pendingRendererWork) return
        released = true
        resourcesReleased++
        for (const item of owned.reverse()) item.dispose()
        owned.length = 0
        // Three's dispose() calls async setAnimationLoop(), which retries a failed init.
        // Release only the partial backend when init did not complete.
        if (initialized) renderer.dispose()
        else if (renderer) {
          canvas?.removeEventListener('webglcontextlost', renderer.backend._onContextLost)
          if (renderer.backend.extensions) renderer.backend.dispose()
          else renderer.backend.device?.destroy()
        }
      }
      const settleRendererWork = () => {
        pendingRendererWork = false
        if (releaseRequested) release()
      }
      const lost = event => { event?.preventDefault?.(); failureReason ??= 'device-lost'; lifecycle.fail() }
      try {
        // Three probes the adapter and falls back to WebGL2 if initialization fails.
        renderer = new T.WebGPURenderer({ alpha: true, antialias: true, forceWebGL: !navigator.gpu })
        const resource = scope.own({ dispose: release })
        renderer.onDeviceLost = lost
        renderer.onError = lost
        renderer.debug.onShaderError = lost
        canvas = renderer.domElement
        canvas.setAttribute('aria-hidden', 'true')
        canvas.addEventListener('webglcontextlost', lost)
        pendingRendererWork = true
        try { await renderer.init(); initialized = true } finally { settleRendererWork() }
        if (scope.cancelled) return resource
        if (renderer.backend.device) unwatchDevice = watchJellyDevice(renderer.backend.device, lost)
        backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2'
        fallback = backend !== 'webgpu'
        renderer.setClearColor(0x000000, 0)
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
        renderer.toneMapping = T.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.1
        const scene = new T.Scene()
        const camera = new T.PerspectiveCamera(34, 1, .1, 30)
        camera.position.set(0, .45, 6.3)
        camera.lookAt(0, -.05, 0)

        // A procedural studio probe creates long, soft highlights, not point-light dots.
        const probe = document.createElement('canvas')
        probe.width = 512; probe.height = 256
        const ctx = probe.getContext('2d')
        ctx.fillStyle = '#253c29'; ctx.fillRect(0, 0, 512, 256)
        const gradient = ctx.createLinearGradient(0, 0, 0, 256)
        gradient.addColorStop(0, '#c5e6b3'); gradient.addColorStop(.48, '#46563b'); gradient.addColorStop(1, '#07140b')
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256)
        ctx.filter = 'blur(3px)'
        ctx.fillStyle = '#ffffff'; ctx.fillRect(80, 30, 27, 124)
        ctx.fillStyle = '#edffe0'; ctx.fillRect(292, 49, 78, 30)
        ctx.fillStyle = '#baf2b4'; ctx.fillRect(445, 70, 13, 92)
        const environment = own(new T.CanvasTexture(probe))
        environment.mapping = T.EquirectangularReflectionMapping
        environment.colorSpace = T.SRGBColorSpace
        scene.environment = environment
        scene.add(new T.HemisphereLight(0xd5ffbc, 0x17351b, 1.1))
        const key = new T.DirectionalLight(0xf0ffe4, 3)
        key.position.set(-3, 5, 4); scene.add(key)
        const rim = new T.DirectionalLight(0xb8ff8e, 1.6)
        rim.position.set(4, 1, -2); scene.add(rim)

        const forest = own(await new T.TextureLoader().loadAsync('/assets/forest/hidden-forest-wide.png'))
        if (scope.cancelled) return resource
        forest.colorSpace = T.SRGBColorSpace
        const offset = N.uniform(new T.Vector2())
        const scale = N.uniform(new T.Vector2(1, 1))
        const pulse = N.uniform(0)
        const pressure = N.uniform(0)
        const value = N.uniform(0)
        const parallax = N.uniform(new T.Vector2())
        // Fixed camera: approximate the curved interior path using the front normal.
        // Refraction samples the same forest as the DOM; absorption grows through the core.
        const facing = N.normalView.z.abs().clamp(.02, 1)
        const path = facing.sqrt().mul(1.8).mul(pressure.mul(.22).add(1))
        const refractedUV = offset.add(N.uv().mul(scale)).add(parallax).add(N.normalView.xy.mul(.065).mul(path))
        const transmitted = N.texture(forest, refractedUV).rgb.mul(N.vec3(.95, .18, 1.3).mul(path).negate().exp())
        const material = own(new T.MeshPhysicalNodeMaterial({
          color: 0x73e841, metalness: 0, roughness: .075,
          clearcoat: 1, clearcoatRoughness: .055, ior: 1.36,
          specularIntensity: 1, envMapIntensity: .85,
        }))
        material.colorNode = N.vec3(.006, .035, .002)
        material.emissiveNode = transmitted.mul(value.add(1).mul(1.2)).add(N.vec3(.06, .22, .012).mul(pulse))
        // UVs describe screen position in the fixed camera rather than sphere longitude.
        // World projection is updated with deformation on CPU below.
        const geometry = own(new T.SphereGeometry(1, 64, 48))
        const positions = geometry.attributes.position
        const base = new Float32Array(positions.array.length)
        const round = n => Math.sign(n) * Math.pow(Math.abs(n), .65)
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
          base[i * 3] = round(x) * 1.13 + .06 * y
          base[i * 3 + 1] = round(y) * .86 + .11 * Math.sin(x * 3 + z * 2) * (.5 + y * .5)
          base[i * 3 + 2] = round(z) * .82 * (1 + .035 * Math.sin(y * 4 + x * 2))
        }
        const mesh = new T.Mesh(geometry, material)
        mesh.rotation.set(.08, -.36, -.055)
        scene.add(mesh)
        const projected = new T.Vector3()
        const update = s => {
          const stretch = 1 + s.squash
          const lateral = 1 / Math.sqrt(stretch)
          for (let i = 0; i < positions.count; i++) {
            const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
            const ripple = s.wobble * Math.sin(y * 4 + x * 2 + s.time * 2)
            positions.setXYZ(i, x * lateral + s.lean * y + ripple, y * stretch + ripple * .5, z * lateral + ripple)
          }
          positions.needsUpdate = true
          geometry.computeVertexNormals()
          const viewHeight = 2 * 6.3 * Math.tan(17 * Math.PI / 180)
          mesh.scale.setScalar(s.scale)
          mesh.position.x = s.position.x * viewHeight
          mesh.position.y = .91 * s.squash - s.position.y * viewHeight
          mesh.updateMatrixWorld()
          camera.updateMatrixWorld()
          let minX = 1, minY = 1, maxX = -1, maxY = -1
          for (let i = 0; i < positions.count; i++) {
            projected.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera)
            minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x)
            minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y)
            geometry.attributes.uv.setXY(i, projected.x * .5 + .5, projected.y * .5 + .5)
          }
          // Conservative rounded hit region inside the actual projected mesh; no stage-wide input plane.
          const bw = (maxX - minX) * .5 * width, bh = (maxY - minY) * .5 * height
          button.style.transform = ''
          button.style.left = `${(minX * .5 + .5) * width + bw * .08}px`
          button.style.top = `${(.5 - maxY * .5) * height + bh * .09}px`
          button.style.width = `${bw * .84}px`; button.style.height = `${bh * .82}px`
          geometry.attributes.uv.needsUpdate = true
          pulse.value = s.glow * .6
          pressure.value = s.optics.pressure
          value.value = s.optics.value
          parallax.value.set((s.optics.x - s.position.x) * .025 + s.lean * .012, (s.position.y - s.optics.y) * .025 + (s.scale - 1) * .008)
          material.envMapIntensity = .85 + s.optics.value * .7 + s.optics.pressure * .04
        }
        const resize = () => {
          const rect = host.getBoundingClientRect()
          width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height))
          renderer.setSize(width, height, false)
          camera.aspect = width / height; camera.updateProjectionMatrix()
          // DOM background-size: cover (including its 1.015 scale), converted to texture UVs.
          const bounds = parent.getBoundingClientRect()
          const cover = Math.max(bounds.width / forest.image.width, bounds.height / forest.image.height) * 1.015
          const fw = forest.image.width * cover, fh = forest.image.height * cover
          offset.value.set((rect.left - bounds.left + (fw - bounds.width) / 2) / fw, 1 - (rect.bottom - bounds.top + (fh - bounds.height) / 2) / fh)
          scale.value.set(rect.width / fw, rect.height / fh)
          resizeCount++
        }
        resize()
        update(simulation.getState())
        // Await pipeline compilation before exposing a canvas or starting the frame loop.
        pendingRendererWork = true
        try { await renderer.compileAsync(scene, camera) } finally { settleRendererWork() }
        if (scope.cancelled) return resource
        host.prepend(canvas)
        return Object.assign(resource, { renderer, scene, camera, update, resize })
      } catch (error) { release(); throw error }
    },
    draw(resource, now) {
      const start = performance.now()
      if (dirty) { resource.resize(); dirty = false }
      const s = simulation.step(last ? (now - last) / 1000 : 1 / 60)
      last = now
      resource.update(s)
      updateDOM(s)
      resource.renderer.render(resource.scene, resource.camera)
      host.dataset.ready = 'true'
      frames++
      drawCalls = resource.renderer.info.render.drawCalls
      triangles = resource.renderer.info.render.triangles
      frameMs = performance.now() - start
      return s.needsFrame
    },
    fallback() { input.cancel(); simulation.settle(); failureReason ??= 'renderer-unavailable'; backend = 'static'; fallback = true; host.dataset.ready = 'false'; host.dataset.fallback = 'true'; updateDOM(simulation.getState()); wake() },
  })
  const resize = () => { dirty = true; wake() }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  const visibility = () => { input.cancel(); last = 0; if (staticFrame !== null) cancelAnimationFrame(staticFrame); staticFrame = null; lifecycle.setVisible(!document.hidden); if (!document.hidden) wake() }
  const motion = () => { simulation.setReducedMotion(media.matches); wake() }
  document.addEventListener('visibilitychange', visibility)
  media.addEventListener('change', motion)
  window.addEventListener('resize', resize)
  lifecycle.setVisible(!document.hidden)
  lifecycle.start()
  return {
    getState,
    sync(state) { const next = visualStateFor(state); if (next === 'closure') input.cancel(); simulation.setState(next); updateDOM(simulation.getState()); wake() },
    respond(state) {
      if (visualStateFor(state) === 'closure') input.cancel()
      if (backend === 'static') simulation.setState(visualStateFor(state))
      else simulation.respond(visualStateFor(state))
      updateDOM(simulation.getState())
      wake()
    },
    dispose() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', motion)
      window.removeEventListener('resize', resize)
      input.dispose()
      if (staticFrame !== null) cancelAnimationFrame(staticFrame)
      staticFrame = null
      lifecycle.dispose()
      host.remove()
    },
  }
}
