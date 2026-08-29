import * as THREE from 'three'
import './style.css'
import { analyzeEmotionMessage, EMOTIONS, EMOTION_ORDER } from './emotions.js'
import { DragOrbitController } from './drag-controller.js'
import { createPiChatClient } from './pi-chat.js'
import { createAccretionField } from './horizon-field.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="experience" data-emotion="wonder">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Emotion Orbit home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>HORIZON / 001</span>
      </a>
      <div class="status" id="bridge-status" aria-live="polite">
        <span class="status-dot" id="bridge-dot" aria-hidden="true"></span>
        <span>Pi connecting</span>
      </div>
    </header>

    <section class="copy" aria-labelledby="main-title">
      <p class="eyebrow">FORM &amp; ORBIT</p>
      <h1 id="main-title">Enter<br><em>the field.</em></h1>
      <p class="intro" id="emotion-copy">${EMOTIONS.wonder.copy}</p>
      <section class="chat-panel" aria-label="Conversation with Pi">
        <div class="chat-log" id="chat-log" role="log" aria-live="off">
          <article class="chat-message is-assistant">
            <span>Pi</span>
            <p>What is moving through you?</p>
          </article>
        </div>
        <form class="mood-form" id="chat-form">
          <label class="sr-only" for="chat-input">Message Pi</label>
          <div class="input-row">
            <textarea id="chat-input" name="message" rows="1" maxlength="2000" placeholder="Type a feeling…" required></textarea>
            <button type="submit" aria-label="Send message to Pi">
              <span>Send</span><span aria-hidden="true">↗</span>
            </button>
          </div>
          <p class="form-note sr-only" id="form-note" role="status" aria-live="polite">Connecting…</p>
        </form>
      </section>
    </section>

    <div class="scene-wrap" id="scene-wrap" aria-label="Interactive three-dimensional emotional event horizon. Drag to shift its orbit, or press Enter to send a pulse.">
      <div class="scene" id="scene"></div>
      <div class="scene-caption" aria-hidden="true">
        <span id="emotion-number">04</span>
        <span class="caption-line"></span>
        <span id="emotion-name">Wonder</span>
      </div>
      <div class="interaction-hint"><span>Drag the horizon · Tap to pulse</span><i aria-hidden="true"></i></div>
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
      <p>Every feeling changes the field</p>
      <div class="meter" aria-label="Animation performance"><span id="fps">60</span> FPS</div>
    </footer>

    <div class="grain" aria-hidden="true"></div>
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
const chatForm = document.querySelector('#chat-form')
const chatInput = document.querySelector('#chat-input')
const chatLog = document.querySelector('#chat-log')
const chatSubmit = chatForm.querySelector('button[type="submit"]')
const bridgeStatus = document.querySelector('#bridge-status span:last-child')
const bridgeDot = document.querySelector('#bridge-dot')
const fpsOutput = document.querySelector('#fps')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const dragOrbit = new DragOrbitController({
  sensitivity: reduceMotion ? 0.0015 : 0.0028,
  damping: reduceMotion ? 9 : 5.5,
  maxPitch: 0.16,
})

let renderer
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
} catch (error) {
  sceneMount.innerHTML = '<p class="webgl-error">This experience needs WebGL. Try enabling hardware acceleration in your browser.</p>'
  throw error
}

renderer.setPixelRatio(1)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
sceneMount.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 120)
camera.position.set(0, 0.25, 8.4)

const field = new THREE.Group()
scene.add(field)

const uniforms = {
  uTime: { value: 0 },
  uPrimary: { value: new THREE.Color(EMOTIONS.wonder.primary) },
  uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
  uEnergy: { value: EMOTIONS.wonder.energy },
  uTurbulence: { value: EMOTIONS.wonder.turbulence },
  uBurst: { value: 0 },
}

const coreGeometry = new THREE.SphereGeometry(1.34, 48, 32)
const coreMaterial = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    uniform float uTime;
    uniform float uEnergy;
    uniform float uTurbulence;
    uniform float uBurst;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vPulse;

    void main() {
      vec3 p = position;
      float lowWave = sin(p.x * 2.8 + uTime * 0.32) * cos(p.y * 3.1 - uTime * 0.24);
      float breath = sin(uTime * (0.38 + uEnergy * 0.18)) * 0.012;
      float displacement = lowWave * uTurbulence * 0.006 + breath + uBurst * 0.018;
      p += normal * displacement;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewPosition = -mvPosition.xyz;
      vPulse = displacement;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uEnergy;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying float vPulse;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float facing = max(dot(normal, viewDir), 0.0);
      float rim = pow(1.0 - facing, 4.4);
      float shallowRim = pow(1.0 - facing, 1.7);
      vec3 voidColor = vec3(0.0008, 0.0016, 0.0038);
      vec3 color = voidColor;
      color += mix(uPrimary, uAccent, 0.68) * rim * (0.32 + uEnergy * 0.13);
      color += uPrimary * shallowRim * 0.018;
      color += vec3(1.0) * max(vPulse, 0.0) * 0.06;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})
const core = new THREE.Mesh(coreGeometry, coreMaterial)
core.renderOrder = 4
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
  side: THREE.BackSide,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uEnergy;
    uniform float uBurst;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.8);
      vec3 color = mix(uPrimary, uAccent, 0.74);
      gl_FragColor = vec4(color, rim * (0.08 + uEnergy * 0.055 + uBurst * 0.1));
    }
  `,
})
const yolk = new THREE.Mesh(new THREE.SphereGeometry(1.43, 40, 28), yolkMaterial)
yolk.renderOrder = 3
field.add(yolk)

const shellMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
    uGlow: { value: new THREE.Color(EMOTIONS.wonder.glow) },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
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
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 4.8);
      vec3 color = mix(uGlow, uAccent, 0.58);
      gl_FragColor = vec4(color, rim * 0.48);
    }
  `,
})
const shell = new THREE.Mesh(new THREE.SphereGeometry(1.52, 40, 28), shellMaterial)
shell.renderOrder = 5
field.add(shell)

const accretion = createAccretionField({
  count: window.innerWidth < 700 ? 2800 : 4200,
  innerRadius: 1.52,
  outerRadius: 5.35,
})
const particleGeometry = new THREE.BufferGeometry()
particleGeometry.setAttribute('position', new THREE.BufferAttribute(accretion.positions, 3))
particleGeometry.setAttribute('aRadius', new THREE.BufferAttribute(accretion.radii, 1))
particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(accretion.seeds, 1))

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
    attribute float aRadius;
    attribute float aSeed;
    uniform float uTime;
    uniform float uSize;
    uniform float uEnergy;
    uniform float uBurst;
    varying float vSeed;
    varying float vHeat;

    void main() {
      vec3 p = position;
      float innerHeat = 1.0 - smoothstep(1.52, 5.35, aRadius);
      float speed = (0.1 + innerHeat * 0.38) * (0.55 + uEnergy * 0.45);
      float angle = uTime * speed * (0.72 + aSeed * 0.48);
      float c = cos(angle);
      float s = sin(angle);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p.y += sin(uTime * 0.8 + aSeed * 18.0) * (0.012 + uBurst * 0.055);
      p *= 1.0 + uBurst * (0.018 + aSeed * 0.035);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = (uSize * 0.2 + aSeed * 0.72 + innerHeat * 0.82) * (23.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vSeed = aSeed;
      vHeat = innerHeat;
    }
  `,
  fragmentShader: `
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    varying float vSeed;
    varying float vHeat;
    void main() {
      vec2 point = gl_PointCoord - vec2(0.5);
      float distanceToCenter = length(point);
      float alpha = smoothstep(0.5, 0.04, distanceToCenter);
      vec3 cool = mix(uPrimary, uAccent, vSeed);
      vec3 color = mix(cool, vec3(0.84, 0.95, 1.0), pow(vHeat, 2.2) * 0.62);
      gl_FragColor = vec4(color, alpha * (0.12 + vHeat * 0.58));
    }
  `,
})

const diskGroup = new THREE.Group()
diskGroup.rotation.x = 0.25
field.add(diskGroup)

const particles = new THREE.Points(particleGeometry, particleMaterial)
particles.renderOrder = 2
diskGroup.add(particles)

const diskMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: uniforms.uTime,
    uPrimary: { value: new THREE.Color(EMOTIONS.wonder.primary) },
    uAccent: { value: new THREE.Color(EMOTIONS.wonder.accent) },
    uEnergy: uniforms.uEnergy,
    uBurst: uniforms.uBurst,
  },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vPosition;
    void main() {
      vPosition = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uPrimary;
    uniform vec3 uAccent;
    uniform float uEnergy;
    uniform float uBurst;
    varying vec2 vPosition;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      float radius = length(vPosition);
      float angle = atan(vPosition.y, vPosition.x);
      float innerHeat = 1.0 - smoothstep(1.48, 5.25, radius);
      float spiralA = sin(angle * 9.0 - radius * 12.0 + uTime * (0.36 + uEnergy * 0.24));
      float spiralB = sin(angle * 17.0 - radius * 20.0 - uTime * 0.22);
      float grain = hash(floor(vPosition * 72.0) + floor(uTime * 2.0));
      float streak = smoothstep(0.12, 0.98, spiralA * 0.46 + spiralB * 0.22 + grain * 0.72);
      float innerBand = exp(-pow((radius - 1.72) * 1.7, 2.0));
      float outerFade = 1.0 - smoothstep(3.4, 5.35, radius);
      float alpha = (streak * 0.12 + innerBand * 0.38) * outerFade;
      alpha *= 0.66 + uEnergy * 0.16 + uBurst * 0.2;
      vec3 base = mix(uPrimary, uAccent, 0.52 + spiralA * 0.16);
      vec3 color = mix(base, vec3(0.86, 0.96, 1.0), innerHeat * 0.58 + innerBand * 0.18);
      gl_FragColor = vec4(color, alpha);
    }
  `,
})
const disk = new THREE.Mesh(new THREE.RingGeometry(1.48, 5.35, 160, 8), diskMaterial)
disk.rotation.x = Math.PI / 2
disk.renderOrder = 1
diskGroup.add(disk)

const ringGroup = new THREE.Group()
const ringMaterials = []
;[
  [1.58, 0.014, 0.62],
  [1.72, 0.009, 0.34],
  [2.18, 0.006, 0.16],
  [3.15, 0.004, 0.08],
].forEach(([radius, tube, opacity], index) => {
  const material = new THREE.MeshBasicMaterial({
    color: index === 1 ? EMOTIONS.wonder.accent : EMOTIONS.wonder.primary,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 160), material)
  ring.rotation.x = Math.PI / 2
  ring.rotation.z = index * 0.018
  ring.userData.direction = index % 2 === 0 ? 1 : -1
  ring.userData.speed = 0.035 + index * 0.012
  ringMaterials.push(material)
  ringGroup.add(ring)
})
diskGroup.add(ringGroup)

const editorialOrbitGroup = new THREE.Group()
field.add(editorialOrbitGroup)

const editorialOrbitLines = []
;[
  { radiusX: 3.9, radiusY: 1.75, rotation: [0.18, 0.08, 0.42], speed: 0.055 },
  { radiusX: 4.25, radiusY: 2.15, rotation: [1.02, 0.32, -0.28], speed: -0.038 },
  { radiusX: 3.55, radiusY: 2.7, rotation: [0.58, -0.5, 0.82], speed: 0.043 },
  { radiusX: 4.7, radiusY: 1.35, rotation: [-0.42, 0.72, -0.14], speed: -0.026 },
].forEach(({ radiusX, radiusY, rotation, speed }, index) => {
  const points = Array.from({ length: 241 }, (_, pointIndex) => {
    const angle = (pointIndex / 240) * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * radiusX, 0, Math.sin(angle) * radiusY)
  })
  const material = new THREE.LineBasicMaterial({
    color: index === 2 ? 0xd6ff3f : 0xe8ece5,
    transparent: true,
    opacity: index === 2 ? 0.2 : 0.14,
    depthWrite: false,
  })
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material)
  line.rotation.set(...rotation)
  line.userData.speed = speed
  editorialOrbitLines.push(line)
  editorialOrbitGroup.add(line)
})

const orbitingFragments = []
const fragmentGeometry = new THREE.TetrahedronGeometry(0.34, 1)
for (let index = 0; index < 7; index += 1) {
  const pivot = new THREE.Group()
  pivot.rotation.set(index * 0.64, index * 0.91, index * 0.37)
  pivot.userData.speed = (0.055 + index * 0.008) * (index % 2 === 0 ? 1 : -1)
  const fragment = new THREE.Mesh(
    fragmentGeometry,
    new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.86, flatShading: true }),
  )
  fragment.position.x = 2.05 + index * 0.34
  fragment.scale.set(0.5 + (index % 3) * 0.32, 0.35 + (index % 2) * 0.5, 0.4 + ((index + 1) % 3) * 0.25)
  fragment.rotation.set(index * 0.8, index * 1.2, index * 0.43)
  fragment.userData.spin = new THREE.Vector3(0.18 + index * 0.015, -0.24 + index * 0.018, 0.12)
  pivot.add(fragment)
  editorialOrbitGroup.add(pivot)
  orbitingFragments.push({ pivot, fragment })
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(128, 128, 3, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,255,255,.92)')
  gradient.addColorStop(0.08, 'rgba(255,255,255,.44)')
  gradient.addColorStop(0.28, 'rgba(190,225,255,.14)')
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
  opacity: 0.28,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
const halo = new THREE.Sprite(haloMaterial)
halo.scale.setScalar(4.5)
halo.renderOrder = -1
field.add(halo)

const starRandom = (() => {
  let value = 918273
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
})()
const starCount = 460
const starPositions = new Float32Array(starCount * 3)
for (let index = 0; index < starCount; index += 1) {
  const offset = index * 3
  starPositions[offset] = (starRandom() - 0.5) * 32
  starPositions[offset + 1] = (starRandom() - 0.5) * 18
  starPositions[offset + 2] = -4 - starRandom() * 18
}
const starGeometry = new THREE.BufferGeometry()
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
const starField = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xbfdfff,
    size: 0.018,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  }),
)
scene.add(starField)

const target = {
  primary: new THREE.Color(EMOTIONS.wonder.primary),
  accent: new THREE.Color(EMOTIONS.wonder.accent),
  glow: new THREE.Color(EMOTIONS.wonder.glow),
  energy: EMOTIONS.wonder.energy,
  turbulence: EMOTIONS.wonder.turbulence,
  orbitSpeed: EMOTIONS.wonder.orbitSpeed,
  particleSize: EMOTIONS.wonder.particleSize,
  shape: EMOTIONS.wonder.shape,
}

let currentEmotion = 'wonder'
let currentVisualContext = {
  label: EMOTIONS.wonder.label,
  primary: EMOTIONS.wonder.primary,
  accent: EMOTIONS.wonder.accent,
}
let orbitSpeed = target.orbitSpeed
let visualShape = target.shape
let burst = 0
let pointerX = 0
let pointerY = 0
let targetPointerX = 0
let targetPointerY = 0
let autoRotationY = 0.22
let lastTime = performance.now()
let frameCount = 0
let fpsStartedAt = lastTime

function setCssPalette(emotion) {
  document.documentElement.style.setProperty('--emotion-primary', emotion.primary)
  document.documentElement.style.setProperty('--emotion-accent', emotion.accent)
  document.documentElement.style.setProperty('--emotion-bg', emotion.background)
  document.documentElement.style.setProperty('--emotion-glow', emotion.glow)
}

function applyVisualState(visual, name, source = 'control') {
  const emotion = EMOTIONS[name]
  if (!emotion) return

  currentEmotion = name
  target.primary.set(visual.primary)
  target.accent.set(visual.accent)
  target.glow.set(visual.glow)
  target.energy = visual.energy
  target.turbulence = visual.turbulence
  target.orbitSpeed = visual.orbitSpeed
  target.particleSize = visual.particleSize
  target.shape = visual.shape
  currentVisualContext = {
    label: source === 'chat' ? `${emotion.label} blend` : emotion.label,
    primary: visual.primary,
    accent: visual.accent,
  }

  experience.dataset.emotion = name
  setCssPalette(visual)
  emotionCopy.textContent = emotion.copy
  emotionNumber.textContent = emotion.number
  emotionName.textContent = source === 'chat' ? `${emotion.label} blend` : emotion.label
  announcement.textContent = `${emotion.label} visual state. ${emotion.copy}`
  document.querySelectorAll('.emotion-button').forEach((button) => {
    const isActive = button.dataset.emotion === name
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })
}

function selectEmotion(name) {
  const emotion = EMOTIONS[name]
  if (!emotion) return
  applyVisualState(emotion, name)
  formNote.textContent = `Visual field tuned to ${emotion.label}. You can keep talking to Pi.`
}

function resize() {
  const { width, height } = sceneWrap.getBoundingClientRect()
  if (width === 0 || height === 0) return
  const maxPixelRatio = width < 620 ? 1.25 : 1.35
  const renderScale = width >= 1200 ? 0.82 : width >= 900 ? 0.92 : 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio) * renderScale)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.position.z = width < 620 ? 9.6 : width < 960 ? 9 : 8.4
  field.position.set(width < 620 ? 0 : width < 960 ? 0.65 : 1.55, width < 620 ? 1.62 : 0.82, 0)
  field.scale.setScalar(width < 620 ? 1.02 : width < 960 ? 1.08 : 1.16)
  camera.updateProjectionMatrix()
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
  diskMaterial.uniforms.uPrimary.value.copy(uniforms.uPrimary.value)
  diskMaterial.uniforms.uAccent.value.copy(uniforms.uAccent.value)
  haloMaterial.color.lerp(target.glow, 0.035)
  for (let index = 0; index < ringMaterials.length; index += 1) {
    ringMaterials[index].color.lerp(index === 1 ? target.accent : target.primary, 0.035)
  }
  uniforms.uEnergy.value = THREE.MathUtils.damp(uniforms.uEnergy.value, target.energy, 3.5, delta)
  uniforms.uTurbulence.value = THREE.MathUtils.damp(uniforms.uTurbulence.value, target.turbulence, 3.5, delta)
  particleUniforms.uSize.value = THREE.MathUtils.damp(particleUniforms.uSize.value, target.particleSize, 3.5, delta)
  orbitSpeed = THREE.MathUtils.damp(orbitSpeed, target.orbitSpeed, 3.5, delta)
  visualShape = THREE.MathUtils.damp(visualShape, target.shape, 2.8, delta)

  pointerX = THREE.MathUtils.damp(pointerX, targetPointerX, 3.4, delta)
  pointerY = THREE.MathUtils.damp(pointerY, targetPointerY, 3.4, delta)
  dragOrbit.tick(delta)
  autoRotationY += delta * orbitSpeed * 0.08 * motionScale
  field.rotation.y = autoRotationY + dragOrbit.rotation.yaw
  field.rotation.x = pointerY * 0.035 + dragOrbit.rotation.pitch * 0.32
  diskGroup.rotation.x = 0.25 + visualShape * 0.07
  camera.position.x = pointerX * 0.16
  camera.position.y = 0.25 - pointerY * 0.1
  camera.lookAt(field.position.x + pointerX * 0.08, field.position.y, 0)

  const pulse = 1 + Math.sin(time * (0.38 + uniforms.uEnergy.value * 0.16)) * 0.009 + burst * 0.018
  core.scale.setScalar(pulse)
  const atmospherePulse = 1 + Math.sin(time * 0.42) * 0.006 + burst * 0.024
  yolk.scale.setScalar(atmospherePulse)
  shell.scale.setScalar(1 + Math.sin(time * 0.36) * 0.004 + burst * 0.032)
  shell.rotation.y -= delta * orbitSpeed * 0.12 * motionScale
  for (let index = 0; index < ringGroup.children.length; index += 1) {
    const ring = ringGroup.children[index]
    ring.rotation.z += delta * ring.userData.speed * ring.userData.direction * motionScale
  }
  for (let index = 0; index < editorialOrbitLines.length; index += 1) {
    const line = editorialOrbitLines[index]
    line.rotation.y += delta * line.userData.speed * motionScale
  }
  for (let index = 0; index < orbitingFragments.length; index += 1) {
    const { pivot, fragment } = orbitingFragments[index]
    pivot.rotation.y += delta * pivot.userData.speed * motionScale
    fragment.rotation.x += delta * fragment.userData.spin.x * motionScale
    fragment.rotation.y += delta * fragment.userData.spin.y * motionScale
    fragment.rotation.z += delta * fragment.userData.spin.z * motionScale
  }
  starField.rotation.y = time * 0.0025 * motionScale
  haloMaterial.opacity = 0.18 + uniforms.uEnergy.value * 0.08 + burst * 0.12
  halo.scale.setScalar(4.35 + uniforms.uEnergy.value * 0.32 + burst * 0.42)

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
  if (event.pointerId === dragOrbit.activePointerId) {
    event.preventDefault()
    const result = dragOrbit.move(event.pointerId, event.clientX, event.clientY)
    if (result.dragging) sceneWrap.classList.add('is-dragging')
    targetPointerX = 0
    targetPointerY = 0
    return
  }
  if (reduceMotion) return
  const bounds = sceneWrap.getBoundingClientRect()
  targetPointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
  targetPointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
})
sceneWrap.addEventListener('pointerleave', () => {
  if (dragOrbit.activePointerId !== null) return
  targetPointerX = 0
  targetPointerY = 0
})
sceneWrap.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!dragOrbit.start(event.pointerId, event.clientX, event.clientY)) return
  sceneWrap.setPointerCapture(event.pointerId)
  sceneWrap.classList.add('is-pressed')
  targetPointerX = 0
  targetPointerY = 0
})

function finishPointer(event, cancelled = false) {
  const result = dragOrbit.end(event.pointerId)
  if (!result.handled) return
  if (sceneWrap.hasPointerCapture(event.pointerId)) sceneWrap.releasePointerCapture(event.pointerId)
  sceneWrap.classList.remove('is-pressed', 'is-dragging')
  if (!cancelled && !result.dragged) stirField()
}

sceneWrap.addEventListener('pointerup', (event) => finishPointer(event))
sceneWrap.addEventListener('pointercancel', (event) => finishPointer(event, true))
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

let bridgeOnline = false
let waitingForPi = false
let activeAssistantText = null
let messageSequence = 0

function appendChatMessage(role, text = '') {
  const message = document.createElement('article')
  message.className = `chat-message is-${role}`
  const author = document.createElement('span')
  author.textContent = role === 'assistant' ? 'Pi' : 'You'
  const body = document.createElement('p')
  body.textContent = text
  message.append(author, body)
  chatLog.append(message)
  chatLog.scrollTop = chatLog.scrollHeight
  return body
}

function setWaitingForPi(waiting) {
  waitingForPi = waiting
  chatForm.setAttribute('aria-busy', String(waiting))
  chatSubmit.disabled = waiting || !bridgeOnline
}

function updateBridgeStatus(status, message) {
  bridgeOnline = status === 'online'
  bridgeDot.dataset.status = status
  bridgeStatus.textContent =
    status === 'online' ? 'Pi connected' : status === 'connecting' ? 'Pi connecting' : 'Pi offline'
  if (!waitingForPi) {
    formNote.textContent =
      message ?? (bridgeOnline ? 'Pi is ready. The field reacts to emotional language as you type.' : 'The Pi bridge is unavailable.')
  }
  chatSubmit.disabled = waitingForPi || !bridgeOnline
}

function finishAssistantResponse() {
  activeAssistantText?.closest('.chat-message')?.classList.remove('is-typing')
  activeAssistantText = null
  setWaitingForPi(false)
  formNote.textContent = bridgeOnline
    ? 'The visual reading is interpretive, not a diagnosis.'
    : 'Pi disconnected. Your last message remains here.'
}

function handlePiMessage(message) {
  if (message.type === 'bridge_status') {
    updateBridgeStatus(message.status, message.message)
    return
  }
  if (message.type === 'assistant_delta') {
    if (!activeAssistantText) {
      activeAssistantText = appendChatMessage('assistant')
      activeAssistantText.closest('.chat-message').classList.add('is-typing')
    }
    const textNode = activeAssistantText.firstChild ?? activeAssistantText.appendChild(document.createTextNode(''))
    textNode.appendData(message.delta)
    activeAssistantText.closest('.chat-message').classList.remove('is-typing')
    chatLog.scrollTop = chatLog.scrollHeight
    return
  }
  if (message.type === 'assistant_done') {
    if (activeAssistantText && !activeAssistantText.textContent.trim()) {
      activeAssistantText.textContent = 'Pi returned no text. Please try again.'
      activeAssistantText.closest('.chat-message').classList.add('is-error')
    }
    finishAssistantResponse()
    return
  }
  if (message.type === 'assistant_error') {
    if (!activeAssistantText) activeAssistantText = appendChatMessage('assistant')
    activeAssistantText.textContent = message.message
    activeAssistantText.closest('.chat-message').classList.add('is-error')
    finishAssistantResponse()
  }
}

const piChat = createPiChatClient({
  onMessage: handlePiMessage,
  onStatus(status) {
    updateBridgeStatus(status)
  },
})

chatForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = chatInput.value.trim()
  if (!message || waitingForPi) {
    chatInput.focus()
    return
  }

  const reading = analyzeEmotionMessage(message)
  const visualContext = reading.matched
    ? {
        label: `${EMOTIONS[reading.dominant].label} blend`,
        primary: reading.visual.primary,
        accent: reading.visual.accent,
      }
    : currentVisualContext

  setWaitingForPi(true)
  const id = `message-${Date.now()}-${messageSequence}`
  messageSequence += 1
  try {
    piChat.send(message, id, visualContext)
  } catch (error) {
    formNote.textContent = error.message
    setWaitingForPi(false)
    chatInput.focus()
    return
  }

  appendChatMessage('user', message)
  chatInput.value = ''
  activeAssistantText = appendChatMessage('assistant')
  activeAssistantText.closest('.chat-message').classList.add('is-typing')

  if (reading.matched) {
    applyVisualState(reading.visual, reading.dominant, 'chat')
    stirField()
    formNote.textContent = `Pi is responding · the field is blending toward ${EMOTIONS[reading.dominant].label.toLowerCase()}.`
  } else {
    formNote.textContent = 'Pi is responding · no clear emotional signal, so the field is holding steady.'
  }
})

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    chatForm.requestSubmit()
  }
})

window.addEventListener('beforeunload', () => piChat.close())

window.addEventListener('resize', resize)
new ResizeObserver(resize).observe(sceneWrap)
setCssPalette(EMOTIONS.wonder)
resize()
requestAnimationFrame(animate)
