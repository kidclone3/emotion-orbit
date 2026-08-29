export const EMOTIONS = {
  joy: {
    label: 'Joy',
    number: '01',
    primary: '#ffd166',
    accent: '#ff6b8a',
    background: '#170b26',
    glow: '#ff9f43',
    energy: 1.18,
    turbulence: 1.15,
    orbitSpeed: 0.42,
    particleSize: 3.4,
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
    turbulence: 0.28,
    orbitSpeed: 0.12,
    particleSize: 2.2,
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
    turbulence: 0.55,
    orbitSpeed: 0.24,
    particleSize: 3,
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
    turbulence: 0.88,
    orbitSpeed: 0.3,
    particleSize: 2.7,
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
    turbulence: 1.72,
    orbitSpeed: 0.64,
    particleSize: 3.8,
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
    turbulence: 0.42,
    orbitSpeed: 0.08,
    particleSize: 1.9,
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
