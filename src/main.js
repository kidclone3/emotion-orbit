import * as THREE from 'three'
import './style.css'
import { EMOTIONS, EMOTION_ORDER, resolveEmotion } from './emotions.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="experience" data-emotion="wonder">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Emotion Orbit home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>emotion.orbit</span>
      </a>
      <div class="status" aria-label="Experience status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>Field active</span>
      </div>
    </header>

    <section class="copy" aria-labelledby="main-title">
      <p class="eyebrow">An affective field study</p>
      <h1 id="main-title">Feel it<br><em>in color.</em></h1>
      <p class="intro" id="emotion-copy">${EMOTIONS.wonder.copy}</p>
      <form class="mood-form" id="mood-form">
        <label for="mood-input">What are you feeling?</label>
        <div class="input-row">
          <input id="mood-input" name="mood" type="text" autocomplete="off" placeholder="Try “peaceful” or “furious”" />
          <button type="submit" aria-label="Translate mood into color">
            <span>Translate</span><span aria-hidden="true">↗</span>
          </button>
        </div>
        <p class="form-note" id="form-note" aria-live="polite">Choose a state or describe it in your own words.</p>
      </form>
    </section>

    <div class="scene-wrap" id="scene-wrap" aria-label="Interactive three-dimensional emotional egg">
      <div class="scene" id="scene"></div>
      <div class="scene-caption" aria-hidden="true">
        <span id="emotion-number">04</span>
        <span class="caption-line"></span>
        <span id="emotion-name">Wonder</span>
      </div>
      <div class="interaction-hint"><span>Click to stir the egg</span><i aria-hidden="true"></i></div>
    </div>

    <nav class="emotion-nav" aria-label="Select an emotional state">
      ${EMOTION_ORDER.map(
        (key) => `
          <button class="emotion-button${key === 'wonder' ? ' is-active' : ''}" type="button" data-emotion="${key}" aria-pressed="${key === 'wonder'}">
            <span class="emotion-swatch" style="--swatch:${EMOTIONS[key].primary}"></span>
            <span>${EMOTIONS[key].label}</span>
          </button>`,
      ).join('')}
    </nav>

    <footer class="footer">
      <p>Move to bend the field · Click to add energy</p>
      <div class="meter" aria-label="Animation performance"><span id="fps">60</span> FPS</div>
    </footer>

    <div class="grain" aria-hidden="true"></div>
    <div class="ambient ambient-a" aria-hidden="true"></div>
    <div class="ambient ambient-b" aria-hidden="true"></div>
    <p class="sr-only" id="emotion-announcement" aria-live="polite"></p>
  </main>
`

const experience = document.querySelector('.experience')
const sceneMount = document.querySelector('#scene')
const sceneWrap = document.querySelector('#scene-wrap')
const emotionCopy = document.querySelector('#emotion-copy')
const emotionNumber = document.querySelector('#emotion-number')
const emotionName = document.querySelector('#emotion-name')
const announcement = document.querySelector('#emotion-announcement')
const formNote = document.querySelector('#form-note')
const moodForm = document.querySelector('#mood-form')
const moodInput = document.querySelector('#mood-input')
const fpsOutput = document.querySelector('#fps')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let renderer
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
} catch (error) {
  sceneMount.innerHTML = '<p class="webgl-error">This experience needs WebGL. Try enabling hardware acceleration in your browser.</p>'
  throw error
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
sceneMount.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
camera.position.set(0, 0, 7.5)

const field = new THREE.Group()
field.rotation.set(-0.08, 0.22, -0.08)
scene.add(field)

const uniforms = {
  uTime: { value: 0 },
  uPrimary: { value: new THREE.Color(EMOTIONS.wonder.primary) },
  uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
  uEnergy: { value: EMOTIONS.wonder.energy },
  uTurbulence: { value: EMOTIONS.wonder.turbulence },
  uBurst: { value: 0 },
}

const eggProfileShader = `
  vec3 eggProfile(vec3 p) {
    float vertical = clamp(p.y / 1.38, -1.0, 1.0);
    float upper = smoothstep(0.02, 0.92, vertical);
    float lowerBody = exp(-pow((vertical + 0.34) * 2.25, 2.0));
    float radialScale = 1.02 + lowerBody * 0.105 - upper * 0.31;
    p.xz *= radialScale;
    p.y = p.y * 1.24 - 0.08;
    return p;
  }

  vec3 eggNormal(vec3 objectNormal, float vertical) {
    float upper = smoothstep(0.02, 0.92, vertical);
    float lowerBody = exp(-pow((vertical + 0.34) * 2.25, 2.0));
    float radialScale = 1.02 + lowerBody * 0.105 - upper * 0.31;
    return normalize(vec3(objectNormal.x / radialScale, objectNormal.y / 1.24, objectNormal.z / radialScale));
  }
`

const coreGeometry = new THREE.IcosahedronGeometry(1.38, 5)
const coreMaterial = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    uniform float uTime;
    uniform float uEnergy;
    uniform float uTurbulence;
    uniform float uBurst;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vDisplacement;
    varying float vVertical;

    ${eggProfileShader}

    void main() {
      float vertical = clamp(position.y / 1.38, -1.0, 1.0);
      vec3 p = eggProfile(position);
      vec3 shapedNormal = eggNormal(normal, vertical);
      float speed = 0.35 + uEnergy * 0.42;
      float waveA = sin(p.x * 3.1 + uTime * speed) * cos(p.y * 2.7 - uTime * speed * 0.7);
      float waveB = sin((p.y + p.z) * 4.6 - uTime * speed * 1.35);
      float waveC = cos(length(p.xy) * 7.0 + uTime * 0.5);
      float breath = sin(uTime * (0.8 + uEnergy * 0.72)) * (0.025 + uEnergy * 0.018);
      float silhouetteGuard = mix(1.0, 0.48, smoothstep(0.48, 1.0, vertical));
      float displacement = ((waveA * 0.047 + waveB * 0.023 + waveC * 0.012) * uTurbulence + breath + uBurst * 0.09) * silhouetteGuard;
      p += shapedNormal * displacement;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * shapedNormal);
      vViewPosition = -mvPosition.xyz;
      vDisplacement = displacement;
      vVertical = vertical;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uEnergy;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vDisplacement;
    varying float vVertical;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.4);
      float vertical = smoothstep(-0.72, 0.8, vVertical + vDisplacement * 0.8);
      float lightBand = pow(max(dot(normal, normalize(vec3(-0.4, 0.7, 0.5))), 0.0), 2.0);
      vec3 base = mix(uPrimary * 0.4, uAccent * 0.82, vertical);
      base += uPrimary * lightBand * (0.28 + uEnergy * 0.1);
      base += mix(uAccent, vec3(1.0), 0.28) * fresnel * 0.68;
      float alpha = 0.54 + lightBand * 0.12 + fresnel * 0.28;
      gl_FragColor = vec4(base, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
})

const core = new THREE.Mesh(coreGeometry, coreMaterial)
core.renderOrder = 2
field.add(core)

const yolkUniforms = {
  uPrimary: { value: new THREE.Color(EMOTIONS.wonder.primary) },
  uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
  uEnergy: uniforms.uEnergy,
  uTime: uniforms.uTime,
  uBurst: uniforms.uBurst,
}
const yolkMaterial = new THREE.ShaderMaterial({
  uniforms: yolkUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    uniform float uTime;
    uniform float uEnergy;
    uniform float uBurst;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vVertical;
    ${eggProfileShader}
    void main() {
      float vertical = clamp(position.y / 1.38, -1.0, 1.0);
      vec3 p = eggProfile(position);
      vec3 shapedNormal = eggNormal(normal, vertical);
      float pulse = sin(uTime * (0.9 + uEnergy * 0.35)) * 0.018 + uBurst * 0.035;
      p += shapedNormal * pulse;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * shapedNormal);
      vViewPosition = -mvPosition.xyz;
      vVertical = vertical;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uEnergy;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vVertical;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float facing = max(dot(normal, viewDir), 0.0);
      float crown = smoothstep(-0.8, 0.82, vVertical);
      vec3 color = mix(uPrimary * 1.25, mix(uPrimary, uAccent, 0.58), crown);
      color += mix(uAccent, vec3(1.0), 0.5) * pow(facing, 2.2) * (0.42 + uEnergy * 0.12);
      gl_FragColor = vec4(color, 0.72 + facing * 0.22);
    }
  `,
})
const yolk = new THREE.Mesh(coreGeometry, yolkMaterial)
yolk.scale.setScalar(0.61)
yolk.position.set(-0.05, -0.16, 0.03)
yolk.renderOrder = 1
field.add(yolk)

const shellMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
    uGlow: { value: new THREE.Color(EMOTIONS.wonder.glow) },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    ${eggProfileShader}
    void main() {
      float vertical = clamp(position.y / 1.38, -1.0, 1.0);
      vec3 p = eggProfile(position);
      vec3 shapedNormal = eggNormal(normal, vertical);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * shapedNormal);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    uniform vec3 uGlow;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.15);
      vec3 color = mix(uAccent, uGlow, rim);
      gl_FragColor = vec4(color, 0.025 + rim * 0.52);
    }
  `,
})
const shell = new THREE.Mesh(coreGeometry, shellMaterial)
shell.scale.setScalar(1.075)
shell.renderOrder = 3
field.add(shell)

function seededRandom(seed = 918273) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const random = seededRandom()
const particleCount = 1500
const particlePositions = new Float32Array(particleCount * 3)
const particleSeeds = new Float32Array(particleCount)
for (let index = 0; index < particleCount; index += 1) {
  const radius = 1.75 + Math.pow(random(), 1.8) * 2.05
  const theta = random() * Math.PI * 2
  const phi = Math.acos(2 * random() - 1)
  particlePositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
  particlePositions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.72
  particlePositions[index * 3 + 2] = radius * Math.cos(phi)
  particleSeeds[index] = random()
}

const particleGeometry = new THREE.BufferGeometry()
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(particleSeeds, 1))

const particleUniforms = {
  uPrimary: { value: new THREE.Color(EMOTIONS.wonder.primary) },
  uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
  uSize: { value: EMOTIONS.wonder.particleSize },
  uTime: uniforms.uTime,
  uEnergy: uniforms.uEnergy,
  uBurst: uniforms.uBurst,
}

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: particleUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float aSeed;
    uniform float uTime;
    uniform float uSize;
    uniform float uEnergy;
    uniform float uBurst;
    varying float vSeed;

    void main() {
      vec3 p = position;
      float drift = uTime * (0.04 + uEnergy * 0.035) * (0.45 + aSeed);
      float c = cos(drift);
      float s = sin(drift);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p *= 1.0 + uBurst * (0.03 + aSeed * 0.08);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = (uSize + aSeed * 2.2 + uBurst * 2.0) * (28.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vSeed = aSeed;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    varying float vSeed;

    void main() {
      float distanceToCenter = length(gl_PointCoord - vec2(0.5));
      float alpha = smoothstep(0.5, 0.04, distanceToCenter);
      vec3 color = mix(uPrimary, uAccent, vSeed);
      gl_FragColor = vec4(color, alpha * (0.35 + vSeed * 0.65));
    }
  `,
})

const particles = new THREE.Points(particleGeometry, particleMaterial)
field.add(particles)

const ringGroup = new THREE.Group()
const ringMaterials = []
;[
  [2.18, 0.006, 0.25, 0.08, 0.2],
  [2.62, 0.004, -0.44, 0.72, -0.18],
  [3.05, 0.003, 0.86, -0.2, 0.54],
].forEach(([radius, tube, x, y, z], index) => {
  const material = new THREE.MeshBasicMaterial({
    color: index === 1 ? EMOTIONS.wonder.accent : EMOTIONS.wonder.primary,
    transparent: true,
    opacity: index === 1 ? 0.22 : 0.13,
    blending: THREE.AdditiveBlending,
  })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 220), material)
  ring.rotation.set(x, y, z)
  ring.userData.direction = index % 2 === 0 ? 1 : -1
  ring.userData.speed = 0.12 + index * 0.035
  ringMaterials.push(material)
  ringGroup.add(ring)
})
field.add(ringGroup)

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,255,255,.75)')
  gradient.addColorStop(0.18, 'rgba(255,255,255,.24)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,.06)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const haloMaterial = new THREE.SpriteMaterial({
  map: makeGlowTexture(),
  color: EMOTIONS.wonder.glow,
  transparent: true,
  opacity: 0.42,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
const halo = new THREE.Sprite(haloMaterial)
halo.scale.setScalar(5.8)
field.add(halo)
halo.renderOrder = -1

const target = {
  primary: new THREE.Color(EMOTIONS.wonder.primary),
  accent: new THREE.Color(EMOTIONS.wonder.accent),
  glow: new THREE.Color(EMOTIONS.wonder.glow),
  energy: EMOTIONS.wonder.energy,
  turbulence: EMOTIONS.wonder.turbulence,
  orbitSpeed: EMOTIONS.wonder.orbitSpeed,
  particleSize: EMOTIONS.wonder.particleSize,
}

let currentEmotion = 'wonder'
let orbitSpeed = target.orbitSpeed
let burst = 0
let pointerX = 0
let pointerY = 0
let targetPointerX = 0
let targetPointerY = 0
let lastTime = performance.now()
let frameCount = 0
let fpsStartedAt = lastTime

function setCssPalette(emotion) {
  document.documentElement.style.setProperty('--emotion-primary', emotion.primary)
  document.documentElement.style.setProperty('--emotion-accent', emotion.accent)
  document.documentElement.style.setProperty('--emotion-bg', emotion.background)
  document.documentElement.style.setProperty('--emotion-glow', emotion.glow)
}

function selectEmotion(name, source = 'control') {
  const emotion = EMOTIONS[name]
  if (!emotion || name === currentEmotion) return
  currentEmotion = name
  target.primary.set(emotion.primary)
  target.accent.set(emotion.accent)
  target.glow.set(emotion.glow)
  target.energy = emotion.energy
  target.turbulence = emotion.turbulence
  target.orbitSpeed = emotion.orbitSpeed
  target.particleSize = emotion.particleSize

  experience.dataset.emotion = name
  setCssPalette(emotion)
  emotionCopy.textContent = emotion.copy
  emotionNumber.textContent = emotion.number
  emotionName.textContent = emotion.label
  announcement.textContent = `${emotion.label} selected. ${emotion.copy}`
  document.querySelectorAll('.emotion-button').forEach((button) => {
    const isActive = button.dataset.emotion === name
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })

  if (source === 'text') {
    formNote.textContent = `Mapped to ${emotion.label}. The field is changing now.`
  } else {
    formNote.textContent = `Selected ${emotion.label}. Describe another feeling whenever you want.`
  }
}

function resize() {
  const { width, height } = sceneWrap.getBoundingClientRect()
  if (width === 0 || height === 0) return
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  camera.position.z = width < 620 ? 8.8 : 7.5
}

function stirField() {
  burst = 1
  sceneWrap.classList.remove('is-stirred')
  requestAnimationFrame(() => sceneWrap.classList.add('is-stirred'))
}

function animate(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  const motionScale = reduceMotion ? 0.16 : 1
  const time = now / 1000
  uniforms.uTime.value = time * motionScale
  burst = THREE.MathUtils.damp(burst, 0, 3.2, delta)
  uniforms.uBurst.value = burst
  uniforms.uPrimary.value.lerp(target.primary, 0.035)
  uniforms.uAccent.value.lerp(target.accent, 0.035)
  particleUniforms.uPrimary.value.copy(uniforms.uPrimary.value)
  particleUniforms.uAccent.value.copy(uniforms.uAccent.value)
  yolkUniforms.uPrimary.value.copy(uniforms.uPrimary.value)
  yolkUniforms.uAccent.value.copy(uniforms.uAccent.value)
  shellMaterial.uniforms.uAccent.value.lerp(target.accent, 0.035)
  shellMaterial.uniforms.uGlow.value.lerp(target.glow, 0.035)
  haloMaterial.color.lerp(target.glow, 0.035)
  ringMaterials.forEach((material, index) => material.color.lerp(index === 1 ? target.accent : target.primary, 0.035))
  uniforms.uEnergy.value = THREE.MathUtils.damp(uniforms.uEnergy.value, target.energy, 3.5, delta)
  uniforms.uTurbulence.value = THREE.MathUtils.damp(uniforms.uTurbulence.value, target.turbulence, 3.5, delta)
  particleUniforms.uSize.value = THREE.MathUtils.damp(particleUniforms.uSize.value, target.particleSize, 3.5, delta)
  orbitSpeed = THREE.MathUtils.damp(orbitSpeed, target.orbitSpeed, 3.5, delta)

  pointerX = THREE.MathUtils.damp(pointerX, targetPointerX, 3.4, delta)
  pointerY = THREE.MathUtils.damp(pointerY, targetPointerY, 3.4, delta)
  field.rotation.y += delta * orbitSpeed * motionScale
  field.rotation.x = -0.08 + pointerY * 0.18
  camera.position.x = pointerX * 0.35
  camera.position.y = -pointerY * 0.28
  camera.lookAt(0, 0, 0)

  const pulse = 1 + Math.sin(time * (0.8 + uniforms.uEnergy.value)) * 0.014 * uniforms.uEnergy.value + burst * 0.035
  core.scale.setScalar(pulse)
  yolk.scale.setScalar(0.61 + Math.sin(time * 0.62) * 0.008 + burst * 0.018)
  shell.scale.setScalar(1.075 + Math.sin(time * 0.7) * 0.009 + burst * 0.028)
  shell.rotation.y -= delta * orbitSpeed * 0.35 * motionScale
  particles.rotation.z += delta * orbitSpeed * 0.045 * motionScale
  ringGroup.children.forEach((ring) => {
    ring.rotation.z += delta * ring.userData.speed * ring.userData.direction * motionScale
  })
  haloMaterial.opacity = 0.28 + uniforms.uEnergy.value * 0.1 + burst * 0.16
  halo.scale.setScalar(5.4 + uniforms.uEnergy.value * 0.5 + burst * 0.6)

  renderer.render(scene, camera)

  frameCount += 1
  if (now - fpsStartedAt >= 750) {
    const fps = Math.round((frameCount * 1000) / (now - fpsStartedAt))
    fpsOutput.textContent = String(Math.min(fps, 99))
    frameCount = 0
    fpsStartedAt = now
  }
  requestAnimationFrame(animate)
}

sceneWrap.addEventListener('pointermove', (event) => {
  if (reduceMotion) return
  const bounds = sceneWrap.getBoundingClientRect()
  targetPointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
  targetPointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
})
sceneWrap.addEventListener('pointerleave', () => {
  targetPointerX = 0
  targetPointerY = 0
})
sceneWrap.addEventListener('pointerdown', stirField)
sceneWrap.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    stirField()
  }
})
sceneWrap.tabIndex = 0

for (const button of document.querySelectorAll('.emotion-button')) {
  button.addEventListener('click', () => selectEmotion(button.dataset.emotion))
}

moodForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const name = resolveEmotion(moodInput.value)
  if (!name) {
    formNote.textContent = 'I could not map that yet. Try joyful, peaceful, loving, curious, angry, or sad.'
    moodInput.setAttribute('aria-invalid', 'true')
    moodInput.focus()
    return
  }
  moodInput.removeAttribute('aria-invalid')
  selectEmotion(name, 'text')
})

window.addEventListener('resize', resize)
new ResizeObserver(resize).observe(sceneWrap)
setCssPalette(EMOTIONS.wonder)
resize()
requestAnimationFrame(animate)
