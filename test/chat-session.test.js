import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createChatSession,
  createCompletionAnnouncer,
  isChatInFlight,
} from '../src/chat-session.js'

test('keeps deltas quiet and announces a completed response exactly once', () => {
  const session = createChatSession()
  session.begin({ id: 'm-1', message: 'I feel calm', visual: { label: 'Calm' } })

  assert.equal(session.append('I hear '), null)
  assert.equal(session.append('you.'), null)
  assert.equal(session.complete(), 'Pi responded: I hear you.')
  assert.equal(session.complete(), null)
  assert.equal(session.getState().status, 'success')
})

test('retry preserves a failed prompt while replacing its correlation id', () => {
  const session = createChatSession()
  const visual = { label: 'Melancholy', primary: '#6688c4' }
  session.begin({ id: 'm-1', message: 'I feel low', visual })
  session.fail('Provider unavailable', 'provider')

  const retryPrompt = session.retry('m-2')

  assert.deepEqual(retryPrompt, { id: 'm-2', message: 'I feel low', visual })
  assert.deepEqual(session.getState(), {
    status: 'busy',
    prompt: retryPrompt,
    response: '',
    errorKind: null,
  })
})

test('cancel waits for terminal acknowledgement before enabling retry', () => {
  const session = createChatSession()
  session.begin({ id: 'm-1', message: 'Stop this', visual: { label: 'Anger' } })
  session.append('Partial')

  assert.equal(session.cancel(), true)
  assert.equal(session.getState().status, 'cancelling')
  assert.equal(session.retry('m-2'), null)
  assert.equal(session.confirmCancelled(), true)
  assert.equal(session.complete(), null)
  assert.equal(session.getState().status, 'cancelled')
  assert.deepEqual(session.retry('m-2'), {
    id: 'm-2',
    message: 'Stop this',
    visual: { label: 'Anger' },
  })
})

test('completion announcer publishes queued results independent of later chat state', () => {
  const frames = []
  const published = []
  const announcer = createCompletionAnnouncer({
    schedule: (callback) => frames.push(callback),
    publish: (message) => published.push(message),
  })

  announcer.announce('Pi responded: First.')
  announcer.announce('Pi responded: Second.')
  assert.deepEqual(published, [''])

  frames.shift()()
  assert.deepEqual(published, ['', 'Pi responded: First.', ''])
  frames.shift()()
  assert.deepEqual(published, [
    '',
    'Pi responded: First.',
    '',
    'Pi responded: Second.',
  ])
})

test('treats both responding and cancelling chat states as in flight', () => {
  assert.equal(isChatInFlight('busy'), true)
  assert.equal(isChatInFlight('cancelling'), true)
  assert.equal(isChatInFlight('cancelled'), false)
  assert.equal(isChatInFlight('failed'), false)
})
