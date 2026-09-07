import { bindJellyInput } from './jelly-input.js'
import { createJellySimulation, JELLY_RENDER_VIEW, sampleJellySurface, visualStateFor } from './jelly-simulation.js'
import { createJellyLifecycle, watchJellyDevice } from './jelly-lifecycle.js'

// This entire module is loaded only by the opt-in role-play entrypoint.
export function mountJellyCharacter(parent, { debug = false } = {}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const simulation = createJellySimulation({ reducedMotion: media.matches })
  const host = document.createElement('div')
  host.className = 'alone-jelly'
  host.innerHTML = '<div class="jelly-shadow" aria-hidden="true"></div><div class="jelly-static-form" aria-hidden="true"><span class="jelly-static-limb jelly-static-arm jelly-static-arm-left"></span><span class="jelly-static-limb jelly-static-arm jelly-static-arm-right"></span><span class="jelly-static-limb jelly-static-leg jelly-static-leg-left"></span><span class="jelly-static-limb jelly-static-leg jelly-static-leg-right"></span><div class="jelly-static"></div></div><button class="jelly-poke" type="button" aria-label="Gently move Alone. Drag to hold and release to throw. Wheel or pinch to resize; plus and minus change size, zero resets size."><span class="sr-only">Gently poke Alone</span></button>'
  parent.append(host)
  const button = host.querySelector('button')
  const staticForm = host.querySelector('.jelly-static-form')
  const staticBody = host.querySelector('.jelly-static')
  const shadow = host.querySelector('.jelly-shadow')
  const overlay = debug ? document.createElement('output') : null
  if (overlay) { overlay.className = 'jelly-debug'; host.append(overlay) }
  let backend = 'initializing', fallback = false, disposed = false, failureReason = null
  let staticFrame = null, resourcesReleased = 0
  let frames = 0, resizeCount = 0, last = 0, dirty = true
  let width = 0, height = 0, drawCalls = 0, triangles = 0, frameMs = 0
  let surfaceAnchorResolver = null
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
    staticForm.style.transform = transform
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
  const input = bindJellyInput(button, host, simulation, wake, (x, y) => surfaceAnchorResolver?.(x, y))

  const lifecycle = createJellyLifecycle({
    schedule: requestAnimationFrame,
    cancel: cancelAnimationFrame,
    create: async scope => {
      const [T, N] = await Promise.all([import('three/webgpu'), import('three/tsl')])
      if (scope.cancelled) return null
      const owned = []
      const own = value => { if (scope.cancelled) value.dispose(); else owned.push(value); return value }
      let renderer, canvas, unwatchDevice, resolveSurface, initialized = false, released = false
      let pendingRendererWork = false, releaseRequested = false
      const release = () => {
        if (released) return
        releaseRequested = true
        if (surfaceAnchorResolver === resolveSurface) surfaceAnchorResolver = null
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
        const camera = new T.PerspectiveCamera(JELLY_RENDER_VIEW.fov, 1, .1, 30)
        camera.position.set(0, JELLY_RENDER_VIEW.cameraY, JELLY_RENDER_VIEW.cameraZ)
        camera.lookAt(0, JELLY_RENDER_VIEW.targetY, 0)
        const viewHeight = JELLY_RENDER_VIEW.viewHeight

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
        geometry.computeBoundingSphere()
        geometry.boundingSphere.radius = 2
        const mesh = new T.Mesh(geometry, material)
        mesh.name = 'jelly-body'
        mesh.rotation.set(JELLY_RENDER_VIEW.rotationX, JELLY_RENDER_VIEW.rotationY, JELLY_RENDER_VIEW.rotationZ)
        const limbGroup = new T.Group()
        limbGroup.name = 'jelly-limbs'
        const limbAxis = new T.Vector3(0, -1, 0)
        const limbSpecs = [
          { name: 'jelly-arm-left', role: 'arm', side: -1, root: [-.94, -.08, .42], direction: [-.94, -.2, .5], radius: .115, length: .36, bend: .035, tipWidth: .66, tipDepth: .5 },
          { name: 'jelly-arm-right', role: 'arm', side: 1, root: [.95, -.06, .18], direction: [.92, -.18, .14], radius: .115, length: .34, bend: .03, tipWidth: .66, tipDepth: .5 },
          { name: 'jelly-leg-left', role: 'leg', side: -1, root: [-.4, -.72, .12], direction: [-.18, -.93, .22], radius: .13, length: .28, bend: .02, tipWidth: .36, tipDepth: .62 },
          { name: 'jelly-leg-right', role: 'leg', side: 1, root: [.4, -.73, .12], direction: [.2, -.93, .26], radius: .13, length: .28, bend: .018, tipWidth: .36, tipDepth: .62 },
        ]
        const limbs = limbSpecs.map(spec => {
          const limbGeometry = own(new T.CapsuleGeometry(spec.radius, spec.length, 5, 12))
          const limbPositions = limbGeometry.attributes.position
          const halfLength = spec.length * .5 + spec.radius
          const totalLength = halfLength * 2
          for (let i = 0; i < limbPositions.count; i++) {
            const x = limbPositions.getX(i), y = limbPositions.getY(i), z = limbPositions.getZ(i)
            const t = Math.max(0, Math.min(1, (halfLength - y) / totalLength))
            const tipT = Math.max(0, Math.min(1, (t - .5) * 2))
            const tip = tipT * tipT * (3 - 2 * tipT)
            const bend = Math.sin(Math.PI * t) * spec.bend * spec.side
            const toe = spec.role === 'leg' ? tip * .13 : 0
            limbPositions.setXYZ(
              i,
              x * (1 + tip * spec.tipWidth) + bend,
              y - halfLength + .055,
              z * (1 + tip * spec.tipDepth) + toe,
            )
          }
          limbPositions.needsUpdate = true
          limbGeometry.computeVertexNormals()
          limbGeometry.computeBoundingBox()
          limbGeometry.computeBoundingSphere()
          const limb = new T.Mesh(limbGeometry, material)
          limb.name = spec.name
          const restRoot = new T.Vector3(...spec.root)
          const restDirection = new T.Vector3(...spec.direction).normalize()
          const direction = new T.Vector3()
          limb.quaternion.setFromUnitVectors(limbAxis, restDirection)
          limbGroup.add(limb)
          return { ...spec, mesh: limb, geometry: limbGeometry, restRoot, restDirection, direction }
        })
        mesh.add(limbGroup)
        const face = new T.Group()
        face.name = 'jelly-face'
        const faceMaterial = own(new T.MeshPhysicalMaterial({
          color: 0x123d24, roughness: .24, metalness: 0,
          clearcoat: .9, clearcoatRoughness: .16,
          transmission: .12, thickness: .08, ior: 1.34,
          transparent: true, opacity: .82, depthWrite: false,
        }))
        const eyeGeometry = own(new T.SphereGeometry(.105, 18, 14))
        const mouthGeometry = own(new T.TorusGeometry(.19, .03, 10, 28, Math.PI))
        const leftEye = new T.Mesh(eyeGeometry, faceMaterial)
        leftEye.name = 'jelly-eye-left'; leftEye.userData.faceRole = 'eye'; leftEye.renderOrder = 2
        const rightEye = new T.Mesh(eyeGeometry, faceMaterial)
        rightEye.name = 'jelly-eye-right'; rightEye.userData.faceRole = 'eye'; rightEye.renderOrder = 2
        const mouth = new T.Mesh(mouthGeometry, faceMaterial)
        mouth.name = 'jelly-mouth'; mouth.userData.faceRole = 'mouth'; mouth.renderOrder = 2
        face.add(leftEye, rightEye, mouth)
        mesh.add(face)
        scene.add(mesh)
        const faceAnchors = [
          { mesh: leftEye, x: -.06, y: .12, z: .84 },
          { mesh: rightEye, x: .58, y: .12, z: .8 },
          { mesh: mouth, x: .26, y: -.17, z: .81 },
        ]
        const projected = new T.Vector3()
        const deformed = new Float64Array(3)
        const surfaceOffset = { x: 0, y: 0, weight: 0 }
        const raycaster = new T.Raycaster()
        const pointerNdc = new T.Vector2()
        const localHit = new T.Vector3()
        const triangleA = new T.Vector3(), triangleB = new T.Vector3(), triangleC = new T.Vector3()
        const barycentric = new T.Vector3()
        const hitTriangle = new T.Triangle()
        const rayHits = []
        const resolvedAnchor = { x: 0, y: 0 }
        resolveSurface = (clientX, clientY) => {
          if (released || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
          const rect = host.getBoundingClientRect()
          if (!(rect.width > 0 && rect.height > 0)) return null
          pointerNdc.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2)
          mesh.updateMatrixWorld()
          camera.updateMatrixWorld()
          raycaster.setFromCamera(pointerNdc, camera)
          rayHits.length = 0
          raycaster.intersectObject(mesh, false, rayHits)
          const hit = rayHits[0]
          if (!hit?.face) return null
          localHit.copy(hit.point)
          mesh.worldToLocal(localHit)
          triangleA.fromBufferAttribute(positions, hit.face.a)
          triangleB.fromBufferAttribute(positions, hit.face.b)
          triangleC.fromBufferAttribute(positions, hit.face.c)
          hitTriangle.set(triangleA, triangleB, triangleC).getBarycoord(localHit, barycentric)
          if (![barycentric.x, barycentric.y, barycentric.z].every(Number.isFinite)) return null
          const a = hit.face.a * 3, b = hit.face.b * 3, c = hit.face.c * 3
          const restX = base[a] * barycentric.x + base[b] * barycentric.y + base[c] * barycentric.z
          const restY = base[a + 1] * barycentric.x + base[b + 1] * barycentric.y + base[c + 1] * barycentric.z
          resolvedAnchor.x = Math.max(-1, Math.min(1, restX / 1.13))
          resolvedAnchor.y = Math.max(-1, Math.min(1, restY / .97))
          return resolvedAnchor
        }
        const deformPoint = (target, x, y, z, s) => {
          const stretch = Math.max(.7, 1 + s.squash)
          const lateral = 1 / Math.sqrt(stretch)
          const ripple = s.wobble * Math.sin(y * 4 + x * 2 + s.time * 2)
          sampleJellySurface(s.deformation, x / 1.13, y / .97, surfaceOffset)
          const volume = s.deformation.volumeScale
          target[0] = (x * lateral + s.lean * y + ripple) * volume + surfaceOffset.x
          target[1] = (y * stretch + ripple * .5) * volume - surfaceOffset.y
          target[2] = (z * lateral + ripple) * volume
        }
        const update = s => {
          for (let i = 0; i < positions.count; i++) {
            const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
            deformPoint(deformed, x, y, z, s)
            positions.setXYZ(i, deformed[0], deformed[1], deformed[2])
          }
          for (let i = 0; i < faceAnchors.length; i++) {
            const anchor = faceAnchors[i]
            deformPoint(deformed, anchor.x, anchor.y, anchor.z, s)
            anchor.mesh.position.set(deformed[0], deformed[1], deformed[2])
          }
          const limbSway = s.reducedMotion ? 0 : Math.max(-.14, Math.min(.14, s.lean * .55 + s.wobble * 3 + s.velocity.x * .018))
          const limbSettle = s.reducedMotion ? 0 : Math.max(-.1, Math.min(.1, s.groundImpact * .08 - s.squash * .12))
          for (const limb of limbs) {
            deformPoint(deformed, limb.restRoot.x, limb.restRoot.y, limb.restRoot.z, s)
            limb.mesh.position.set(deformed[0], deformed[1], deformed[2])
            limb.direction.copy(limb.restDirection)
            if (limb.role === 'arm') {
              limb.direction.y -= limbSway * .32
              limb.direction.z += limbSway * limb.side * .16
            } else {
              limb.direction.x += limbSway * limb.side * .12
              limb.direction.z += limbSettle
            }
            limb.direction.normalize()
            limb.mesh.quaternion.setFromUnitVectors(limbAxis, limb.direction)
            const lengthScale = 1 + Math.max(-.08, Math.min(.08, s.squash * (limb.role === 'leg' ? -.16 : -.08) + s.groundImpact * .035))
            const widthScale = 1 + Math.max(-.06, Math.min(.06, s.optics.pressure * .025 - s.squash * .04))
            limb.mesh.scale.set(widthScale, lengthScale, widthScale)
          }
          leftEye.scale.set(1, s.face.eyeOpen, .38)
          rightEye.scale.set(1, s.face.eyeOpen, .38)
          mouth.scale.set(s.face.mouthWidth, .4 + s.face.mouthCurve, .65)
          mouth.rotation.z = Math.PI + s.face.mouthTilt
          positions.needsUpdate = true
          geometry.computeVertexNormals()
          mesh.scale.setScalar(s.scale)
          mesh.position.x = s.position.x * viewHeight
          mesh.position.y = .91 * s.squash - s.position.y * viewHeight
          mesh.updateMatrixWorld()
          camera.updateMatrixWorld()
          for (const limb of limbs) {
            const limbPositions = limb.geometry.attributes.position
            const limbUvs = limb.geometry.attributes.uv
            for (let i = 0; i < limbPositions.count; i++) {
              projected.fromBufferAttribute(limbPositions, i).applyMatrix4(limb.mesh.matrixWorld).project(camera)
              limbUvs.setXY(i, projected.x * .5 + .5, projected.y * .5 + .5)
            }
            limbUvs.needsUpdate = true
          }
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
        surfaceAnchorResolver = resolveSurface
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
