import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoleplayTurnValidator } from '../shared/roleplay-contract.js'

test('accepts a complete bounded follow-up turn', () => {
  const validate = createRoleplayTurnValidator()

  const result = validate({
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'You said the quiet after everyone left stayed with you. What felt hardest about it?',
    storyReference: 'the quiet after everyone left',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }, 'follow-up')

  assert.deepEqual(result, { ok: true, value: {
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'You said the quiet after everyone left stayed with you. What felt hardest about it?',
    storyReference: 'the quiet after everyone left',
    tentativeMeaning: null,
    safetyMode: 'normal',
  } })
})

test('rejects model fields outside the role-play contract', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'I noticed what you said. What part stayed with you?',
    storyReference: 'what stayed with you',
    tentativeMeaning: null,
    safetyMode: 'normal',
    html: '<script>alert(1)</script>',
  }, 'follow-up')

  assert.equal(result.ok, false)
  assert.ok(result.errors.some(({ message }) => /additional properties/i.test(message)))
})

test('rejects a response for a stage the application did not request', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'closure',
    speaker: 'alone',
    speechAct: 'acknowledge_and_close',
    text: 'Thank you for correcting me. We can leave this here.',
    storyReference: 'your correction',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }, 'mirror')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/stage',
    message: 'must equal expected stage mirror',
  }])
})

test('rejects a speech act that is illegal for the response stage', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'mirror',
    speaker: 'alone',
    speechAct: 'acknowledge_and_close',
    text: 'It may be that being overlooked mattered more than being alone. Is that close?',
    storyReference: 'being overlooked',
    tentativeMeaning: 'being overlooked mattered more than being alone',
    safetyMode: 'normal',
  }, 'mirror')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/speechAct',
    message: 'must equal tentative_mirror for stage mirror',
  }])
})

test('requires exactly one question in follow-up and mirror turns', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'You said the empty room stayed with you.',
    storyReference: 'the empty room',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }, 'follow-up')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/text',
    message: 'must contain exactly one question for stage follow-up',
  }])
})

test('requires a revisable tentative meaning only for the mirror stage', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'mirror',
    speaker: 'alone',
    speechAct: 'tentative_mirror',
    text: 'It may be that the missing goodbye mattered most. Is that close?',
    storyReference: 'the missing goodbye',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }, 'mirror')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/tentativeMeaning',
    message: 'must be a non-empty string for stage mirror',
  }])
})

test('requires null tentative meaning outside the mirror stage', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'You said the empty room stayed with you. What felt unfinished?',
    storyReference: 'the empty room',
    tentativeMeaning: 'the goodbye mattered most',
    safetyMode: 'normal',
  }, 'follow-up')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/tentativeMeaning',
    message: 'must be null outside stage mirror',
  }])
})

test('rejects questions in a normal closure turn', () => {
  const validate = createRoleplayTurnValidator()
  const result = validate({
    schemaVersion: 1,
    stage: 'closure',
    speaker: 'alone',
    speechAct: 'acknowledge_and_close',
    text: 'Thank you for correcting me. Shall we leave this here?',
    storyReference: 'your correction',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }, 'closure')

  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [{
    path: '/text',
    message: 'must contain no questions for stage closure',
  }])
})
