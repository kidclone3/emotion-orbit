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
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

export function attachChatWebSocketServer(server, { createSession = createPiRpcSession } = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192 })

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname
    if (pathname !== '/chat') return
    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    sockets.handleUpgrade(request, socket, head, (websocket) => {
      sockets.emit('connection', websocket)
    })
  })

  sockets.on('connection', (socket) => {
    let busy = false
    let closed = false
    const session = createSession({
      onEvent(event) {
        const message = eventToClientMessage(event)
        if (!message) return
        if (message.type === 'assistant_done' || message.type === 'assistant_error') busy = false
        send(socket, message)
      },
      onError() {
        busy = false
        send(socket, {
          type: 'assistant_error',
          message: 'The Pi bridge is unavailable. Check the server configuration and try again.',
        })
      },
      onExit({ code }) {
        if (closed) return
        busy = false
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
      if (busy) {
        send(socket, {
          type: 'assistant_error',
          message: 'Pi is still responding. Wait for the current response to finish.',
        })
        return
      }

      try {
        session.prompt(buildAgentPrompt(message.message, message.visual), message.id)
        busy = true
        send(socket, { type: 'prompt_accepted', id: message.id })
      } catch (error) {
        send(socket, { type: 'assistant_error', message: error.message })
      }
    })

    socket.on('close', () => {
      closed = true
      session.close()
    })
    socket.on('error', () => {
      closed = true
      session.close()
    })
  })

  return sockets
}
