import { once } from 'node:events'
import { createServer } from 'node:http'
import { connect } from 'node:net'
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

async function createChatHarness({
  now = Date.now,
  trustProxy = false,
  logger = { info() {}, error() {} },
  createConnectionId = () => 'test-connection',
  settleImmediately = true,
  rejectUnknownUpgrades = true,
  handleUnknownUpgrade = false,
} = {}) {
  const server = createServer()
  const clients = []
  const prompts = []
  let emitEvent = () => {}
  let turnTimeoutCallback = null
  let turnTimeoutSchedules = 0
  let aborts = 0
  let chatClosed = false
  let closedSessions = 0
  let resolveSessionClosed
  const sessionClosed = new Promise((resolve) => {
    resolveSessionClosed = resolve
  })
  const chatServer = attachChatWebSocketServer(server, {
    trustProxy,
    rateLimitNow: now,
    logger,
    createConnectionId,
    rejectUnknownUpgrades,
    setTurnTimeout(callback) {
      turnTimeoutSchedules += 1
      turnTimeoutCallback = callback
      return 1
    },
    clearTurnTimeout() {
      turnTimeoutCallback = null
    },
    createSession({ onEvent }) {
      emitEvent = onEvent
      return {
        prompt(message) {
          prompts.push(message)
          if (settleImmediately) queueMicrotask(() => onEvent({ type: 'agent_settled' }))
        },
        abort() {
          aborts += 1
        },
        close() {
          closedSessions += 1
          resolveSessionClosed()
        },
      }
    },
  })
  if (handleUnknownUpgrade) {
    server.on('upgrade', (request, socket) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname
      if (pathname === '/chat') return
      socket.end('HTTP/1.1 418 Vite HMR\r\nConnection: close\r\n\r\n')
    })
  }
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
    async expectRejected(host) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, {
          origin: `http://${host}`,
          headers: { Host: host },
        })
        socket.once('open', () => {
          socket.close()
          reject(new Error('Expected the WebSocket upgrade to be rejected.'))
        })
        socket.once('unexpected-response', (_request, response) => {
          const status = response.statusCode
          response.resume()
          resolve(status)
        })
        socket.once('error', () => resolve(null))
      })
    },
    async rawUpgrade(pathname) {
      const socket = connect(port, '127.0.0.1')
      await once(socket, 'connect')
      socket.write(
        `GET ${pathname} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      )
      const response = await Promise.race([
        once(socket, 'data').then(([chunk]) => chunk.toString()),
        new Promise((resolve) => setTimeout(() => resolve(null), 100)),
      ])
      socket.destroy()
      return response
    },
    emit: (event) => emitEvent(event),
    promptCount: () => prompts.length,
    prompts: () => [...prompts],
    abortCount: () => aborts,
    turnTimeoutScheduleCount: () => turnTimeoutSchedules,
    fireTurnTimeout() {
      if (!turnTimeoutCallback) return false
      const callback = turnTimeoutCallback
      turnTimeoutCallback = null
      callback()
      return true
    },
    closedSessionCount: () => closedSessions,
    waitForSessionClose: () => sessionClosed,
    async closeChatServer() {
      if (chatClosed) return
      await new Promise((resolve) => chatServer.close(resolve))
      chatClosed = true
    },
    async close() {
      await Promise.all(
        clients.map(async (socket) => {
          if (socket.readyState === WebSocket.CLOSED) return
          socket.close()
          await once(socket, 'close')
        }),
      )
      if (!chatClosed) {
        await new Promise((resolve) => chatServer.close(resolve))
        chatClosed = true
      }
      if (server.listening) {
        server.close()
        await once(server, 'close')
      }
    },
  }
}

function sendPrompt(socket, id, message = `message ${id}`, visual) {
  return new Promise((resolve) => {
    function handleMessage(payload) {
      const response = JSON.parse(payload.toString())
      if (response.type !== 'assistant_done' && response.type !== 'assistant_error') return
      socket.off('message', handleMessage)
      resolve(response)
    }
    socket.on('message', handleMessage)
    socket.send(JSON.stringify({ type: 'prompt', id, message, visual }))
  })
}

function waitForMessageType(socket, type, timeoutMs = 100) {
  return Promise.race([
    new Promise((resolve) => {
      function handleMessage(payload) {
        const response = JSON.parse(payload.toString())
        if (response.type !== type) return
        socket.off('message', handleMessage)
        resolve(response)
      }
      socket.on('message', handleMessage)
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

test('rejects non-object JSON without terminating the connection', async () => {
  const harness = await createChatHarness()
  try {
    const socket = await harness.connect('localhost')
    const errorPromise = waitForMessageType(socket, 'assistant_error')
    socket.send('null')

    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      message: 'The chat request must be a JSON object.',
    })
    assert.equal((await sendPrompt(socket, 'after-null')).type, 'assistant_done')
  } finally {
    await harness.close()
  }
})

test('validates a complete encounter turn before sending it to the browser', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const turnPromise = waitForMessageType(socket, 'encounter_turn')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'encounter-1',
        message: 'Everyone left before I could say goodbye.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [],
      },
    }))
    assert.deepEqual(await acceptedPromise, { type: 'prompt_accepted', id: 'encounter-1' })
    assert.match(harness.prompts()[0], /expected response stage is "follow-up"/i)
    const turn = {
      schemaVersion: 1,
      stage: 'follow-up',
      speaker: 'alone',
      speechAct: 'reflect_and_ask',
      text: 'You were left without a goodbye. What did you wish they had heard?',
      storyReference: 'left without a goodbye',
      tentativeMeaning: null,
      safetyMode: 'normal',
    }
    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: JSON.stringify(turn) },
    })
    harness.emit({ type: 'agent_settled' })

    assert.deepEqual(await turnPromise, {
      type: 'encounter_turn',
      id: 'encounter-1',
      turn,
    })
  } finally {
    await harness.close()
  }
})

test('builds later encounter prompts from server-owned validated history', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const firstTurnPromise = waitForMessageType(socket, 'encounter_turn')
    const firstAcceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'history-1',
        message: 'Everyone left before I could say goodbye.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [{ role: 'user', text: 'UNTRUSTED-BROWSER-HISTORY' }],
      },
    }))
    await firstAcceptedPromise
    const followUp = {
      schemaVersion: 1,
      stage: 'follow-up',
      speaker: 'alone',
      speechAct: 'reflect_and_ask',
      text: 'You were left without a goodbye. What did you wish they had heard?',
      storyReference: 'left without a goodbye',
      tentativeMeaning: null,
      safetyMode: 'normal',
    }
    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: JSON.stringify(followUp) },
    })
    harness.emit({ type: 'agent_settled' })
    await firstTurnPromise

    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'history-2',
        message: 'I wanted them to know the work mattered to me.',
        currentStage: 'follow-up',
        expectedStage: 'mirror',
        inputKind: 'follow_up_answer',
        history: [{ role: 'user', text: 'UNTRUSTED-BROWSER-HISTORY' }],
      },
    }))
    await acceptedPromise

    assert.match(harness.prompts()[1], /Everyone left before I could say goodbye\./)
    assert.match(harness.prompts()[1], /You were left without a goodbye\./)
    assert.match(harness.prompts()[1], /I wanted them to know the work mattered to me\./)
    assert.doesNotMatch(harness.prompts()[1], /UNTRUSTED-BROWSER-HISTORY/)
  } finally {
    await harness.close()
  }
})

test('repairs one invalid model response before exposing a turn', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    const turnPromise = waitForMessageType(socket, 'encounter_turn')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'repair-1',
        message: 'I felt overlooked.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [],
      },
    }))
    await acceptedPromise

    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'not json' },
    })
    harness.emit({ type: 'agent_settled' })

    assert.equal(harness.promptCount(), 2)
    assert.match(harness.prompts()[1], /repair your previous response/i)

    const repaired = {
      schemaVersion: 1,
      stage: 'follow-up',
      speaker: 'alone',
      speechAct: 'reflect_and_ask',
      text: 'You felt overlooked. What did you need them to notice?',
      storyReference: 'felt overlooked',
      tentativeMeaning: null,
      safetyMode: 'normal',
    }
    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: JSON.stringify(repaired) },
    })
    harness.emit({ type: 'agent_settled' })

    assert.deepEqual(await turnPromise, {
      type: 'encounter_turn',
      id: 'repair-1',
      turn: repaired,
    })
  } finally {
    await harness.close()
  }
})

test('aborts oversized streamed encounter output before settlement', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'oversized-1',
        message: 'I felt overlooked.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
      },
    }))
    await acceptedPromise

    harness.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'x'.repeat(4097) },
    })
    assert.equal(harness.abortCount(), 1)
    assert.equal(harness.promptCount(), 1)

    const errorPromise = waitForMessageType(socket, 'assistant_error')
    harness.emit({ type: 'agent_settled' })
    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      errorKind: 'validation',
      message: 'Alone returned an oversized response. Retry this turn.',
    })
  } finally {
    await harness.close()
  }
})

test('settles provider errors without repair or stage advancement', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    const request = {
      id: 'provider-error-1',
      message: 'I felt overlooked.',
      currentStage: 'story',
      expectedStage: 'follow-up',
      inputKind: 'story',
    }
    socket.send(JSON.stringify({ type: 'encounter_prompt', request }))
    await acceptedPromise

    const earlyErrorPromise = waitForMessageType(socket, 'assistant_error', 20)
    harness.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [{
        role: 'assistant',
        stopReason: 'error',
        errorMessage: '429: insufficient balance',
      }],
    })
    assert.equal(await earlyErrorPromise, null)

    const errorPromise = waitForMessageType(socket, 'assistant_error')
    harness.emit({ type: 'agent_settled' })
    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      message: 'The configured Pi provider rejected this request (429). Check its balance or model setting.',
    })
    assert.equal(harness.promptCount(), 1)

    const retryAccepted = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: { ...request, id: 'provider-error-retry' },
    }))
    assert.deepEqual(await retryAccepted, {
      type: 'prompt_accepted',
      id: 'provider-error-retry',
    })
  } finally {
    await harness.close()
  }
})

test('rejects encounter prompts after the closure stage', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const steps = [
      {
        request: { id: 'close-1', message: 'A story.', currentStage: 'story', expectedStage: 'follow-up', inputKind: 'story' },
        turn: { schemaVersion: 1, stage: 'follow-up', speaker: 'alone', speechAct: 'reflect_and_ask', text: 'You shared a story. What stayed with you?', storyReference: 'a story', tentativeMeaning: null, safetyMode: 'normal' },
      },
      {
        request: { id: 'close-2', message: 'The ending.', currentStage: 'follow-up', expectedStage: 'mirror', inputKind: 'follow_up_answer' },
        turn: { schemaVersion: 1, stage: 'mirror', speaker: 'alone', speechAct: 'tentative_mirror', text: 'Maybe the ending mattered most. Is that close?', storyReference: 'the ending', tentativeMeaning: 'the ending mattered most', safetyMode: 'normal' },
      },
      {
        request: { id: 'close-3', message: 'Yes.', currentStage: 'mirror', expectedStage: 'closure', inputKind: 'correction_or_confirmation' },
        turn: { schemaVersion: 1, stage: 'closure', speaker: 'alone', speechAct: 'acknowledge_and_close', text: 'Thank you for confirming that. We can leave it here.', storyReference: 'your confirmation', tentativeMeaning: null, safetyMode: 'normal' },
      },
    ]

    for (const { request, turn } of steps) {
      const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
      const turnPromise = waitForMessageType(socket, 'encounter_turn')
      socket.send(JSON.stringify({ type: 'encounter_prompt', request }))
      await acceptedPromise
      harness.emit({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: JSON.stringify(turn) },
      })
      harness.emit({ type: 'agent_settled' })
      await turnPromise
    }

    const errorPromise = waitForMessageType(socket, 'assistant_error')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: { id: 'after-close', message: 'Continue.', currentStage: 'closure' },
    }))
    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      errorKind: 'request',
      message: 'This encounter is already closed.',
    })
    assert.equal(harness.promptCount(), 3)
  } finally {
    await harness.close()
  }
})

test('waits for Pi to settle after timeout before allowing retry', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'timeout-1',
        message: 'I keep replaying the meeting.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [],
      },
    }))
    await acceptedPromise

    const earlyErrorPromise = waitForMessageType(socket, 'assistant_error', 20)
    assert.equal(harness.fireTurnTimeout(), true)
    assert.equal(harness.abortCount(), 1)
    assert.equal(await earlyErrorPromise, null)

    const errorPromise = waitForMessageType(socket, 'assistant_error')
    harness.emit({ type: 'agent_settled' })
    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      errorKind: 'timeout',
      message: 'Alone took too long to respond. Retry or close this encounter.',
    })

    const retryAccepted = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'timeout-retry',
        message: 'I keep replaying the meeting.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [],
      },
    }))
    assert.deepEqual(await retryAccepted, { type: 'prompt_accepted', id: 'timeout-retry' })
  } finally {
    await harness.close()
  }
})

test('waits for Pi to settle before confirming encounter cancellation', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'cancel-1',
        message: 'I want to stop here.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
        history: [],
      },
    }))
    await acceptedPromise

    const cancelledPromise = waitForMessageType(socket, 'encounter_cancelled')
    socket.send(JSON.stringify({ type: 'abort' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(harness.abortCount(), 1)
    harness.emit({ type: 'agent_settled' })

    assert.deepEqual(await cancelledPromise, {
      type: 'encounter_cancelled',
      id: 'cancel-1',
    })
  } finally {
    await harness.close()
  }
})

test('fails closed when Pi never settles after encounter cancellation', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'cancel-stuck',
        message: 'I want to stop here.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
      },
    }))
    await acceptedPromise

    socket.send(JSON.stringify({ type: 'abort' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    const errorPromise = waitForMessageType(socket, 'assistant_error')
    assert.equal(harness.fireTurnTimeout(), true)
    assert.deepEqual(await errorPromise, {
      type: 'assistant_error',
      errorKind: 'settlement',
      message: 'Pi did not finish stopping. Reset to start a new encounter.',
    })
    await harness.waitForSessionClose()
    assert.equal(harness.closedSessionCount(), 1)
  } finally {
    await harness.close()
  }
})

test('does not extend the settlement deadline for repeated aborts', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const acceptedPromise = waitForMessageType(socket, 'prompt_accepted')
    socket.send(JSON.stringify({
      type: 'encounter_prompt',
      request: {
        id: 'cancel-repeat',
        message: 'I want to stop here.',
        currentStage: 'story',
        expectedStage: 'follow-up',
        inputKind: 'story',
      },
    }))
    await acceptedPromise
    assert.equal(harness.turnTimeoutScheduleCount(), 1)

    socket.send(JSON.stringify({ type: 'abort' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(harness.turnTimeoutScheduleCount(), 2)

    socket.send(JSON.stringify({ type: 'abort' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(harness.turnTimeoutScheduleCount(), 2)
    assert.equal(harness.abortCount(), 1)
  } finally {
    await harness.close()
  }
})

test('rejects non-loopback hosts even when Origin matches Host', async () => {
  const harness = await createChatHarness()
  try {
    assert.equal(await harness.expectRejected('attacker.example'), 403)
  } finally {
    await harness.close()
  }
})

test('closes unmatched WebSocket upgrades instead of leaving sockets open', async () => {
  const harness = await createChatHarness()
  try {
    assert.match(await harness.rawUpgrade('/not-chat'), /404 Not Found/)
  } finally {
    await harness.close()
  }
})

test('leaves non-chat upgrades for the Vite development server', async () => {
  const harness = await createChatHarness({
    rejectUnknownUpgrades: false,
    handleUnknownUpgrade: true,
  })
  try {
    assert.match(await harness.rawUpgrade('/?token=vite-hmr'), /418 Vite HMR/)
  } finally {
    await harness.close()
  }
})
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

test('closes each Pi session and logs lifecycle without conversation content', async () => {
  const records = []
  const harness = await createChatHarness({
    logger: {
      info: (...args) => records.push(args),
      error: (...args) => records.push(args),
    },
    createConnectionId: () => 'connection-private',
  })
  try {
    const socket = await harness.connect('localhost')
    socket.send(
      JSON.stringify({ type: 'prompt', id: 'private', message: 'PRIVATE-MARKER' }),
    )
    socket.close()
    await once(socket, 'close')
    await harness.waitForSessionClose()

    assert.equal(harness.closedSessionCount(), 1)
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE-MARKER/)
    assert.match(JSON.stringify(records), /connection-private/)
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

test('rejects blank user messages before visual context reaches Pi', async () => {
  const harness = await createChatHarness()
  try {
    const socket = await harness.connect('localhost')
    const response = await sendPrompt(socket, 'blank', '   ', {
      label: 'Joy',
      primary: '#ffd166',
      accent: '#ef476f',
    })

    assert.equal(response.type, 'assistant_error')
    assert.match(response.message, /message is required/i)
    assert.equal(harness.promptCount(), 0)
  } finally {
    await harness.close()
  }
})

test('keeps a connection busy until Pi settles after a provider error', async () => {
  const harness = await createChatHarness({ settleImmediately: false })
  try {
    const socket = await harness.connect('localhost')
    const first = sendPrompt(socket, 'first')
    await new Promise((resolve) => setImmediate(resolve))
    harness.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [
        {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: '429: insufficient balance',
        },
      ],
    })
    assert.equal((await first).type, 'assistant_error')

    const second = await Promise.race([
      sendPrompt(socket, 'second'),
      new Promise((resolve) => setTimeout(() => resolve(null), 100)),
    ])
    assert.match(second?.message ?? '', /still responding/i)
    assert.equal(harness.promptCount(), 1)

    harness.emit({ type: 'agent_settled' })
    const third = sendPrompt(socket, 'third')
    for (let index = 0; index < 20 && harness.promptCount() !== 2; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    assert.equal(harness.promptCount(), 2)
    harness.emit({ type: 'agent_settled' })
    assert.equal((await third).type, 'assistant_done')
  } finally {
    await harness.close()
  }
})

test('closing the chat server terminates active Pi sessions', async () => {
  const harness = await createChatHarness()
  try {
    await harness.connect('localhost')
    const shutdown = harness.closeChatServer()
    const closed = await Promise.race([
      harness.waitForSessionClose().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100)),
    ])

    assert.equal(closed, true)
    await shutdown
    assert.equal(harness.closedSessionCount(), 1)
  } finally {
    await harness.close()
  }
})
