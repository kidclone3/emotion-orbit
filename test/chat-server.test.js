import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentPrompt, eventToClientMessage, isAllowedOrigin } from '../server/chat-server.js'

test('maps Pi text deltas and settled events to the browser protocol', () => {
  assert.deepEqual(
    eventToClientMessage({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'I hear you.' },
    }),
    { type: 'assistant_delta', delta: 'I hear you.' },
  )
  assert.deepEqual(eventToClientMessage({ type: 'agent_settled' }), {
    type: 'assistant_done',
  })
  assert.equal(eventToClientMessage({ type: 'thinking_delta' }), null)
})

test('surfaces the final Pi provider error instead of reporting an empty reply', () => {
  assert.deepEqual(
    eventToClientMessage({
      type: 'agent_end',
      willRetry: false,
      messages: [
        {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: '429: insufficient balance',
        },
      ],
    }),
    {
      type: 'assistant_error',
      message: 'The configured Pi provider rejected this request (429). Check its balance or model setting.',
    },
  )
})

test('accepts only same-origin browser websocket upgrades', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', 'localhost:5173'), true)
  assert.equal(isAllowedOrigin('https://emotion.example', 'emotion.example'), true)
  assert.equal(isAllowedOrigin('https://attacker.example', 'emotion.example'), false)
  assert.equal(isAllowedOrigin(undefined, 'localhost:5173'), false)
})

test('tells Pi that the current color is already visible in the webpage', () => {
  const prompt = buildAgentPrompt('show me the color?', {
    label: 'Melancholy blend',
    primary: '#6688c4',
    accent: '#a89fc5',
  })

  assert.match(prompt, /currently showing a Melancholy blend/i)
  assert.match(prompt, /primary #6688c4 and accent #a89fc5/i)
  assert.match(prompt, /already visible to the user/i)
  assert.match(prompt, /User message:\nshow me the color\?$/)
  assert.equal(buildAgentPrompt('hello', { label: 'Fake', primary: 'blue', accent: '#ffffff' }), 'hello')
})
