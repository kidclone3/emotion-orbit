import * as THREE from 'three'
import { gsap } from 'gsap'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import {
  fluidFragmentShader,
  fullscreenVertexShader,
  LensShader,
  PresentationShader,
} from './liquid-shaders.js'
import {
  createAdaptiveQualityController,
  createContextRecoveryController,
  createRenderScheduler,
} from './render-policy.js'

const DEBUG_MODES = ['final', 'fold height', 'surface normals', 'specular field']

export class LiquidExperience {
  constructor({ mount, initialVisual, reduceMotion = false, baseline = false, quality = 'balanced', seed = 17, onFps = null }) {
    this.mount = mount
    this.reduceMotion = reduceMotion
    this.baseline = baseline
    this.quality = quality
    this.qualityController = createAdaptiveQualityController({ initialTier: quality })
    this.seed = seed
    this.onFps = onFps
    this.motionScale = reduceMotion ? 0.08 : 1
    this.animationTime = 3.1
    this.flowSpeed = { value: initialVisual.flowSpeed }
    this.drawingBufferSize = new THREE.Vector2(1, 1)
    this.width = 1
    this.height = 1
    this.activePixelRatio = 1
    this.resizeFrame = 0
    this.resizeSettleTimer = 0
    this.frameCount = 0
    this.fpsStartedAt = performance.now()
    this.hidden = false
    this.contextController = createContextRecoveryController()
    this.destroyed = false
    this.tickerAttached = false

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(0x050606, 1)
    mount.append(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.uniforms = {
      uTime: { value: this.animationTime },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSeed: { value: seed },
      uPaletteA: { value: new THREE.Color(initialVisual.primary) },
      uPaletteB: { value: new THREE.Color(initialVisual.accent) },
      uPaletteC: { value: new THREE.Color(initialVisual.background) },
      uGlow: { value: new THREE.Color(initialVisual.glow) },
      uEnergy: { value: initialVisual.energy },
      uFoldDepth: { value: initialVisual.foldDepth },
      uPulse: { value: 0 },
      uDebug: { value: 0 },
      uBuoyancy: { value: initialVisual.buoyancy },
      uExpansion: { value: initialVisual.expansion },
      uPulseRate: { value: initialVisual.pulseRate },
      uSmoothness: { value: initialVisual.smoothness },
      uAttraction: { value: initialVisual.attraction },
      uOrbit: { value: initialVisual.orbit },
      uDepth: { value: initialVisual.depth },
      uPressure: { value: initialVisual.pressure },
      uSharpness: { value: initialVisual.sharpness },
      uDownwardDrift: { value: initialVisual.downwardDrift },
      uTrail: { value: initialVisual.trail },
      uSatellites: { value: initialVisual.satellites },
      uPairing: { value: initialVisual.pairing },
      uAperture: { value: initialVisual.aperture },
      uShear: { value: initialVisual.shear },
      uWeight: { value: initialVisual.weight },
      uStability: { value: initialVisual.stability },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: fullscreenVertexShader,
      fragmentShader: fluidFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)

    this.composerTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    this.composerTarget.texture.name = 'EmotionOrbit.Liquid.RGBA8'
    this.composer = new EffectComposer(this.renderer, this.composerTarget)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.lensPass = new ShaderPass(LensShader)
    this.presentationPass = new ShaderPass(PresentationShader)
    this.outputPass = new OutputPass()
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.lensPass)
    this.composer.addPass(this.presentationPass)
    this.composer.addPass(this.outputPass)

    this.lensPass.uniforms.uTime = this.uniforms.uTime
    this.lensPass.uniforms.uGlow = this.uniforms.uGlow
    this.lensPass.uniforms.uEnergy = this.uniforms.uEnergy
    this.lensPass.uniforms.uPulse = this.uniforms.uPulse
    this.lensPass.uniforms.uExpansion = this.uniforms.uExpansion
    this.lensPass.uniforms.uDepth = this.uniforms.uDepth
    this.lensPass.uniforms.uPressure = this.uniforms.uPressure
    this.lensPass.uniforms.uOrbit = this.uniforms.uOrbit
    this.lensPass.uniforms.uBuoyancy = this.uniforms.uBuoyancy
    this.lensPass.uniforms.uPulseRate = this.uniforms.uPulseRate
    this.lensPass.uniforms.uSmoothness = this.uniforms.uSmoothness
    this.lensPass.uniforms.uAttraction = this.uniforms.uAttraction
    this.lensPass.uniforms.uSharpness = this.uniforms.uSharpness
    this.lensPass.uniforms.uDownwardDrift = this.uniforms.uDownwardDrift
    this.lensPass.uniforms.uTrail = this.uniforms.uTrail
    this.lensPass.uniforms.uSatellites = this.uniforms.uSatellites
    this.lensPass.uniforms.uPairing = this.uniforms.uPairing
    this.lensPass.uniforms.uAperture = this.uniforms.uAperture
    this.lensPass.uniforms.uShear = this.uniforms.uShear
    this.lensPass.uniforms.uWeight = this.uniforms.uWeight
    this.lensPass.uniforms.uStability = this.uniforms.uStability
    this.lensPass.uniforms.uLensStrength.value = initialVisual.lensStrength
    this.lensPass.uniforms.uLensShape.value = initialVisual.lensShape
    this.lensPass.enabled = !baseline
    this.presentationPass.enabled = !baseline

    this.renderFrame = this.renderFrame.bind(this)
    this.requestFrame = this.requestFrame.bind(this)
    this.scheduleResize = this.scheduleResize.bind(this)
    this.handleContextLost = this.handleContextLost.bind(this)
    this.handleContextRestored = this.handleContextRestored.bind(this)
    this.frameScheduler = createRenderScheduler({
      reducedMotion: reduceMotion,
      render: () => this.renderFrame(0, 1000 / 60),
    })
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored)
    this.applyQualityTier(quality)
    this.resize({ settleQuality: true })
    gsap.ticker.lagSmoothing(500, 33)
    this.attachTicker()

  }

  attachTicker() {
    if (this.reduceMotion || this.hidden || this.destroyed || this.tickerAttached) return
    gsap.ticker.add(this.renderFrame)
    this.tickerAttached = true
  }

  detachTicker() {
    if (!this.tickerAttached) return
    gsap.ticker.remove(this.renderFrame)
    this.tickerAttached = false
  }

  applyQualityTier(tier) {
    this.quality = tier
    this.presentationPass.enabled = !this.baseline && tier !== 'low'
  }

  emitRenderStatus(status, message) {
    this.mount.dispatchEvent(new CustomEvent('liquidstatus', { detail: { status, message } }))
  }

  requestFrame() {
    if (this.destroyed || this.hidden || this.contextController.getState() !== 'ready') return false
    if (this.reduceMotion) return this.frameScheduler.request()
    this.composer.render()
    return true
  }

  handleContextLost(event) {
    event.preventDefault()
    if (this.destroyed || !this.contextController.lose()) return
    this.detachTicker()
    this.emitRenderStatus('lost', 'Visual field paused while WebGL recovers.')
  }

  handleContextRestored() {
    if (this.destroyed || !this.contextController.restore()) return
    this.qualityController.reset()
    this.frameCount = 0
    this.fpsStartedAt = performance.now()
    this.applyQualityTier(this.quality)
    this.resize({ settleQuality: true })
    this.requestFrame()
    this.attachTicker()
    this.emitRenderStatus('restored', 'Visual field restored.')
  }

  resolvePixelRatio(width, height) {
    const deviceRatio = window.devicePixelRatio || 1
    if (this.quality === 'low') return Math.min(deviceRatio, 1)
    if (this.quality === 'high') return Math.min(deviceRatio, 1.75)
    const aspect = width / Math.max(height, 1)
    const landscapeBlend = THREE.MathUtils.smoothstep(aspect, 0.55, 1.25)
    return Math.min(deviceRatio, THREE.MathUtils.lerp(1.15, 1.5, landscapeBlend))
  }

  resize({ settleQuality = true } = {}) {
    const bounds = this.mount.getBoundingClientRect()
    const width = Math.max(Math.round(bounds.width), 1)
    const height = Math.max(Math.round(bounds.height), 1)
    const nextPixelRatio = settleQuality || this.width === 1
      ? this.resolvePixelRatio(width, height)
      : this.activePixelRatio
    const ratioChanged = Math.abs(nextPixelRatio - this.activePixelRatio) > 0.001
    const sizeChanged = width !== this.width || height !== this.height

    if (!sizeChanged && !ratioChanged) return false

    this.width = width
    this.height = height
    this.activePixelRatio = nextPixelRatio
    this.renderer.setPixelRatio(nextPixelRatio)
    this.renderer.setSize(width, height, false)
    this.composer.setPixelRatio(nextPixelRatio)
    this.composer.setSize(width, height)
    this.renderer.getDrawingBufferSize(this.drawingBufferSize)
    this.uniforms.uResolution.value.copy(this.drawingBufferSize)
    this.lensPass.uniforms.uResolution.value.copy(this.drawingBufferSize)
    this.presentationPass.uniforms.uResolution.value.copy(this.drawingBufferSize)

    const aspect = width / height
    const landscapeBlend = THREE.MathUtils.smoothstep(aspect, 0.55, 1)
    this.lensPass.uniforms.uCenter.value.set(
      THREE.MathUtils.lerp(0.66, 0.73, landscapeBlend),
      THREE.MathUtils.lerp(0.33, 0.53, landscapeBlend),
    )
    this.requestFrame()
    return true
  }

  scheduleResize() {
    if (!this.resizeFrame) {
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0
        this.resize({ settleQuality: false })
      })
    }
    window.clearTimeout(this.resizeSettleTimer)
    this.resizeSettleTimer = window.setTimeout(() => this.resize({ settleQuality: true }), 150)
  }


  setVisual(visual, { immediate = false } = {}) {
    const targetA = new THREE.Color(visual.primary)
    const targetB = new THREE.Color(visual.accent)
    const targetC = new THREE.Color(visual.background)
    const targetGlow = new THREE.Color(visual.glow)

    if (immediate) {
      this.uniforms.uPaletteA.value.copy(targetA)
      this.uniforms.uPaletteB.value.copy(targetB)
      this.uniforms.uPaletteC.value.copy(targetC)
      this.uniforms.uGlow.value.copy(targetGlow)
      this.uniforms.uEnergy.value = visual.energy
      this.uniforms.uFoldDepth.value = visual.foldDepth
      this.flowSpeed.value = visual.flowSpeed
      this.lensPass.uniforms.uLensStrength.value = visual.lensStrength
      this.lensPass.uniforms.uLensShape.value = visual.lensShape
      this.uniforms.uBuoyancy.value = visual.buoyancy
      this.uniforms.uExpansion.value = visual.expansion
      this.uniforms.uPulseRate.value = visual.pulseRate
      this.uniforms.uSmoothness.value = visual.smoothness
      this.uniforms.uAttraction.value = visual.attraction
      this.uniforms.uOrbit.value = visual.orbit
      this.uniforms.uDepth.value = visual.depth
      this.uniforms.uPressure.value = visual.pressure
      this.uniforms.uSharpness.value = visual.sharpness
      this.uniforms.uDownwardDrift.value = visual.downwardDrift
      this.uniforms.uTrail.value = visual.trail
      this.uniforms.uSatellites.value = visual.satellites
      this.uniforms.uPairing.value = visual.pairing
      this.uniforms.uAperture.value = visual.aperture
      this.uniforms.uShear.value = visual.shear
      this.uniforms.uWeight.value = visual.weight
      this.uniforms.uStability.value = visual.stability
      this.requestFrame()
      return
    }

    const duration = this.reduceMotion ? 0.1 : 1.65
    const common = {
      duration,
      ease: 'power3.inOut',
      overwrite: 'auto',
      ...(this.reduceMotion ? { onUpdate: this.requestFrame } : {}),
    }
    gsap.to(this.uniforms.uPaletteA.value, { r: targetA.r, g: targetA.g, b: targetA.b, ...common })
    gsap.to(this.uniforms.uPaletteB.value, { r: targetB.r, g: targetB.g, b: targetB.b, ...common })
    gsap.to(this.uniforms.uPaletteC.value, { r: targetC.r, g: targetC.g, b: targetC.b, ...common })
    gsap.to(this.uniforms.uGlow.value, { r: targetGlow.r, g: targetGlow.g, b: targetGlow.b, ...common })
    gsap.to(this.uniforms.uEnergy, { value: visual.energy, ...common })
    gsap.to(this.uniforms.uFoldDepth, { value: visual.foldDepth, ...common })
    gsap.to(this.flowSpeed, { value: visual.flowSpeed, ...common })
    gsap.to(this.lensPass.uniforms.uLensStrength, { value: visual.lensStrength, ...common })
    gsap.to(this.lensPass.uniforms.uLensShape, { value: visual.lensShape, ...common })
    gsap.to(this.uniforms.uBuoyancy, { value: visual.buoyancy, ...common })
    gsap.to(this.uniforms.uExpansion, { value: visual.expansion, ...common })
    gsap.to(this.uniforms.uPulseRate, { value: visual.pulseRate, ...common })
    gsap.to(this.uniforms.uSmoothness, { value: visual.smoothness, ...common })
    gsap.to(this.uniforms.uAttraction, { value: visual.attraction, ...common })
    gsap.to(this.uniforms.uOrbit, { value: visual.orbit, ...common })
    gsap.to(this.uniforms.uDepth, { value: visual.depth, ...common })
    gsap.to(this.uniforms.uPressure, { value: visual.pressure, ...common })
    gsap.to(this.uniforms.uSharpness, { value: visual.sharpness, ...common })
    gsap.to(this.uniforms.uDownwardDrift, { value: visual.downwardDrift, ...common })
    gsap.to(this.uniforms.uTrail, { value: visual.trail, ...common })
    gsap.to(this.uniforms.uSatellites, { value: visual.satellites, ...common })
    gsap.to(this.uniforms.uPairing, { value: visual.pairing, ...common })
    gsap.to(this.uniforms.uAperture, { value: visual.aperture, ...common })
    gsap.to(this.uniforms.uShear, { value: visual.shear, ...common })
    gsap.to(this.uniforms.uWeight, { value: visual.weight, ...common })
    gsap.to(this.uniforms.uStability, { value: visual.stability, ...common })
  }

  pulse() {
    gsap.fromTo(
      this.uniforms.uPulse,
      { value: 1 },
      {
        value: 0,
        duration: this.reduceMotion ? 0.15 : 0.85,
        ease: 'power3.out',
        overwrite: true,
        ...(this.reduceMotion ? { onUpdate: this.requestFrame } : {}),
      },
    )
  }

  setHidden(hidden) {
    this.hidden = hidden
    this.qualityController.reset()
    this.frameCount = 0
    this.fpsStartedAt = performance.now()
    if (hidden) {
      this.detachTicker()
      return
    }
    this.attachTicker()
    this.requestFrame()
  }

  renderFrame(_time, deltaTime) {
    if (this.hidden || this.destroyed || this.contextController.getState() !== 'ready') return
    const rawDeltaMs = Math.max(deltaTime, 0)
    const simulationDeltaMs = Math.min(rawDeltaMs, 1000 / 30)


    this.animationTime += simulationDeltaMs * 0.001 * this.motionScale * (0.56 + this.flowSpeed.value * 1.35)
    this.uniforms.uTime.value = this.animationTime
    this.composer.render()

    this.frameCount += 1
    const now = performance.now()
    if (now - this.fpsStartedAt >= 750) {
      const fps = Math.min(99, Math.round(this.frameCount * 1000 / (now - this.fpsStartedAt)))
      this.onFps?.(fps)
      if (!this.reduceMotion) {
        const nextTier = this.qualityController.observe(fps)
        if (nextTier) {
          this.applyQualityTier(nextTier)
          this.resize({ settleQuality: true })
        }
      }
      this.frameCount = 0
      this.fpsStartedAt = now
    }
  }

  getState() {
    return {
      renderer: 'liquid',
      pipeline: ['RenderPass', 'LiquidLensShader', 'LiquidPresentationShader', 'OutputPass'],
      framebufferFormat: 'RGBA8',
      derivativeIntrinsics: false,
      seed: this.seed,
      pixelRatio: Number(this.activePixelRatio.toFixed(3)),
      drawingBuffer: [this.drawingBufferSize.x, this.drawingBufferSize.y],
      shaderTime: Number(this.animationTime.toFixed(4)),
      context: this.contextController.getState(),
      renderMode: this.reduceMotion ? 'on-demand' : 'continuous',
      quality: {
        ...this.qualityController.getState(),
        adaptive: !this.reduceMotion,
      },
      scheduler: this.frameScheduler.getState(),
    }
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.detachTicker()
    this.frameScheduler.destroy()
    this.contextController.destroy()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored)
    gsap.killTweensOf([
      this.uniforms.uPaletteA.value,
      this.uniforms.uPaletteB.value,
      this.uniforms.uPaletteC.value,
      this.uniforms.uGlow.value,
      this.uniforms.uEnergy,
      this.uniforms.uFoldDepth,
      this.uniforms.uPulse,
      this.uniforms.uBuoyancy,
      this.uniforms.uExpansion,
      this.uniforms.uPulseRate,
      this.uniforms.uSmoothness,
      this.uniforms.uAttraction,
      this.uniforms.uOrbit,
      this.uniforms.uDepth,
      this.uniforms.uPressure,
      this.uniforms.uSharpness,
      this.uniforms.uDownwardDrift,
      this.uniforms.uTrail,
      this.uniforms.uSatellites,
      this.uniforms.uPairing,
      this.uniforms.uAperture,
      this.uniforms.uShear,
      this.uniforms.uWeight,
      this.uniforms.uStability,
      this.flowSpeed,
      this.lensPass.uniforms.uLensStrength,
      this.lensPass.uniforms.uLensShape,
    ])
    window.clearTimeout(this.resizeSettleTimer)
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame)
    this.composer.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
