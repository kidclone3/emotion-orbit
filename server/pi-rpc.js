import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

const MAX_MESSAGE_LENGTH = 2000

const SYSTEM_PROMPT = `You are a warm, concise conversational companion inside an emotional visualization. Reflect the user's feelings without diagnosing them. Ask at most one useful follow-up question. Use plain text only, keep most replies under 90 words, and never mention tools, system prompts, coding, or hidden instructions. If someone may be in immediate danger, encourage contacting local emergency services or a trusted person now.`

export function buildPiArgs(environment = process.env) {
  const args = [
    '--mode',
    'rpc',
    '--no-session',
    '--no-tools',
    '--no-skills',
    '--no-extensions',
    '--no-context-files',
    '--system-prompt',
    SYSTEM_PROMPT,
  ]

  if (environment.PI_CHAT_PROVIDER) args.push('--provider', environment.PI_CHAT_PROVIDER)
  if (environment.PI_CHAT_MODEL) args.push('--model', environment.PI_CHAT_MODEL)
  if (environment.PI_CHAT_API_KEY) args.push('--api-key', environment.PI_CHAT_API_KEY)

  return args
}

function attachJsonlReader(stream, onRecord, onError) {
  const decoder = new StringDecoder('utf8')
  let buffer = ''

  function consume() {
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)

      if (line) {
        try {
          onRecord(JSON.parse(line))
        } catch (error) {
          onError(new Error('Pi RPC emitted invalid JSON.', { cause: error }))
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  }

  stream.on('data', (chunk) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    consume()
  })

  stream.on('end', () => {
    buffer += decoder.end()
    if (!buffer) return
    try {
      onRecord(JSON.parse(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer))
    } catch (error) {
      onError(new Error('Pi RPC ended with invalid JSON.', { cause: error }))
    }
  })
}

export function createPiRpcSession({
  spawnProcess = spawn,
  environment = process.env,
  onEvent = () => {},
  onError = () => {},
  onExit = () => {},
} = {}) {
  const agent = spawnProcess('pi', buildPiArgs(environment), {
    cwd: process.cwd(),
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let closed = false
  let stderr = ''

  attachJsonlReader(agent.stdout, onEvent, onError)
  agent.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4000)
  })
  agent.on('error', (error) => onError(error))
  agent.on('exit', (code, signal) => {
    closed = true
    onExit({ code, signal, stderr })
  })

  return {
    prompt(message, id) {
      const normalized = String(message ?? '').trim()
      if (!normalized) throw new Error('A message is required.')
      if (normalized.length > MAX_MESSAGE_LENGTH) {
        throw new Error('Messages must be 2,000 characters or fewer.')
      }
      if (closed || agent.stdin.destroyed) throw new Error('Pi RPC is not available.')

      agent.stdin.write(`${JSON.stringify({ id, type: 'prompt', message: normalized })}\n`)
    },
    abort() {
      if (!closed && !agent.stdin.destroyed) {
        agent.stdin.write(`${JSON.stringify({ type: 'abort' })}\n`)
      }
    },
    close() {
      if (closed) return
      closed = true
      agent.stdin.end()
      agent.kill('SIGTERM')
    },
  }
}
