import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { buildPiArgs, createPiRpcSession } from '../server/pi-rpc.js'

function createFakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.killedWith = null
  child.kill = (signal) => {
    child.killedWith = signal
    return true
  }
  return child
}

test('starts Pi RPC with every executable capability disabled', () => {
  const args = buildPiArgs()

  assert.deepEqual(args.slice(0, 2), ['--mode', 'rpc'])
  assert.ok(args.includes('--no-tools'))
  assert.ok(args.includes('--no-skills'))
  assert.ok(args.includes('--no-extensions'))
  assert.ok(args.includes('--no-context-files'))
  assert.ok(args.includes('--no-session'))
  assert.ok(args.includes('--system-prompt'))
})

test('streams strict JSONL events and writes correlated prompts', async () => {
  const child = createFakeChild()
  const events = []
  const errors = []
  const calls = []
  const writes = []
  child.stdin.on('data', (chunk) => writes.push(chunk.toString()))

  const session = createPiRpcSession({
    spawnProcess(command, args, options) {
      calls.push({ command, args, options })
      return child
    },
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
  })

  child.stdout.write(`{"type":"message_update","message":{"text":"line${String.fromCodePoint(0x2028)}separator"},`)
  child.stdout.write('"assistantMessageEvent":{"type":"text_delta","delta":"Hello"}}\n')
  session.prompt('I feel uncertain', 'message-1')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(calls[0].command, 'pi')
  assert.equal(calls[0].options.stdio[0], 'pipe')
  assert.equal(events[0].assistantMessageEvent.delta, 'Hello')
  assert.deepEqual(errors, [])
  assert.equal(
    writes.join(''),
    '{"id":"message-1","type":"prompt","message":"I feel uncertain"}\n',
  )

  session.close()
  assert.equal(child.killedWith, 'SIGTERM')
})

test('rejects empty and oversized prompts before writing to Pi', () => {
  const child = createFakeChild()
  const session = createPiRpcSession({ spawnProcess: () => child })

  assert.throws(() => session.prompt('   ', 'empty'), /message is required/i)
  assert.throws(() => session.prompt('x'.repeat(2001), 'large'), /2,000 characters/i)

  session.close()
})
