import test from 'node:test'
import assert from 'node:assert/strict'
import { chatSocketUrl, createPiChatClient } from '../src/pi-chat.js'

class FakeWebSocket {
  static OPEN = 1

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.OPEN
    this.listeners = new Map()
    this.sent = []
    this.closeCount = 0
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener)
  }

  emit(type, payload = {}) {
    this.listeners.get(type)?.(payload)
  }

  send(payload) {
    this.sent.push(payload)
  }

  close() {
    this.closeCount += 1
    this.emit('close')
  }
}

function createFakeTimers() {
  const pending = new Map()
  let sequence = 0
  return {
    pending,
    setTimeout(callback, delay) {
      const id = ++sequence
      pending.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) {
      pending.delete(id)
    },
    runNext() {
      const [id, timer] = pending.entries().next().value
      pending.delete(id)
      timer.callback()
      return timer.delay
    },
  }
}

test('builds a same-origin WebSocket URL for local and secure pages', () => {
  assert.equal(chatSocketUrl({ protocol: 'http:', host: 'localhost:5173' }), 'ws://localhost:5173/chat')
  assert.equal(chatSocketUrl({ protocol: 'https:', host: 'emotion.example' }), 'wss://emotion.example/chat')
})

test('forwards browser messages and correlated prompts', () => {
  const messages = []
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onMessage: (message) => messages.push(message),
    onStatus: (status) => statuses.push(status),
  })

  client.socket.emit('open')
  client.send('I feel calm', 'm-1', {
    label: 'Calm',
    primary: '#69e6d1',
    accent: '#5b8cff',
  })
  client.socket.emit('message', { data: '{"type":"assistant_delta","delta":"I hear you."}' })

  assert.deepEqual(statuses, ['connecting', 'online'])
  assert.equal(
    client.socket.sent[0],
    '{"type":"prompt","id":"m-1","message":"I feel calm","visual":{"label":"Calm","primary":"#69e6d1","accent":"#5b8cff"}}',
  )
  assert.deepEqual(messages, [{ type: 'assistant_delta', delta: 'I hear you.' }])
})

test('sends a bounded encounter request without visual or layout commands', () => {
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
  })
  const request = {
    id: 'encounter-1',
    message: 'I felt forgotten.',
    currentStage: 'story',
    expectedStage: 'follow-up',
    inputKind: 'story',
    history: [],
  }

  client.sendEncounter(request)

  assert.deepEqual(JSON.parse(client.socket.sent[0]), {
    type: 'encounter_prompt',
    request,
  })
})

test('reconnects once after an unexpected close with bounded backoff', () => {
  const timers = createFakeTimers()
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    random: () => 0.5,
  })
  const firstSocket = client.socket

  firstSocket.emit('close')

  assert.equal(timers.pending.size, 1)
  assert.equal(timers.runNext(), 500)
  assert.notEqual(client.socket, firstSocket)
  assert.deepEqual(statuses, ['connecting', 'offline', 'reconnecting'])
})

test('reconnects after a socket error even when close does not follow', () => {
  const timers = createFakeTimers()
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    random: () => 0.5,
  })

  client.socket.emit('error')

  assert.equal(timers.pending.size, 1)
  timers.runNext()
  assert.deepEqual(statuses, ['connecting', 'network-error', 'reconnecting'])
})

test('socket error closes the failed socket before replacement', () => {
  const timers = createFakeTimers()
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  })
  const failedSocket = client.socket

  failedSocket.emit('error')

  assert.equal(failedSocket.closeCount, 1)
  assert.equal(timers.pending.size, 1)
})

test('ignores late events from a failed socket', () => {
  const timers = createFakeTimers()
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  })
  const failedSocket = client.socket
  failedSocket.emit('error')

  failedSocket.emit('open')
  failedSocket.emit('message', { data: '{\"type\":\"assistant_done\"}' })

  assert.deepEqual(statuses, ['connecting', 'network-error'])
  assert.equal(timers.pending.size, 1)
})

test('stops reconnecting after the bound and caps exponential delays', () => {
  const timers = createFakeTimers()
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    random: () => 0.5,
    baseReconnectDelay: 100,
    maxReconnectDelay: 150,
    maxReconnectAttempts: 3,
  })

  const delays = []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    client.socket.emit('error')
    delays.push(timers.runNext())
  }
  client.socket.emit('error')

  assert.deepEqual(delays, [100, 150, 150])
  assert.equal(timers.pending.size, 0)
  assert.equal(statuses.at(-1), 'offline')
})

test('manual reconnect replaces the socket and cancels pending recovery', () => {
  const timers = createFakeTimers()
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    random: () => 0.5,
  })
  const firstSocket = client.socket
  firstSocket.emit('close')

  client.reconnect()

  assert.notEqual(client.socket, firstSocket)
  assert.equal(timers.pending.size, 0)
})

test('client close is terminal, idempotent, and cancels reconnect work', () => {
  const timers = createFakeTimers()
  const statuses = []
  const client = createPiChatClient({
    WebSocketImpl: FakeWebSocket,
    url: 'ws://localhost/chat',
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
  })
  const socket = client.socket
  socket.emit('close')

  client.close()
  client.close()

  assert.equal(timers.pending.size, 0)
  assert.equal(socket.closeCount, 1)
  assert.equal(statuses.at(-1), 'closed')
  assert.equal(client.reconnect(), false)
})
