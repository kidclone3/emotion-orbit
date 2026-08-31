import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { createPiRpcSession } from './pi-rpc.js'

export function eventToClientMessage(event) {
  if (
    event.type === 'message_update' &&
    event.assistantMessageEvent?.type === 'text_delta'
  ) {
    return { type: 'assistant_delta', delta: event.assistantMessageEvent.delta }
  }

  if (
    event.type === 'message_update' &&
    event.assistantMessageEvent?.type === 'error'
  ) {
    return {
      type: 'assistant_error',
      message: 'Pi could not complete that response. Please try again.',
    }
  }

  if (event.type === 'agent_end' && event.willRetry === false) {
    const failedMessage = event.messages?.findLast(
      (message) => message.role === 'assistant' && message.stopReason === 'error',
    )
    if (failedMessage) {
      const status = failedMessage.errorMessage?.match(/^\d{3}/)?.[0]
      return {
        type: 'assistant_error',
        message:
          status === '429'
            ? 'The configured Pi provider rejected this request (429). Check its balance or model setting.'
            : 'Pi could not complete that response. Check the configured provider and model, then try again.',
      }
    }
  }

  if (event.type === 'agent_settled') return { type: 'assistant_done' }
  return null
}

const VISUAL_LABELS = new Set(
  ['Joy', 'Calm', 'Love', 'Wonder', 'Anger', 'Melancholy'].flatMap((label) => [
    label,
    `${label} blend`,
  ]),
)
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function buildAgentPrompt(message, visual) {
  if (
    !VISUAL_LABELS.has(visual?.label) ||
    !HEX_COLOR.test(visual?.primary) ||
    !HEX_COLOR.test(visual?.accent)
  ) {
    return message
  }

  return `Application context:
The webpage is currently showing a ${visual.label} field with primary ${visual.primary} and accent ${visual.accent}.
This color field is already visible to the user. If they ask to show the color, acknowledge that the field is displaying it now. Do not say that you cannot show color. If you mention hex values, use the provided colors rather than inventing different ones.

User message:
${message}`
}

export function isAllowedOrigin(origin, host) {
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

const LIVE_CHAT_LIMIT = 5
const LIVE_CHAT_WINDOW_MS = 60_000

export function isLocalRequestHost(host) {
  if (!host) return false
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') {
      return true
    }
    return isIP(hostname) === 4 && hostname.startsWith('127.')
  } catch {
    return false
  }
}

function clientAddress(request, trustProxy) {
  const forwarded = request.headers['x-forwarded-for']
  if (trustProxy && typeof forwarded === 'string') {
    const address = forwarded.split(',', 1)[0].trim()
    if (isIP(address)) return address
  }
  return request.socket.remoteAddress ?? 'unknown'
}

function isLoopbackAddress(address) {
  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized.startsWith('::ffff:127.')) return true
  return isIP(normalized) === 4 && normalized.startsWith('127.')
}

function createPromptRateLimiter(now) {
  const clients = new Map()
  let checks = 0

  return (key) => {
    const timestamp = now()
    const cutoff = timestamp - LIVE_CHAT_WINDOW_MS
    if ((checks++ & 255) === 0) {
      for (const [client, attempts] of clients) {
        if (attempts.at(-1) <= cutoff) clients.delete(client)
      }
    }

    const attempts = clients.get(key) ?? []
    let expired = 0
    while (expired < attempts.length && attempts[expired] <= cutoff) expired += 1
    if (expired > 0) attempts.splice(0, expired)
    if (attempts.length >= LIVE_CHAT_LIMIT) {
      return { allowed: false, retryAfterMs: attempts[0] + LIVE_CHAT_WINDOW_MS - timestamp }
    }

    attempts.push(timestamp)
    clients.set(key, attempts)
    return { allowed: true, retryAfterMs: 0 }
  }
}


function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

export function attachChatWebSocketServer(
  server,
  {
    createSession = createPiRpcSession,
    trustProxy = false,
    rateLimitNow = Date.now,
    logger = console,
    createConnectionId = () => randomUUID().slice(0, 8),
  } = {},
) {
  const takePromptSlot = createPromptRateLimiter(rateLimitNow)
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192 })

  server.on('upgrade', (request, socket, head) => {
    let pathname
    try {
      pathname = new URL(request.url, `http://${request.headers.host}`).pathname
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request')
      return
    }
    if (pathname !== '/chat') {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }
    if (
      !isLocalRequestHost(request.headers.host) ||
      !isAllowedOrigin(request.headers.origin, request.headers.host)
    ) {
      rejectUpgrade(socket, 403, 'Forbidden')
      return
    }

    sockets.handleUpgrade(request, socket, head, (websocket) => {
      sockets.emit('connection', websocket, request)
    })
  })

  sockets.on('connection', (socket, request) => {
    const connectionId = createConnectionId()
    let busy = false
    let closed = false
    const address = clientAddress(request, trustProxy)
    logger.info?.('Chat connection opened.', { connectionId })
    const rateLimitKey =
      isLocalRequestHost(request.headers.host) && isLoopbackAddress(address) ? null : address
    const session = createSession({
      onEvent(event) {
        const message = eventToClientMessage(event)
        if (!message) return
        if (message.type === 'assistant_done') busy = false
        send(socket, message)
      },
      onError() {
        logger.error?.('Pi session error.', { connectionId })
        send(socket, {
          type: 'assistant_error',
          message: 'The Pi bridge is unavailable. Check the server configuration and try again.',
        })
        closeSession('session-error')
      },
      onExit({ code, signal }) {
        if (closed) return
        busy = false
        logger.error?.('Pi session exited.', { connectionId, code, signal })
        send(socket, {
          type: 'bridge_status',
          status: 'offline',
          message: code === 0 ? 'Pi disconnected.' : 'Pi stopped unexpectedly.',
        })
      },
    })

    send(socket, { type: 'bridge_status', status: 'online', message: 'Pi connected.' })

    socket.on('message', (payload) => {
      let message
      try {
        message = JSON.parse(payload.toString())
      } catch {
        send(socket, { type: 'assistant_error', message: 'The chat request was not valid JSON.' })
        return
      }

      if (message.type === 'abort') {
        session.abort()
        return
      }
      if (message.type !== 'prompt') return
      const userMessage = String(message.message ?? '').trim()
      if (!userMessage) {
        send(socket, { type: 'assistant_error', message: 'A message is required.' })
        return
      }
      if (busy) {
        send(socket, {
          type: 'assistant_error',
          message: 'Pi is still responding. Wait for the current response to finish.',
        })
        return
      }

      if (rateLimitKey) {
        const rateLimit = takePromptSlot(rateLimitKey)
        if (!rateLimit.allowed) {
          const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))
          send(socket, {
            type: 'assistant_error',
            message: `Live chat is limited to 5 messages per minute. Try again in ${retryAfterSeconds} seconds.`,
          })
          return
        }
      }

      try {
        session.prompt(buildAgentPrompt(userMessage, message.visual), message.id)
        busy = true
        send(socket, { type: 'prompt_accepted', id: message.id })
      } catch (error) {
        send(socket, { type: 'assistant_error', message: error.message })
      }
    })

    function closeSession(reason) {
      if (closed) return
      closed = true
      session.close()
      logger.info?.('Chat connection closed.', { connectionId, reason })
    }

    socket.on('close', () => closeSession('close'))
    socket.on('error', () => closeSession('error'))
  })

  return {
    close(callback = () => {}) {
      for (const socket of sockets.clients) socket.terminate()
      sockets.close(callback)
    },
  }
}
