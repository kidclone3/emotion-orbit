import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import { attachChatWebSocketServer } from './server/chat-server.js'

const isDevelopment = process.argv.includes('--dev')
const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '5173', 10)
const trustProxy = process.env.TRUST_PROXY === '1'
const httpServer = createServer()

if (isDevelopment) {
  const vite = await createViteServer({
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  })
  httpServer.on('request', vite.middlewares)
} else {
  const distRoot = resolve('dist')
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }

  httpServer.on('request', async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname)
    } catch {
      response.writeHead(400)
      response.end('Bad request')
      return
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname
    let filePath = resolve(join(distRoot, requestedPath))
    if (!filePath.startsWith(`${distRoot}/`)) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }

    try {
      const file = await stat(filePath)
      if (!file.isFile()) throw new Error('Not a file')
    } catch {
      filePath = join(distRoot, 'index.html')
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath).pipe(response)
  })
}

const chatServer = attachChatWebSocketServer(httpServer, { trustProxy })
httpServer.listen(port, host, () => {
  console.log(`Emotion Orbit listening on http://${host}:${port}`)
})

function shutdown() {
  chatServer.close()
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 3000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
