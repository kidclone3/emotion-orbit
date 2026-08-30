export const EMOTIONS = {
  joy: {
    label: 'Joy',
    number: '01',
    primary: '#ffd166',
    accent: '#ff6b8a',
    background: '#170b26',
    glow: '#ff9f43',
    energy: 1.18,
    foldDepth: 1.15,
    flowSpeed: 0.42,
    lensStrength: 1.12,
    lensShape: -0.08,
    buoyancy: 0.82,
    expansion: 1.16,
    pulseRate: 0.92,
    smoothness: 0.48,
    attraction: 0.16,
    orbit: 0.28,
    depth: 0.62,
    pressure: 0.18,
    sharpness: 0.34,
    downwardDrift: 0.02,
    trail: 0.22,
    satellites: 0.96,
    pairing: 0.12,
    aperture: 0.18,
    shear: 0.18,
    weight: 0.04,
    stability: 0.28,
    copy: 'Bright, buoyant, and impossible to hold still.',
  },
  calm: {
    label: 'Calm',
    number: '02',
    primary: '#69e6d1',
    accent: '#5b8cff',
    background: '#041820',
    glow: '#41d6c3',
    energy: 0.42,
    foldDepth: 0.28,
    flowSpeed: 0.12,
    lensStrength: 0.82,
    lensShape: 0.02,
    buoyancy: 0.12,
    expansion: 1.08,
    pulseRate: 0.12,
    smoothness: 0.96,
    attraction: 0.18,
    orbit: 0.12,
    depth: 0.38,
    pressure: 0.08,
    sharpness: 0.08,
    downwardDrift: 0.08,
    trail: 0.58,
    satellites: 0.04,
    pairing: 0.1,
    aperture: 0.08,
    shear: 0.03,
    weight: 0.12,
    stability: 0.98,
    copy: 'A slow tide with room between every thought.',
  },
  love: {
    label: 'Love',
    number: '03',
    primary: '#ff6b9d',
    accent: '#ffc2d8',
    background: '#220918',
    glow: '#ff4f87',
    energy: 0.82,
    foldDepth: 0.55,
    flowSpeed: 0.24,
    lensStrength: 1,
    lensShape: -0.04,
    buoyancy: 0.24,
    expansion: 1.04,
    pulseRate: 0.48,
    smoothness: 0.74,
    attraction: 0.92,
    orbit: 0.26,
    depth: 0.68,
    pressure: 0.22,
    sharpness: 0.2,
    downwardDrift: 0.04,
    trail: 0.42,
    satellites: 0.12,
    pairing: 0.98,
    aperture: 0.16,
    shear: 0.08,
    weight: 0.06,
    stability: 0.64,
    copy: 'Warm gravity drawing everything a little closer.',
  },
  wonder: {
    label: 'Wonder',
    number: '04',
    primary: '#9d7cff',
    accent: '#4ce4ef',
    background: '#0b0a25',
    glow: '#7367ff',
    energy: 0.72,
    foldDepth: 0.88,
    flowSpeed: 0.3,
    lensStrength: 0.94,
    lensShape: 0.18,
    buoyancy: 0.34,
    expansion: 1.1,
    pulseRate: 0.36,
    smoothness: 0.56,
    attraction: 0.22,
    orbit: 0.94,
    depth: 0.96,
    pressure: 0.16,
    sharpness: 0.3,
    downwardDrift: 0.02,
    trail: 0.52,
    satellites: 0.2,
    pairing: 0.14,
    aperture: 0.98,
    shear: 0.12,
    weight: 0.04,
    stability: 0.42,
    copy: 'The electric pause before the unknown opens.',
  },
  anger: {
    label: 'Anger',
    number: '05',
    primary: '#ff3f2f',
    accent: '#ff9b32',
    background: '#230706',
    glow: '#ff2a1a',
    energy: 1.45,
    foldDepth: 1.72,
    flowSpeed: 0.64,
    lensStrength: 1.24,
    lensShape: -0.22,
    buoyancy: -0.18,
    expansion: 0.86,
    pulseRate: 0.68,
    smoothness: 0.14,
    attraction: -0.28,
    orbit: 0.16,
    depth: 0.46,
    pressure: 0.96,
    sharpness: 0.92,
    downwardDrift: 0.12,
    trail: 0.18,
    satellites: 0.08,
    pairing: 0.02,
    aperture: 0.06,
    shear: 0.98,
    weight: 0.18,
    stability: 0.08,
    copy: 'Heat, velocity, and a boundary asking to be heard.',
  },
  melancholy: {
    label: 'Melancholy',
    number: '06',
    primary: '#6688c4',
    accent: '#a89fc5',
    background: '#080f20',
    glow: '#526fa8',
    energy: 0.3,
    foldDepth: 0.42,
    flowSpeed: 0.08,
    lensStrength: 0.74,
    lensShape: 0.1,
    buoyancy: -0.64,
    expansion: 0.94,
    pulseRate: 0.06,
    smoothness: 0.82,
    attraction: 0.04,
    orbit: 0.08,
    depth: 0.58,
    pressure: 0.12,
    sharpness: 0.1,
    downwardDrift: 0.92,
    trail: 0.96,
    satellites: 0.02,
    pairing: 0.08,
    aperture: 0.12,
    shear: 0.06,
    weight: 0.98,
    stability: 0.5,
    copy: 'Blue weight drifting softly through remembered light.',
  },
}

export const EMOTION_ORDER = Object.keys(EMOTIONS)

const ALIASES = {
  happy: 'joy',
  joyful: 'joy',
  excited: 'joy',
  delighted: 'joy',
  peaceful: 'calm',
  relaxed: 'calm',
  serene: 'calm',
  safe: 'calm',
  affectionate: 'love',
  romantic: 'love',
  caring: 'love',
  curious: 'wonder',
  amazed: 'wonder',
  awe: 'wonder',
  magical: 'wonder',
  angry: 'anger',
  furious: 'anger',
  frustrated: 'anger',
  irritated: 'anger',
  sad: 'melancholy',
  blue: 'melancholy',
  lonely: 'melancholy',
  nostalgic: 'melancholy',
}

export function resolveEmotion(input) {
  const normalized = input.trim().toLowerCase().replace(/[^a-z\s-]/g, '')
  if (!normalized) return null
  if (EMOTIONS[normalized]) return normalized

  const words = normalized.split(/[\s-]+/)
  for (const word of words) {
    if (EMOTIONS[word]) return word
    if (ALIASES[word]) return ALIASES[word]
  }

  return null
}

const FEELING_WEIGHTS = {
  anxious: { wonder: 0.6, anger: 0.25, melancholy: 0.15 },
  anxiety: { wonder: 0.6, anger: 0.25, melancholy: 0.15 },
  afraid: { melancholy: 0.5, wonder: 0.3, anger: 0.2 },
  scared: { melancholy: 0.5, wonder: 0.3, anger: 0.2 },
  nervous: { wonder: 0.55, melancholy: 0.3, anger: 0.15 },
  overwhelmed: { melancholy: 0.45, anger: 0.35, wonder: 0.2 },
  guarded: { anger: 0.45, melancholy: 0.35, wonder: 0.2 },
  unsure: { wonder: 0.7, melancholy: 0.3 },
  uncertain: { wonder: 0.7, melancholy: 0.3 },
  confused: { wonder: 0.65, melancholy: 0.35 },
  hopeful: { joy: 0.75, wonder: 0.25 },
  grateful: { joy: 0.65, love: 0.35 },
  proud: { joy: 0.8, love: 0.2 },
  connected: { love: 0.8, calm: 0.2 },
  tender: { love: 0.75, calm: 0.25 },
  okay: { calm: 1 },
  grounded: { calm: 1 },
  disappointed: { melancholy: 1 },
  disappointment: { melancholy: 1 },
  fail: { melancholy: 1 },
  failed: { melancholy: 1 },
  failing: { melancholy: 1 },
  failure: { melancholy: 1 },
  tired: { melancholy: 0.75, calm: 0.25 },
  empty: { melancholy: 1 },
  grief: { melancholy: 1 },
  grieving: { melancholy: 1 },
  depressed: { melancholy: 1 },
  useless: { melancholy: 1 },
  resentful: { anger: 0.8, melancholy: 0.2 },
  annoyed: { anger: 1 },
  mad: { anger: 1 },
}

function addWeight(scores, weights) {
  for (const [emotion, weight] of Object.entries(weights)) {
    scores[emotion] += weight
  }
}

function blendHex(scores, total, property) {
  const channels = [0, 0, 0]

  for (const emotion of EMOTION_ORDER) {
    if (scores[emotion] === 0) continue
    const value = Number.parseInt(EMOTIONS[emotion][property].slice(1), 16)
    channels[0] += ((value >> 16) & 255) * scores[emotion]
    channels[1] += ((value >> 8) & 255) * scores[emotion]
    channels[2] += (value & 255) * scores[emotion]
  }

  return `#${channels
    .map((channel) => Math.round(channel / total).toString(16).padStart(2, '0'))
    .join('')}`
}

function blendNumber(scores, total, property) {
  return EMOTION_ORDER.reduce(
    (sum, emotion) => sum + EMOTIONS[emotion][property] * scores[emotion],
    0,
  ) / total
}

function hashMessage(input) {
  let hash = 2166136261
  for (const character of input.trim().toLowerCase()) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function addFallbackWeights(scores, input) {
  const hash = hashMessage(input)
  const primaryIndex = hash % EMOTION_ORDER.length
  const secondaryIndex =
    (primaryIndex + 1 + ((hash >>> 8) % (EMOTION_ORDER.length - 1))) % EMOTION_ORDER.length
  scores[EMOTION_ORDER[primaryIndex]] = 0.72
  scores[EMOTION_ORDER[secondaryIndex]] = 0.28
}

function shiftHex(hex, seed) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const channel = seed % channels.length
  const delta = 24 + ((seed >>> 8) % 40)
  channels[channel] += channels[channel] <= 255 - delta ? delta : -delta
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function ensurePaletteChanges(visual, currentVisual, input) {
  if (
    !currentVisual ||
    visual.primary.toLowerCase() !== currentVisual.primary?.toLowerCase() ||
    visual.accent.toLowerCase() !== currentVisual.accent?.toLowerCase()
  ) {
    return visual
  }

  const hash = hashMessage(input)
  return {
    ...visual,
    primary: shiftHex(visual.primary, hash),
    accent: shiftHex(visual.accent, hash >>> 5),
  }
}


export function analyzeEmotionMessage(input, currentVisual = null) {
  const words = input.toLowerCase().match(/[a-z]+/g) ?? []
  const scores = Object.fromEntries(EMOTION_ORDER.map((emotion) => [emotion, 0]))

  for (const word of words) {
    if (EMOTIONS[word]) {
      scores[word] += 1
    } else if (ALIASES[word]) {
      scores[ALIASES[word]] += 1
    } else if (FEELING_WEIGHTS[word]) {
      addWeight(scores, FEELING_WEIGHTS[word])
    }
  }

  let total = Object.values(scores).reduce((sum, score) => sum + score, 0)
  const matched = total > 0
  if (!matched) {
    if (!input.trim()) return { matched: false, dominant: null, visual: null }
    addFallbackWeights(scores, input)
    total = 1
  }

  const dominant = EMOTION_ORDER.reduce((strongest, emotion) =>
    scores[emotion] > scores[strongest] ? emotion : strongest,
  )
  const visual = {
    primary: blendHex(scores, total, 'primary'),
    accent: blendHex(scores, total, 'accent'),
    background: blendHex(scores, total, 'background'),
    glow: blendHex(scores, total, 'glow'),
    energy: blendNumber(scores, total, 'energy'),
    foldDepth: blendNumber(scores, total, 'foldDepth'),
    flowSpeed: blendNumber(scores, total, 'flowSpeed'),
    lensStrength: blendNumber(scores, total, 'lensStrength'),
    lensShape: blendNumber(scores, total, 'lensShape'),
    buoyancy: blendNumber(scores, total, 'buoyancy'),
    expansion: blendNumber(scores, total, 'expansion'),
    pulseRate: blendNumber(scores, total, 'pulseRate'),
    smoothness: blendNumber(scores, total, 'smoothness'),
    attraction: blendNumber(scores, total, 'attraction'),
    orbit: blendNumber(scores, total, 'orbit'),
    depth: blendNumber(scores, total, 'depth'),
    pressure: blendNumber(scores, total, 'pressure'),
    sharpness: blendNumber(scores, total, 'sharpness'),
    downwardDrift: blendNumber(scores, total, 'downwardDrift'),
    trail: blendNumber(scores, total, 'trail'),
    satellites: blendNumber(scores, total, 'satellites'),
    pairing: blendNumber(scores, total, 'pairing'),
    aperture: blendNumber(scores, total, 'aperture'),
    shear: blendNumber(scores, total, 'shear'),
    weight: blendNumber(scores, total, 'weight'),
    stability: blendNumber(scores, total, 'stability'),
  }

  return {
    matched,
    dominant,
    visual: ensurePaletteChanges(visual, currentVisual, input),
  }
}
