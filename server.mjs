import { createServer } from 'node:http'
import { attachChatWebSocketServer } from './server/chat-server.js'
import { createProductionRequestHandler } from './server/http-app.js'

const isDevelopment = process.argv.includes('--dev')
const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '5173', 10)
const trustProxy = process.env.TRUST_PROXY === '1'
const httpServer = createServer()

if (isDevelopment) {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    mode: 'server',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  })
  httpServer.on('request', vite.middlewares)
} else {
  httpServer.on('request', createProductionRequestHandler())
}

const chatServer = attachChatWebSocketServer(httpServer, {
  trustProxy,
  rejectUnknownUpgrades: !isDevelopment,
})
httpServer.listen(port, host, () => {
  console.log(`Emotion Orbit listening on http://${host}:${port}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  const forceExit = setTimeout(() => process.exit(1), 3000)
  let pendingClosures = 2
  function markClosed() {
    pendingClosures -= 1
    if (pendingClosures !== 0) return
    clearTimeout(forceExit)
    process.exit(0)
  }

  httpServer.close(markClosed)
  chatServer.close(markClosed)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
