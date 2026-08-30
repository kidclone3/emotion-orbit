export function chatSocketUrl(pageLocation = globalThis.location) {
  const protocol = pageLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${pageLocation.host}/chat`
}

export function createPiChatClient({
  WebSocketImpl = globalThis.WebSocket,
  url = chatSocketUrl(),
  onMessage = () => {},
  onStatus = () => {},
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  random = Math.random,
  baseReconnectDelay = 500,
  maxReconnectDelay = 8000,
  maxReconnectAttempts = 5,
} = {}) {
  let socket
  let reconnectTimer = null
  let reconnectAttempt = 0
  let closedByClient = false

  function connect(reconnecting = false) {
    onStatus(reconnecting ? 'reconnecting' : 'connecting')
    socket = new WebSocketImpl(url)
    const activeSocket = socket
    let disconnected = false

    function handleDisconnect(status) {
      if (disconnected || socket !== activeSocket || closedByClient) return
      disconnected = true
      onStatus(status)
      if (reconnectAttempt >= maxReconnectAttempts) {
        onStatus('offline', 'Pi connection unavailable. Reconnect when a bridge is available.')
        return
      }
      reconnectAttempt += 1
      const exponentialDelay = Math.min(
        maxReconnectDelay,
        baseReconnectDelay * (2 ** (reconnectAttempt - 1)),
      )
      const delay = Math.round(exponentialDelay * (0.8 + random() * 0.4))
      reconnectTimer = setTimeoutImpl(() => {
        reconnectTimer = null
        connect(true)
      }, delay)
    }

    activeSocket.addEventListener('open', () => {
      if (disconnected || socket !== activeSocket || closedByClient) return
      reconnectAttempt = 0
      onStatus('online')
    })
    activeSocket.addEventListener('close', () => handleDisconnect('offline'))
    activeSocket.addEventListener('error', () => {
      handleDisconnect('network-error')
      activeSocket.close()
    })
    activeSocket.addEventListener('message', (event) => {
      if (disconnected || socket !== activeSocket || closedByClient) return
      try {
        onMessage(JSON.parse(event.data))
      } catch {
        onStatus('network-error')
      }
    })
  }

  connect()

  return {
    get socket() {
      return socket
    },
    send(message, id, visual) {
      if (socket.readyState !== (WebSocketImpl.OPEN ?? 1)) {
        throw new Error('Pi is not connected yet.')
      }
      socket.send(JSON.stringify({ type: 'prompt', id, message, visual }))
    },
    abort() {
      if (socket.readyState === (WebSocketImpl.OPEN ?? 1)) {
        socket.send(JSON.stringify({ type: 'abort' }))
      }
    },
    reconnect() {
      if (closedByClient) return false
      if (reconnectTimer !== null) clearTimeoutImpl(reconnectTimer)
      reconnectTimer = null
      reconnectAttempt = 0
      const previousSocket = socket
      socket = null
      previousSocket?.close()
      connect(true)
      return true
    },
    close() {
      if (closedByClient) return
      closedByClient = true
      if (reconnectTimer !== null) clearTimeoutImpl(reconnectTimer)
      reconnectTimer = null
      socket?.close()
      onStatus('closed')
    },
  }
}
