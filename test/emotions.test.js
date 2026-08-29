import test from 'node:test'
import assert from 'node:assert/strict'
import { EMOTIONS, resolveEmotion } from '../src/emotions.js'

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
