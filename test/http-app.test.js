import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, before } from 'node:test'
import { createProductionRequestHandler } from '../server/http-app.js'

let distRoot
let origin
let server

before(async () => {
  distRoot = await mkdtemp(join(tmpdir(), 'emotion-orbit-http-'))
  await mkdir(join(distRoot, 'assets'))
  await writeFile(join(distRoot, 'index.html'), '<!doctype html><title>Emotion Orbit</title>')
  await writeFile(join(distRoot, 'assets', 'app.js'), 'console.log("ready")')

  server = createServer(createProductionRequestHandler({ distRoot }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) {
    server.close()
    await once(server, 'close')
  }
  if (distRoot) await rm(distRoot, { recursive: true, force: true })
})

test('reports structural health without configuration details', async () => {
  const response = await fetch(`${origin}/healthz`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('hardens static responses and preserves cache semantics', async () => {
  const index = await fetch(`${origin}/`)

  assert.equal(index.status, 200)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  assert.equal(index.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(index.headers.get('x-frame-options'), 'DENY')
  assert.equal(index.headers.get('referrer-policy'), 'no-referrer')
  const csp = index.headers.get('content-security-policy')
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /style-src-attr 'unsafe-inline'/)
  assert.ok(csp.includes(`connect-src 'self' ws://${new URL(origin).host}`))
  assert.doesNotMatch(csp, /ws:\/\/(?:localhost|127\.0\.0\.1):\*/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
  assert.match(index.headers.get('permissions-policy'), /camera=\(\)/)

  const asset = await fetch(`${origin}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.match(asset.headers.get('cache-control'), /immutable/)
})

test('serves the SPA fallback without caching it', async () => {
  const response = await fetch(`${origin}/conversation/deep-link`)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-cache')
  assert.match(await response.text(), /Emotion Orbit/)
})

test('supports HEAD and rejects state-changing HTTP methods', async () => {
  const head = await fetch(`${origin}/`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')

  const post = await fetch(`${origin}/`, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
})
