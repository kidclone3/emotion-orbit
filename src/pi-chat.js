export function chatSocketUrl(pageLocation = globalThis.location) {
  const protocol = pageLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${pageLocation.host}/chat`
}

export function createPiChatClient({
  WebSocketImpl = globalThis.WebSocket,
  url = chatSocketUrl(),
  onMessage = () => {},
  onStatus = () => {},
} = {}) {
  onStatus('connecting')
  const socket = new WebSocketImpl(url)

  socket.addEventListener('open', () => onStatus('online'))
  socket.addEventListener('close', () => onStatus('offline'))
  socket.addEventListener('error', () => onStatus('error'))
  socket.addEventListener('message', (event) => {
    try {
      onMessage(JSON.parse(event.data))
    } catch {
      onStatus('error')
    }
  })

  return {
    socket,
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
    close() {
      socket.close()
    },
  }
}
