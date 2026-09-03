import assert from 'node:assert/strict'
import test from 'node:test'

import { createStoryEncounter } from '../src/story-encounter.js'

test('prepares the first story for a code-owned follow-up stage', () => {
  const encounter = createStoryEncounter()

  const request = encounter.prepare('Everyone left before I could say goodbye.', 'turn-1')

  assert.deepEqual(request, {
    id: 'turn-1',
    message: 'Everyone left before I could say goodbye.',
    currentStage: 'story',
    expectedStage: 'follow-up',
    inputKind: 'story',
    history: [],
  })
  assert.deepEqual(encounter.getState(), {
    stage: 'story',
    closed: false,
    history: [],
  })
})

test('commits a validated turn and advances exactly one stage', () => {
  const encounter = createStoryEncounter()
  const request = encounter.prepare('Everyone left before I could say goodbye.', 'turn-1')
  const turn = {
    schemaVersion: 1,
    stage: 'follow-up',
    speaker: 'alone',
    speechAct: 'reflect_and_ask',
    text: 'You were left without a goodbye. What part of that moment stayed with you?',
    storyReference: 'left without a goodbye',
    tentativeMeaning: null,
    safetyMode: 'normal',
  }

  assert.equal(encounter.commit(request, turn), true)
  assert.deepEqual(encounter.getState(), {
    stage: 'follow-up',
    closed: false,
    history: [
      { role: 'user', text: request.message, inputKind: 'story' },
      { role: 'character', text: turn.text, stage: 'follow-up' },
    ],
  })
})

test('treats the mirror reply as correction input and closes after three model turns', () => {
  const encounter = createStoryEncounter()
  const turns = [
    ['The team celebrated without me.', 'follow-up', 'reflect_and_ask', null],
    ['I was hurt that my work was invisible.', 'mirror', 'tentative_mirror', 'being unseen mattered most'],
    ['Not unseen. I was angry they took credit.', 'closure', 'acknowledge_and_close', null],
  ]

  for (let index = 0; index < turns.length; index += 1) {
    const [message, stage, speechAct, tentativeMeaning] = turns[index]
    const request = encounter.prepare(message, `turn-${index + 1}`)
    if (stage === 'closure') assert.equal(request.inputKind, 'correction_or_confirmation')
    assert.equal(encounter.commit(request, {
      schemaVersion: 1,
      stage,
      speaker: 'alone',
      speechAct,
      text: stage === 'closure'
        ? 'Thank you for correcting me: it was the stolen credit that made you angry. We can leave it here.'
        : `Character response for ${stage}?`,
      storyReference: message,
      tentativeMeaning,
      safetyMode: 'normal',
    }), true)
  }

  assert.equal(encounter.getState().stage, 'closure')
  assert.equal(encounter.getState().closed, true)
  assert.throws(() => encounter.prepare('One more turn', 'turn-4'), /closed/i)
})

test('exits role-play before the model for explicit self-harm intent', () => {
  const encounter = createStoryEncounter()

  const result = encounter.prepare('I am going to kill myself tonight.', 'unsafe-turn')

  assert.equal(result.type, 'safety-exit')
  assert.match(result.message, /local emergency services|trusted person/i)
  assert.deepEqual(encounter.getState(), {
    stage: 'safety-exit',
    closed: true,
    history: [],
  })
})

test('lets the user close the encounter without another model turn', () => {
  const encounter = createStoryEncounter()

  assert.equal(encounter.close(), true)
  assert.equal(encounter.close(), false)
  assert.deepEqual(encounter.getState(), {
    stage: 'closure',
    closed: true,
    history: [],
  })
})
