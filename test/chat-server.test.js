import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import {
  attachChatWebSocketServer,
  buildAgentPrompt,
  eventToClientMessage,
  isAllowedOrigin,
} from '../server/chat-server.js'

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

async function createChatHarness({ now = Date.now, trustProxy = false } = {}) {
  const server = createServer()
  const clients = []
  const chatServer = attachChatWebSocketServer(server, {
    trustProxy,
    rateLimitNow: now,
    createSession({ onEvent }) {
      return {
        prompt() {
          queueMicrotask(() => onEvent({ type: 'agent_settled' }))
        },
        abort() {},
        close() {},
      }
    },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port

  return {
    async connect(host, forwardedFor) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, {
        origin: `http://${host}`,
        headers: {
          Host: host,
          ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
        },
      })
      await once(socket, 'open')
      clients.push(socket)
      return socket
    },
    async close() {
      await Promise.all(
        clients.map(async (socket) => {
          if (socket.readyState === WebSocket.CLOSED) return
          socket.close()
          await once(socket, 'close')
        }),
      )
      await new Promise((resolve) => chatServer.close(resolve))
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

function sendPrompt(socket, id) {
  return new Promise((resolve) => {
    function handleMessage(payload) {
      const message = JSON.parse(payload.toString())
      if (message.type !== 'assistant_done' && message.type !== 'assistant_error') return
      socket.off('message', handleMessage)
      resolve(message)
    }
    socket.on('message', handleMessage)
    socket.send(JSON.stringify({ type: 'prompt', id, message: `message ${id}` }))
  })
}

test('allows unlimited local chat messages', async () => {
  const harness = await createChatHarness()
  try {
    const socket = await harness.connect('localhost')
    for (let index = 0; index < 8; index += 1) {
      assert.equal((await sendPrompt(socket, `local-${index}`)).type, 'assistant_done')
    }
  } finally {
    await harness.close()
  }
})

test('does not let a public client bypass the limit with a localhost host header', async () => {
  const harness = await createChatHarness({ trustProxy: true })
  try {
    const socket = await harness.connect('localhost', '203.0.113.12')
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await sendPrompt(socket, `spoof-${index}`)).type, 'assistant_done')
    }
    assert.equal((await sendPrompt(socket, 'spoof-5')).type, 'assistant_error')
  } finally {
    await harness.close()
  }
})

test('limits each live-domain client to five messages per rolling minute', async () => {
  let now = 10_000
  const harness = await createChatHarness({ now: () => now, trustProxy: true })
  try {
    const firstClient = await harness.connect('emotion.example', '203.0.113.10')
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await sendPrompt(firstClient, `live-${index}`)).type, 'assistant_done')
    }

    const limited = await sendPrompt(firstClient, 'live-5')
    assert.equal(limited.type, 'assistant_error')
    assert.match(limited.message, /5 messages per minute/i)

    const secondClient = await harness.connect('emotion.example', '203.0.113.11')
    assert.equal((await sendPrompt(secondClient, 'other-client')).type, 'assistant_done')

    now += 60_000
    assert.equal((await sendPrompt(firstClient, 'after-window')).type, 'assistant_done')
  } finally {
    await harness.close()
  }
})
