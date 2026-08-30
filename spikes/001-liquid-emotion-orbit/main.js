import * as THREE from 'three'

const params = new URLSearchParams(window.location.search)
const seedParam = params.get('seed')
const timeParam = params.get('time')
const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : 7
const fixedTime = timeParam !== null && Number.isFinite(Number(timeParam)) ? Number(timeParam) : 2.75
const frozen = params.get('freeze') === '1'
const baseline = params.get('baseline') === '1'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const motionScale = frozen || params.get('motion') === '0' ? 0 : reducedMotion ? 0.08 : 1
const quality = params.get('quality') === 'low' ? 'low' : params.get('quality') === 'high' ? 'high' : 'balanced'

const DEBUG_MODES = ['final', 'fold height', 'surface normals', 'specular field']
const debugParam = params.get('debug')
const initialDebug = Math.max(0, ['final', 'height', 'normals', 'specular'].indexOf(debugParam ?? 'final'))

const EMOTIONS = {
  joy: {
    primary: '#f0d26f',
    secondary: '#ff9147',
    anchor: '#9d3121',
    energy: 1.08,
    copy: 'Joy is warming the field.',
  },
  calm: {
    primary: '#9ac6b8',
    secondary: '#d8c891',
    anchor: '#324a42',
    energy: 0.42,
    copy: 'Calm is widening the field.',
  },
  love: {
    primary: '#d99b85',
    secondary: '#ffc26f',
    anchor: '#702a36',
    energy: 0.72,
    copy: 'Love is softening the field.',
  },
  wonder: {
    primary: '#9bc4a6',
    secondary: '#eaa42d',
    anchor: '#8f3020',
    energy: 0.82,
    copy: 'Wonder is holding the field.',
  },
  anger: {
    primary: '#e76535',
    secondary: '#ff9a32',
    anchor: '#460f0c',
    energy: 1.34,
    copy: 'Anger is tightening the field.',
  },
  melancholy: {
    primary: '#718b91',
    secondary: '#a8aaa0',
    anchor: '#263a40',
    energy: 0.34,
    copy: 'Melancholy is cooling the field.',
  },
}
const emotionNames = Object.keys(EMOTIONS)

const canvas = document.querySelector('#fluid-canvas')
const experience = document.querySelector('.experience')
experience.dataset.baseline = String(baseline)
const form = document.querySelector('#feeling-form')
const input = document.querySelector('#feeling-input')
const status = document.querySelector('#field-status')
const debugReadout = document.querySelector('#debug-readout')
const emotionButtons = [...document.querySelectorAll('[data-emotion]')]
const languageButtons = [...document.querySelectorAll('.languages button')]

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setClearColor(0x07100d, 1)

const scene = new THREE.Scene()
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const uniforms = {
  uTime: { value: fixedTime },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uCenter: { value: new THREE.Vector2(0.68, 0.68) },
  uPointer: { value: new THREE.Vector2(0, 0) },
  uSeed: { value: seed },
  uPaletteA: { value: new THREE.Color(EMOTIONS.wonder.primary) },
  uPaletteB: { value: new THREE.Color(EMOTIONS.wonder.secondary) },
  uPaletteC: { value: new THREE.Color(EMOTIONS.wonder.anchor) },
  uEnergy: { value: EMOTIONS.wonder.energy },
  uDebug: { value: initialDebug },
  uBaseline: { value: baseline ? 1 : 0 },
}

const material = new THREE.ShaderMaterial({
  uniforms,
  depthTest: false,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;

    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform vec2 uPointer;
    uniform float uSeed;
    uniform vec3 uPaletteA;
    uniform vec3 uPaletteB;
    uniform vec3 uPaletteC;
    uniform float uEnergy;
    uniform float uDebug;
    uniform float uBaseline;

    float hash21(vec2 p) {
      p += uSeed * vec2(0.071, 0.113);
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float valueNoise(vec2 p) {
      vec2 cell = floor(p);
      vec2 local = fract(p);
      vec2 ease = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), ease.x),
        mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), ease.x),
        ease.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.54;
      mat2 octaveRotation = mat2(0.82, -0.57, 0.57, 0.82);
      for (int octave = 0; octave < 4; octave++) {
        value += amplitude * valueNoise(p);
        p = octaveRotation * p * 2.03 + 11.7;
        amplitude *= 0.49;
      }
      return value;
    }

    vec2 advectedDomain(vec2 p, float time) {
      vec2 drift = vec2(time * 0.035, -time * 0.027);
      float warpX = fbm(p * 0.62 + drift);
      float warpY = fbm(mat2(0.68, -0.73, 0.73, 0.68) * p * 0.71 - drift * 0.86 + 7.3);
      return p + (vec2(warpX, warpY) - 0.5) * (1.05 + uEnergy * 0.18);
    }

    float foldHeight(vec2 p, float time) {
      vec2 warped = advectedDomain(p, time);
      float broadFold = sin(warped.x * 1.18 + warped.y * 0.38 + sin(warped.y * 0.58) * 1.34 + time * 0.075);
      float crossFold = sin(warped.y * 1.56 - warped.x * 0.31 + cos(warped.x * 0.42) * 1.06 - time * 0.061);
      float ribbon = sin((warped.x + warped.y) * 0.77 + fbm(warped * 0.31) * 4.1 + time * 0.044);
      float body = broadFold * 0.62 + crossFold * 0.34 + ribbon * 0.17;
      return body + (fbm(warped * 0.78 + 19.0) - 0.5) * 0.24;
    }

    vec3 foldNormal(float heightValue) {
      vec2 gradient = vec2(dFdx(heightValue), dFdy(heightValue)) * max(uResolution.y * 0.5, 1.0);
      return normalize(vec3(-gradient * 0.20, 1.0));
    }

    vec3 shadeLiquid(
      vec2 p,
      float time,
      out float heightValue,
      out vec3 normalValue,
      out float specularValue,
      out float specularFootprint
    ) {
      heightValue = foldHeight(p, time);
      normalValue = foldNormal(heightValue);

      vec3 lightDirection = normalize(vec3(-0.44, 0.58, 0.72));
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      vec3 halfDirection = normalize(lightDirection + viewDirection);
      float diffuse = smoothstep(-0.22, 0.52, dot(normalValue, lightDirection));
      float normalHalf = max(dot(normalValue, halfDirection), 0.0);
      specularFootprint = clamp(
        (length(dFdx(normalValue)) + length(dFdy(normalValue))) * 18.0,
        0.0,
        1.0
      );
      float broadSpecular = pow(normalHalf, mix(8.0, 4.0, specularFootprint));
      float sharpSpecular = pow(normalHalf, mix(24.0, 8.0, specularFootprint));
      float facing = clamp(normalValue.z, 0.0, 1.0);
      float fresnel = pow(1.0 - facing, 4.0);
      float foldBand = smoothstep(-0.68, 0.72, heightValue + normalValue.x * 0.22);
      float valley = 1.0 - smoothstep(-0.78, -0.08, heightValue);

      vec3 greenIdentity = mix(uPaletteC * 0.12, uPaletteA * 0.56, 0.78);
      vec3 amberIdentity = mix(uPaletteC * 0.18, uPaletteB * 0.62, 0.84);
      vec3 albedo = mix(greenIdentity, amberIdentity, foldBand);
      albedo *= mix(1.0, 0.18, valley);

      vec3 specularColor = mix(uPaletteA, uPaletteB, smoothstep(-0.2, 0.74, heightValue));
      specularValue =
        (broadSpecular * 0.42 + sharpSpecular * 0.54) *
        mix(1.0, 0.18, specularFootprint) +
        fresnel * 0.20;
      vec3 color = albedo * (0.24 + diffuse * 0.72);
      color += specularColor * specularValue;
      color += mix(uPaletteA, uPaletteB, foldBand) * fresnel * 0.08;
      return color;
    }

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      float time = uTime;
      vec2 screen = (vUv - 0.5) * vec2(aspect, 1.0) * 2.0;
      screen -= uPointer * vec2(0.08, 0.055);

      float heightValue;
      vec3 normalValue;
      float specularValue;
      float specularFootprint;
      vec3 color = shadeLiquid(
        screen * 1.08,
        time,
        heightValue,
        normalValue,
        specularValue,
        specularFootprint
      );

      vec2 blobCenter = uCenter + uPointer * vec2(0.035, 0.025);
      vec2 blob = vUv - blobCenter;
      blob.x *= aspect * mix(1.45, 1.0, smoothstep(1.0, 1.35, aspect));
      float radialNoise = (fbm(blob * 0.76 + time * 0.012) - 0.5) * 0.030;
      float blobRadial = length(blob) / 0.585 + radialNoise;
      float blobMask = 1.0 - smoothstep(0.90, 1.08, blobRadial);
      float blobRim = exp(-pow((blobRadial - 0.96) / 0.07, 2.0));

      if (blobRadial < 1.16) {
        float sphereZ = sqrt(max(0.0, 1.0 - min(blobRadial * blobRadial, 1.0)));
        vec3 sphereNormal = normalize(vec3(blob / 0.585, sphereZ));
        vec2 refractedCoordinate = screen * 1.08 + sphereNormal.xy * (0.16 + sphereZ * 0.08);
        float refractedHeight = foldHeight(refractedCoordinate, time + 0.36);
        float refractedBand = smoothstep(-0.68, 0.72, refractedHeight + normalValue.x * 0.18);
        vec3 refractedColor = mix(uPaletteA * 0.48, uPaletteB * 0.58, refractedBand);
        refractedColor *= 0.48 + max(refractedHeight * 0.28 + 0.38, 0.0);
        refractedColor = mix(refractedColor, color * 1.35, 0.42);

        vec3 glassNormal = normalize(vec3(
          normalValue.xy * 0.42 + sphereNormal.xy * 0.72,
          max(normalValue.z * sphereNormal.z, 0.08)
        ));
        vec3 lightDirection = normalize(vec3(-0.44, 0.58, 0.72));
        vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
        float glassHalf = max(dot(glassNormal, halfDirection), 0.0);
        float glassSpecular =
          pow(glassHalf, mix(22.0, 8.0, specularFootprint)) *
          mix(1.0, 0.24, specularFootprint);
        float glassFresnel = pow(1.0 - clamp(glassNormal.z, 0.0, 1.0), 4.0);
        float thickness = sphereZ * 1.35;
        vec3 absorption = exp(-vec3(0.64, 0.25, 0.42) * thickness);
        vec3 glassColor = refractedColor * absorption * (0.88 + sphereZ * 0.30);
        glassColor = mix(glassColor, uPaletteC * 0.10, 0.08 + thickness * 0.05);
        glassColor += mix(uPaletteA, uPaletteB, 0.62) * glassSpecular * 0.74;
        glassColor += uPaletteA * glassFresnel * 0.22;
        color = mix(color, glassColor, blobMask);
        color += mix(uPaletteA, uPaletteB, smoothstep(-0.2, 0.8, blob.y)) * blobRim * 0.10;
      }

      if (uBaseline < 0.5) {
        float vignette = 1.0 - smoothstep(0.24, 1.12, length((vUv - 0.5) * vec2(0.84, 1.0)));
        color *= mix(0.58, 1.0, vignette);
        float grain = (hash21(gl_FragCoord.xy + vec2(37.0, -19.0)) - 0.5) * 0.018;
        color += grain;
      }

      if (uDebug > 0.5 && uDebug < 1.5) {
        color = vec3(clamp(heightValue * 0.34 + 0.5, 0.0, 1.0));
      } else if (uDebug >= 1.5 && uDebug < 2.5) {
        color = normalValue * 0.5 + 0.5;
      } else if (uDebug >= 2.5) {
        color = vec3(specularValue);
      }

      color = pow(max(color, 0.0), vec3(0.92));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

const targetPalette = {
  a: new THREE.Color(EMOTIONS.wonder.primary),
  b: new THREE.Color(EMOTIONS.wonder.secondary),
  c: new THREE.Color(EMOTIONS.wonder.anchor),
  energy: EMOTIONS.wonder.energy,
}
const pointerTarget = new THREE.Vector2()
let currentEmotion = 'wonder'
let dragging = false
let debugMode = initialDebug
let lastFrame = performance.now()
let animationTime = fixedTime
const frameDurations = []

function setEmotion(name, announcedCopy = EMOTIONS[name].copy) {
  const emotion = EMOTIONS[name]
  if (!emotion) return
  currentEmotion = name
  targetPalette.a.set(emotion.primary)
  targetPalette.b.set(emotion.secondary)
  targetPalette.c.set(emotion.anchor)
  targetPalette.energy = emotion.energy
  experience.dataset.emotion = name
  emotionButtons.forEach((button) => {
    if (button.dataset.emotion === name) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  })
  status.textContent = announcedCopy
}

function inferEmotion(message) {
  const text = message.toLowerCase()
  const rules = [
    ['anger', /angry|anger|furious|rage|resent|frustrat/],
    ['melancholy', /sad|melanchol|grief|lonely|empty|tired|blue/],
    ['love', /love|tender|close|affection|heart|care/],
    ['calm', /calm|quiet|peace|still|settled|gentle/],
    ['joy', /joy|happy|delight|bright|excited|alive/],
    ['wonder', /wonder|curious|awe|strange|unknown|possib/],
  ]
  const match = rules.find(([, pattern]) => pattern.test(text))
  if (match) return match[0]
  const hash = [...text].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, seed >>> 0)
  return emotionNames[hash % emotionNames.length]
}

const resizeState = {
  events: 0,
  commits: 0,
  settledCommits: 0,
  width: 0,
  height: 0,
  pixelRatio: 1,
  aspect: 1,
  pending: false,
}
let activePixelRatio = 1
let resizeFrame = 0
let resizeSettleTimer = 0

function resolvePixelRatio(width, height) {
  if (quality === 'low') return Math.min(window.devicePixelRatio || 1, 1)
  if (quality === 'high') return Math.min(window.devicePixelRatio || 1, 2)
  const aspect = width / Math.max(height, 1)
  const landscapeBlend = THREE.MathUtils.smoothstep(aspect, 0.55, 1.25)
  const balancedCap = THREE.MathUtils.lerp(1.25, 1.6, landscapeBlend)
  return Math.min(window.devicePixelRatio || 1, balancedCap)
}

function applyResize(settled = false) {
  resizeFrame = 0
  const width = Math.max(Math.round(window.innerWidth), 1)
  const height = Math.max(Math.round(window.innerHeight), 1)
  const aspect = width / height
  const nextPixelRatio = settled || resizeState.commits === 0
    ? resolvePixelRatio(width, height)
    : activePixelRatio
  const sizeChanged = width !== resizeState.width || height !== resizeState.height
  const pixelRatioChanged = Math.abs(nextPixelRatio - activePixelRatio) > 0.001

  if (pixelRatioChanged) {
    activePixelRatio = nextPixelRatio
    renderer.setPixelRatio(activePixelRatio)
  }
  if (sizeChanged || pixelRatioChanged || resizeState.commits === 0) {
    renderer.setSize(width, height, false)
    renderer.getDrawingBufferSize(uniforms.uResolution.value)
    const landscapeBlend = THREE.MathUtils.smoothstep(aspect, 0.55, 1)
    uniforms.uCenter.value.set(
      THREE.MathUtils.lerp(0.67, 0.68, landscapeBlend),
      THREE.MathUtils.lerp(0.71, 0.68, landscapeBlend),
    )
    resizeState.commits += 1
    renderer.render(scene, camera)
  }

  resizeState.width = width
  resizeState.height = height
  resizeState.pixelRatio = activePixelRatio
  resizeState.aspect = aspect
  if (settled) {
    resizeState.settledCommits += 1
    resizeState.pending = false
  }
}

function scheduleResize() {
  resizeState.events += 1
  resizeState.pending = true
  if (!resizeFrame) resizeFrame = requestAnimationFrame(() => applyResize(false))
  window.clearTimeout(resizeSettleTimer)
  resizeSettleTimer = window.setTimeout(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => applyResize(true))
  }, 150)
}

function updateDebugReadout() {
  if (debugMode === 0) {
    debugReadout.hidden = true
    return
  }
  debugReadout.hidden = false
  debugReadout.textContent = `${DEBUG_MODES[debugMode]} · seed ${seed}`
}

function setDebug(mode) {
  debugMode = ((mode % DEBUG_MODES.length) + DEBUG_MODES.length) % DEBUG_MODES.length
  uniforms.uDebug.value = debugMode
  experience.dataset.debug = String(debugMode !== 0)
  updateDebugReadout()
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = input.value.trim()
  if (!message) {
    status.textContent = 'Give the field one honest word.'
    input.focus()
    return
  }
  const inferred = inferEmotion(message)
  setEmotion(inferred, `${EMOTIONS[inferred].copy} Your words remain private in this study.`)
  input.value = ''
})

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    form.requestSubmit()
  }
})

emotionButtons.forEach((button) => {
  button.addEventListener('click', () => setEmotion(button.dataset.emotion))
})

languageButtons.forEach((button) => {
  button.addEventListener('click', () => {
    languageButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    status.textContent = `${button.textContent.trim()} selected for this visual study.`
  })
})

function updatePointer(event) {
  pointerTarget.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2)
}

canvas.addEventListener('pointerdown', (event) => {
  dragging = true
  canvas.setPointerCapture(event.pointerId)
  updatePointer(event)
})
canvas.addEventListener('pointermove', (event) => {
  if (dragging) updatePointer(event)
})
canvas.addEventListener('pointerup', (event) => {
  dragging = false
  canvas.releasePointerCapture(event.pointerId)
})
canvas.addEventListener('pointercancel', () => {
  dragging = false
})

window.addEventListener('keydown', (event) => {
  if (event.target === input) return
  if (event.key.toLowerCase() === 'd') setDebug(debugMode + 1)
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const currentIndex = emotionNames.indexOf(currentEmotion)
    setEmotion(emotionNames[(currentIndex + direction + emotionNames.length) % emotionNames.length])
  }
})

window.addEventListener('resize', scheduleResize, { passive: true })
window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true })
applyResize(true)
setDebug(initialDebug)

function frame(now) {
  const rawDeltaMs = Math.max(now - lastFrame, 0)
  const deltaMs = Math.min(rawDeltaMs, 100)
  const simulationDeltaMs = Math.min(rawDeltaMs, 1000 / 30)
  lastFrame = now
  if (frameDurations.length >= 120) frameDurations.shift()
  frameDurations.push(rawDeltaMs)

  const blend = 1 - Math.exp(-deltaMs * 0.0032)
  uniforms.uPaletteA.value.lerp(targetPalette.a, blend)
  uniforms.uPaletteB.value.lerp(targetPalette.b, blend)
  uniforms.uPaletteC.value.lerp(targetPalette.c, blend)
  uniforms.uEnergy.value += (targetPalette.energy - uniforms.uEnergy.value) * blend
  uniforms.uPointer.value.lerp(pointerTarget, 1 - Math.exp(-deltaMs * 0.004))
  if (!frozen) {
    animationTime += simulationDeltaMs * 0.001 * motionScale * (0.78 + uniforms.uEnergy.value * 0.22)
  }
  uniforms.uTime.value = animationTime

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

async function sampleTemporalStability({ samples = 12, framesBetween = 1 } = {}) {
  const gl = renderer.getContext()
  const points = [
    [0.16, 0.22],
    [0.34, 0.29],
    [0.52, 0.19],
    [0.71, 0.33],
    [0.84, 0.58],
    [0.62, 0.72],
    [0.29, 0.66],
    [0.46, 0.48],
    [0.77, 0.81],
  ]
  const pixel = new Uint8Array(4)
  const colors = []
  const shaderTimes = []

  for (let sample = 0; sample < samples; sample += 1) {
    for (let frameIndex = 0; frameIndex < framesBetween; frameIndex += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    const frameColors = []
    for (const [x, y] of points) {
      gl.readPixels(
        Math.min(Math.floor(x * renderer.domElement.width), renderer.domElement.width - 1),
        Math.min(Math.floor(y * renderer.domElement.height), renderer.domElement.height - 1),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      )
      frameColors.push(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
    }
    colors.push(frameColors)
    shaderTimes.push(uniforms.uTime.value)
  }

  const steps = []
  const accelerations = []
  for (let sample = 1; sample < colors.length; sample += 1) {
    let step = 0
    for (let channel = 0; channel < colors[sample].length; channel += 1) {
      step += Math.abs(colors[sample][channel] - colors[sample - 1][channel])
    }
    steps.push(step / colors[sample].length)
  }
  for (let sample = 2; sample < colors.length; sample += 1) {
    let acceleration = 0
    for (let channel = 0; channel < colors[sample].length; channel += 1) {
      acceleration += Math.abs(
        colors[sample][channel] -
        2 * colors[sample - 1][channel] +
        colors[sample - 2][channel],
      )
    }
    accelerations.push(acceleration / colors[sample].length)
  }

  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
  const meanStep = mean(steps)
  const meanAcceleration = mean(accelerations)
  return {
    samples,
    points: points.length,
    framesBetween,
    shaderTimeStart: Number(shaderTimes[0].toFixed(4)),
    shaderTimeEnd: Number(shaderTimes.at(-1).toFixed(4)),
    shaderTimeMonotonic: shaderTimes.every((time, index) => index === 0 || time >= shaderTimes[index - 1]),
    meanColorStep: Number(meanStep.toFixed(6)),
    peakColorStep: Number(Math.max(...steps, 0).toFixed(6)),
    meanColorAcceleration: Number(meanAcceleration.toFixed(6)),
    accelerationToStepRatio: Number((meanAcceleration / Math.max(meanStep, 1e-6)).toFixed(3)),
    grainMode: 'static-spatial',
    simulationStepCapMs: Number((1000 / 30).toFixed(3)),
  }
}

window.__spike = {
  setEmotion,
  setDebug,
  sampleTemporalStability,
  getResizeState: () => ({ ...resizeState }),
  getState: () => ({
    emotion: currentEmotion,
    debug: DEBUG_MODES[debugMode],
    seed,
    frozen,
    baseline,
    quality,
    shaderTime: Number(uniforms.uTime.value.toFixed(4)),
    grainMode: 'static-spatial',
  }),
  getMetrics: () => {
    const sorted = [...frameDurations].sort((a, b) => a - b)
    const averageFrameMs = frameDurations.length
      ? frameDurations.reduce((sum, value) => sum + value, 0) / frameDurations.length
      : 0
    return {
      seed,
      frozen,
      baseline,
      quality,
      samples: frameDurations.length,
      averageFrameMs: Number(averageFrameMs.toFixed(2)),
      p95FrameMs: Number((sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0).toFixed(2)),
      render: { ...renderer.info.render },
      memory: { ...renderer.info.memory },
      renderTargets: 0,
      simulationStepCapMs: Number((1000 / 30).toFixed(3)),
      grainMode: 'static-spatial',
      gpuTiming: 'not instrumented in this disposable WebGL spike',
    }
  },
}
