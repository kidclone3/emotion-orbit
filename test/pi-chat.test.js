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
    this.emit('close')
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
