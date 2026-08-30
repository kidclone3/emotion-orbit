import test from 'node:test'
import assert from 'node:assert/strict'
import { EMOTIONS, analyzeEmotionMessage, resolveEmotion } from '../src/emotions.js'

test('resolves canonical emotion names case-insensitively', () => {
  assert.equal(resolveEmotion('  WONDER '), 'wonder')
  assert.equal(resolveEmotion('Joy!'), 'joy')
})

test('maps common mood language to a supported visual state', () => {
  assert.equal(resolveEmotion('I feel peaceful today'), 'calm')
  assert.equal(resolveEmotion('very frustrated'), 'anger')
  assert.equal(resolveEmotion('nostalgic and quiet'), 'melancholy')
})

test('returns null for empty or unsupported moods', () => {
  assert.equal(resolveEmotion(''), null)
  assert.equal(resolveEmotion('conflicted'), null)
})

test('all emotion definitions expose complete visual parameters', () => {
  for (const [name, emotion] of Object.entries(EMOTIONS)) {
    assert.match(emotion.primary, /^#[0-9a-f]{6}$/i, `${name} primary`)
    assert.match(emotion.accent, /^#[0-9a-f]{6}$/i, `${name} accent`)
    assert.ok(emotion.energy > 0, `${name} energy`)
    assert.ok(emotion.foldDepth >= 0, `${name} fold depth`)
    assert.ok(emotion.flowSpeed > 0, `${name} flow speed`)
    assert.ok(emotion.lensStrength > 0, `${name} lens strength`)
    assert.ok(emotion.lensShape >= -1 && emotion.lensShape <= 1, `${name} lens shape`)
    assert.ok(emotion.copy.length > 20, `${name} copy`)
  }
})

test('blends multiple feelings into a bounded visual mutation', () => {
  const result = analyzeEmotionMessage('I feel anxious, guarded, and unsure what comes next')

  assert.equal(result.matched, true)
  assert.equal(result.dominant, 'wonder')
  assert.ok(result.visual.energy >= 0.3 && result.visual.energy <= 1.45)
  assert.ok(result.visual.foldDepth >= 0.28 && result.visual.foldDepth <= 1.72)
  assert.ok(result.visual.flowSpeed >= 0.08 && result.visual.flowSpeed <= 0.64)
  assert.ok(result.visual.lensStrength >= 0.74 && result.visual.lensStrength <= 1.24)
  assert.ok(result.visual.lensShape >= -1 && result.visual.lensShape <= 1)
  assert.match(result.visual.primary, /^#[0-9a-f]{6}$/i)
  assert.match(result.visual.accent, /^#[0-9a-f]{6}$/i)
})

test('lets mixed emotional language produce a distinct continuous state', () => {
  const joyful = analyzeEmotionMessage('I feel joyful and hopeful')
  const bittersweet = analyzeEmotionMessage('I feel joyful, but also nostalgic and lonely')

  assert.equal(bittersweet.matched, true)
  assert.equal(bittersweet.dominant, 'melancholy')
  assert.notEqual(bittersweet.visual.primary, joyful.visual.primary)
  assert.ok(bittersweet.visual.energy < joyful.visual.energy)
})

test('creates a deterministic color mutation for unsupported chat messages', () => {
  const currentVisual = {
    primary: EMOTIONS.wonder.primary,
    accent: EMOTIONS.wonder.accent,
  }
  const first = analyzeEmotionMessage('Can you ask me a question?', currentVisual)
  const second = analyzeEmotionMessage('Can you ask me a question?', currentVisual)

  assert.equal(first.matched, false)
  assert.ok(first.dominant)
  assert.match(first.visual.primary, /^#[0-9a-f]{6}$/i)
  assert.match(first.visual.accent, /^#[0-9a-f]{6}$/i)
  assert.notDeepEqual(
    [first.visual.primary, first.visual.accent],
    [currentVisual.primary, currentVisual.accent],
  )
  assert.deepEqual(first, second)
})

test('maps disappointment after a failed test to melancholy', () => {
  const result = analyzeEmotionMessage('I feel very disappointed because I failed a test')

  assert.equal(result.matched, true)
  assert.equal(result.dominant, 'melancholy')
  assert.equal(result.visual.primary, EMOTIONS.melancholy.primary)
})

test('changes the palette for the reported uselessness message', () => {
  const currentVisual = {
    primary: EMOTIONS.melancholy.primary,
    accent: EMOTIONS.melancholy.accent,
  }
  const result = analyzeEmotionMessage(
    'i feel useless and want the others can sharing they need to me?',
    currentVisual,
  )

  assert.equal(result.matched, true)
  assert.equal(result.dominant, 'melancholy')
  assert.notDeepEqual(
    [result.visual.primary, result.visual.accent],
    [currentVisual.primary, currentVisual.accent],
  )
})
