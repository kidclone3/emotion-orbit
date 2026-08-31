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

test('passes explicit provider, model, and generic API key to Pi', () => {
  const args = buildPiArgs({
    PI_CHAT_PROVIDER: 'openai',
    PI_CHAT_MODEL: 'gpt-4o-mini',
    PI_CHAT_API_KEY: 'test-secret',
  })

  assert.deepEqual(args.slice(-6), [
    '--provider',
    'openai',
    '--model',
    'gpt-4o-mini',
    '--api-key',
    'test-secret',
  ])
})

test('omits the generic API key flag for provider-native credentials', () => {
  const args = buildPiArgs({
    PI_CHAT_PROVIDER: 'amazon-bedrock',
    PI_CHAT_MODEL: 'claude-sonnet',
    AWS_PROFILE: 'emotion-orbit',
  })

  assert.equal(args.includes('--api-key'), false)
  assert.deepEqual(args.slice(-4), [
    '--provider',
    'amazon-bedrock',
    '--model',
    'claude-sonnet',
  ])
})

test('passes provider-native credentials unchanged to the Pi process', () => {
  const child = createFakeChild()
  const environment = {
    PI_CHAT_PROVIDER: 'amazon-bedrock',
    PI_CHAT_MODEL: 'claude-sonnet',
    AWS_PROFILE: 'emotion-orbit',
    AWS_REGION: 'us-east-1',
  }
  let spawned

  const session = createPiRpcSession({
    environment,
    spawnProcess(command, args, options) {
      spawned = { command, args, options }
      return child
    },
  })

  assert.equal(spawned.options.env.AWS_PROFILE, 'emotion-orbit')
  assert.equal(spawned.args.includes('--api-key'), false)
  session.close()
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
