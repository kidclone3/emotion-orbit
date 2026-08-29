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
    assert.ok(emotion.turbulence >= 0, `${name} turbulence`)
    assert.ok(emotion.copy.length > 20, `${name} copy`)
  }
})

test('blends multiple feelings into a bounded visual mutation', () => {
  const result = analyzeEmotionMessage('I feel anxious, guarded, and unsure what comes next')

  assert.equal(result.matched, true)
  assert.equal(result.dominant, 'wonder')
  assert.ok(result.visual.energy >= 0.3 && result.visual.energy <= 1.45)
  assert.ok(result.visual.turbulence >= 0.28 && result.visual.turbulence <= 1.72)
  assert.ok(result.visual.shape >= -1 && result.visual.shape <= 1)
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

test('keeps unsupported messages available for chat without inventing an emotion', () => {
  const result = analyzeEmotionMessage('Can you ask me a question?')

  assert.deepEqual(result, { matched: false, dominant: null, visual: null })
})

test('maps disappointment after a failed test to melancholy', () => {
  const result = analyzeEmotionMessage('I feel very disappointed because I failed a test')

  assert.equal(result.matched, true)
  assert.equal(result.dominant, 'melancholy')
  assert.equal(result.visual.primary, EMOTIONS.melancholy.primary)
})
