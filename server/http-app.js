import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { isLocalRequestHost } from './chat-server.js'

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]

function securityHeaders(host) {
  const connectSource = isLocalRequestHost(host)
    ? `connect-src 'self' ws://${host}`
    : "connect-src 'self'"
  return {
    'Content-Security-Policy': [...CSP_DIRECTIVES, connectSource].join('; '),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }
}

function writeHead(request, response, status, headers = {}) {
  response.writeHead(status, { ...securityHeaders(request.headers.host), ...headers })
}

export function createProductionRequestHandler({ distRoot = resolve('dist') } = {}) {
  const root = resolve(distRoot)
  const rootPrefix = `${root}${sep}`

  return async function handleProductionRequest(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      writeHead(request, response, 405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
      response.end()
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      writeHead(request, response, 400, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      })
      response.end('Bad request')
      return
    }

    if (pathname === '/healthz') {
      const body = JSON.stringify({ status: 'ok' })
      writeHead(request, response, 200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
      return
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname
    let filePath = resolve(root, `.${requestedPath}`)
    if (!filePath.startsWith(rootPrefix)) {
      writeHead(request, response, 403, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      })
      response.end('Forbidden')
      return
    }

    try {
      const file = await stat(filePath)
      if (!file.isFile()) throw new Error('Not a file')
    } catch {
      filePath = join(root, 'index.html')
    }

    const isHtml = filePath.endsWith('.html')
    writeHead(request, response, 200, {
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath).pipe(response)
  }
}
