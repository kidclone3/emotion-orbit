# Self-Hosted Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Preserve the user's existing uncommitted liquid-experience changes; do not reset, stash, or commit them.

**Goal:** Deliver one localhost-only Docker Compose service containing the built Emotion Orbit frontend, Node/WebSocket server, and pinned Pi CLI, with truthful configuration, health, security, CI, and operator documentation.

**Architecture:** A multi-stage image builds Vite assets and runs the existing Node server plus one ephemeral Pi RPC child per WebSocket connection. Compose injects a dedicated `.env`, binds only host loopback, and provides process init, bounded restart, graceful stop, and structural health checks. No database, volume, host Pi, image registry, remote access, authentication, or persistence is added.

**Tech Stack:** Node.js 22, native Node test runner, Vite 8, Three.js, `ws`, Docker Engine/Compose v2, `@earendil-works/pi-coding-agent` 0.84.4, GitHub Actions.

## Global Constraints

- One `compose.yaml`, one service named `emotion-orbit`, one container.
- Build from the clone; do not publish an image.
- Publish only `127.0.0.1:${EMOTION_ORBIT_PORT:-5173}:5173`.
- Require `PI_CHAT_PROVIDER` and `PI_CHAT_MODEL`; support `PI_CHAT_API_KEY` plus arbitrary Pi provider-native variables from `.env`.
- Keep chat, emotion mutation, visual rendering, accessibility, reduced-motion, WebSocket wire messages, and ephemeral session behavior unchanged.
- Keep Pi flags `--no-session`, `--no-tools`, `--no-skills`, `--no-extensions`, and `--no-context-files`.
- Never log or persist prompts, replies, keys, bearer tokens, or complete Pi payloads.
- Keep `TRUST_PROXY` disabled in Compose.
- Do not reset, stash, overwrite, or broadly stage the existing dirty worktree.
- Do not make implementation commits; several target files already contain user work, so commits would mix ownership.

---

## Phase 1: Runtime Contracts

**Outcome:** The production HTTP server exposes structural health and hardened static responses, Vite is development-only at runtime, and Pi receives explicit provider/model/API-key configuration without changing its isolation or wire protocol.

### Task 1: HTTP and Pi Runtime Boundaries

**Load-bearing:** Yes — changes the production HTTP/security contract and Pi credential interface; dependent tasks: Task 2, Task 3, Task 4.

**Dependencies:** None

**Files:**
- Create: `server/http-app.js`
- Create: `test/http-app.test.js`
- Modify: `server.mjs`
- Modify: `server/pi-rpc.js`
- Modify: `server/chat-server.js`
- Modify: `test/chat-server.test.js`
- Modify: `test/pi-rpc.test.js`

**Interfaces:**
- Produces: `createProductionRequestHandler({ distRoot?: string }): (request, response) => Promise<void>` in `server/http-app.js`.
- Produces: `buildPiArgs(environment?: NodeJS.ProcessEnv): string[]`; defaults to `process.env`.
- Preserves: `/chat` WebSocket wire messages while extending `attachChatWebSocketServer` with injectable `logger` and `createConnectionId` options for content-free lifecycle logging.
- Produces: `GET`/`HEAD /healthz` with minimal `{ "status": "ok" }` JSON and the same security headers as static responses.
- Consumes later: Docker health check calls `http://127.0.0.1:5173/healthz`.

- [ ] **Step 1: Add failing Pi argument tests**

Extend `test/pi-rpc.test.js` with explicit environments:

```js
test('passes explicit provider, model, and generic API key to Pi', () => {
  const args = buildPiArgs({
    PI_CHAT_PROVIDER: 'openai',
    PI_CHAT_MODEL: 'gpt-4o-mini',
    PI_CHAT_API_KEY: 'test-secret',
  })

  assert.deepEqual(args.slice(-6), [
    '--provider', 'openai',
    '--model', 'gpt-4o-mini',
    '--api-key', 'test-secret',
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
    '--provider', 'amazon-bedrock',
    '--model', 'claude-sonnet',
  ])
})
```

- [ ] **Step 2: Run the focused RPC tests and confirm the new contract fails**

Run: `rtk node --test test/pi-rpc.test.js`

Expected: the explicit environment is ignored and at least the API-key assertion fails.

- [ ] **Step 3: Implement the Pi argument contract**

Change `buildPiArgs` to accept `environment = process.env`, append provider then model when non-empty, and append `['--api-key', environment.PI_CHAT_API_KEY]` only when non-empty. Keep every isolation flag and the system prompt unchanged. `createPiRpcSession` continues to call `buildPiArgs()` and passes `process.env` to the child.

- [ ] **Step 4: Run the focused RPC tests**

Run: `rtk node --test test/pi-rpc.test.js`

Expected: all RPC tests pass.

- [ ] **Step 5: Add failing lifecycle logging and shutdown coverage**

Extend the chat harness so its fake session records `close()` calls and it can inject a logger. Add a test that connects, sends a prompt containing a unique private marker, closes the socket, and asserts the session closed exactly once while serialized log arguments contain the anonymous connection ID but not the prompt marker:

```js
test('closes each Pi session and logs lifecycle without conversation content', async () => {
  const records = []
  const harness = await createChatHarness({
    logger: { info: (...args) => records.push(args), error: (...args) => records.push(args) },
  })
  const socket = await harness.connect('localhost')
  socket.send(JSON.stringify({ type: 'prompt', id: 'private', message: 'PRIVATE-MARKER' }))
  socket.close()
  await once(socket, 'close')

  assert.equal(harness.closedSessionCount(), 1)
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE-MARKER/)
  assert.match(JSON.stringify(records), /connection/i)
  await harness.close()
})
```

- [ ] **Step 6: Implement content-free connection lifecycle logs**

Extend `attachChatWebSocketServer` options with `logger = console` and `createConnectionId`, defaulting to a short random UUID-derived ID. Log connection open/close, Pi process error, and Pi exit code/signal with that ID. Never pass the prompt, visual payload, reply delta, credential environment, raw Pi event, or captured stderr to the logger. Keep client-facing wire messages unchanged and make session close idempotent.

- [ ] **Step 7: Add failing HTTP behavior tests**

Create `test/http-app.test.js`. Use `mkdtemp`, `writeFile`, `createServer`, `fetch`, and cleanup hooks to serve a temporary `dist` containing `index.html` and `assets/app.js`. Cover:

```js
test('reports structural health without configuration details', async () => {
  const response = await fetch(`${origin}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('hardens static responses and preserves cache semantics', async () => {
  const index = await fetch(`${origin}/`)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  assert.equal(index.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(index.headers.get('x-frame-options'), 'DENY')
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  assert.match(index.headers.get('permissions-policy'), /camera=\(\)/)

  const asset = await fetch(`${origin}/assets/app.js`)
  assert.match(asset.headers.get('cache-control'), /immutable/)
})

test('supports HEAD and rejects state-changing HTTP methods', async () => {
  const head = await fetch(`${origin}/`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')

  const post = await fetch(`${origin}/`, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
})
```

- [ ] **Step 8: Run the focused HTTP tests and confirm the module is missing**

Run: `rtk node --test test/http-app.test.js`

Expected: failure because `server/http-app.js` does not exist.

- [ ] **Step 9: Extract the production request handler and harden responses**

Implement `createProductionRequestHandler` by moving the current production static-file behavior from `server.mjs` into `server/http-app.js`. Requirements:

- Resolve `distRoot` once and prevent path traversal.
- Preserve SPA fallback to `index.html`.
- Preserve `GET` and `HEAD`; reject other methods with 405.
- Handle `/healthz` before static resolution and return only `{ "status": "ok" }`.
- Preserve `no-cache` for HTML and one-year immutable caching for built assets.
- Include correct types for HTML, CSS, JavaScript, JSON, SVG, PNG/JPEG/WebP, and WOFF/WOFF2.
- Apply `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`, and a CSP with self-only scripts/styles/assets, no objects/base/frame ancestors, and localhost/127.0.0.1 WebSocket connectivity.
- Return 400 for malformed request URLs without crashing the server.

Update `server.mjs` to import this handler. Replace the eager static Vite import with `await import('vite')` only inside the development branch. Keep chat attachment and shutdown behavior intact.

- [ ] **Step 10: Run runtime tests and build**

Run:

```bash
rtk node --test test/http-app.test.js test/pi-rpc.test.js test/chat-server.test.js
rtk npm run build
```

Expected: all focused tests pass and Vite production build succeeds.

---

## Phase 2: Single-Container Delivery

**Outcome:** A clean clone builds and starts one non-root, loopback-only Compose service with the frontend, Node server, and pinned Pi CLI; structural misconfiguration fails before the server listens.

### Task 2: Docker and Compose Runtime

**Load-bearing:** Yes — establishes the secret, host-network, image, health, and process-lifecycle boundary; dependent tasks: Task 3, Task 4.

**Dependencies:** Task 1

**Files:**
- Create: `Dockerfile`
- Create: `docker-entrypoint.sh`
- Create: `compose.yaml`
- Create: `.dockerignore`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `GET /healthz` from Task 1.
- Consumes: `PI_CHAT_PROVIDER`, `PI_CHAT_MODEL`, optional `PI_CHAT_API_KEY`, and provider-native environment variables.
- Produces: Compose service `emotion-orbit` and loopback URL `http://localhost:${EMOTION_ORBIT_PORT:-5173}`.
- Produces: image containing exact Node 22 and `@earendil-works/pi-coding-agent@0.84.4`, running as user `node`.

- [ ] **Step 1: Verify exact base image and local Compose capability**

Run:

```bash
rtk docker manifest inspect node:22.22.0-bookworm-slim
rtk docker compose version
```

Expected: the exact Node image exists and Compose v2 is available. If the exact patch tag does not exist, select the newest existing exact Node 22 patch tag and use that exact value in the Dockerfile and README.

- [ ] **Step 2: Add the startup script**

Create executable `docker-entrypoint.sh` using POSIX `sh`, `set -eu`, and these checks in order:

```sh
: "${PI_CHAT_PROVIDER:?PI_CHAT_PROVIDER is required}"
: "${PI_CHAT_MODEL:?PI_CHAT_MODEL is required}"
test -f dist/index.html || { echo "dist/index.html is missing; rebuild the image." >&2; exit 1; }
pi --version
printf 'Emotion Orbit provider=%s model=%s\n' "$PI_CHAT_PROVIDER" "$PI_CHAT_MODEL"
if [ -z "${PI_CHAT_API_KEY:-}" ]; then
  pi auth check --provider "$PI_CHAT_PROVIDER" --model "$PI_CHAT_MODEL" --json >/dev/null
fi
exec node server.mjs
```

Do not print any credential variable.

- [ ] **Step 3: Add the multi-stage Dockerfile**

Use the verified exact Node 22 slim tag for both stages. Builder: `WORKDIR /app`, copy package metadata, `npm ci`, copy only build inputs, and `npm run build`. Runtime: install locked production dependencies plus exact global Pi package, copy `dist`, `server.mjs`, `server/`, and the executable entrypoint, set `NODE_ENV=production`, use `USER node`, expose 5173, and run the entrypoint. Do not use build arguments for runtime configuration or credentials.

- [ ] **Step 4: Add Compose and environment contracts**

Create one `compose.yaml` service:

```yaml
services:
  emotion-orbit:
    build: .
    init: true
    env_file: .env
    environment:
      HOST: 0.0.0.0
      PORT: 5173
      TRUST_PROXY: 0
    ports:
      - "127.0.0.1:${EMOTION_ORBIT_PORT:-5173}:5173"
    restart: "on-failure:3"
    stop_grace_period: 5s
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:5173/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 5s
```

Create `.env.example` with provider/model, empty generic API key, host-port override, and comments for provider-native variables. Add `.env` to `.gitignore` without ignoring `.env.example`.

- [ ] **Step 5: Minimize the Docker build context**

Create `.dockerignore` excluding Git/worktrees, `.env`, `node_modules`, `dist`, docs, tests, spikes, screenshots, root design/reference images, and current unreferenced `fonts/`, `images/`, and `shaders/`. Keep `src/`, `public/`, `index.html`, Vite config, package metadata, and production server files.

- [ ] **Step 6: Validate the Compose contract with dummy structural credentials**

If no user `.env` exists, create a temporary ignored `.env` containing:

```dotenv
PI_CHAT_PROVIDER=openai
PI_CHAT_MODEL=gpt-4o-mini
PI_CHAT_API_KEY=not-a-real-key
EMOTION_ORBIT_PORT=5173
```

Run:

```bash
rtk docker compose config
rtk docker compose build
rtk docker compose up -d --wait
rtk docker compose ps
```

Expected: one healthy `emotion-orbit` service; published port starts with `127.0.0.1:`. Do not call the provider in this step.

- [ ] **Step 7: Exercise health, static delivery, and shutdown**

Run Node-based HTTP assertions against `/healthz` and `/`, then:

```bash
rtk docker compose down --remove-orphans
```

Expected: minimal health JSON, complete HTML, required security headers, and clean container removal. Delete only a temporary dummy `.env`; never alter an existing user `.env`.

---

## Phase 3: Release Contract

**Outcome:** CI validates the one-container product without secrets, and a stranger can install, operate, update, and troubleshoot it from the repository under MIT terms.

### Task 3: CI, Documentation, and License

**Load-bearing:** No

**Dependencies:** Task 2

**Files:**
- Create: `LICENSE`
- Modify: `README.md`
- Move/replace: `.github/workflows/deploy-pages.yml` → `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Compose commands, variables, health endpoint, and service name from Tasks 1-2.
- Produces: documented self-hosting contract and validation-only GitHub Actions workflow.

- [ ] **Step 1: Replace Pages deployment with validation-only CI**

Rename the workflow to `ci.yml`; trigger on pull requests, pushes to `main`, and manual dispatch. Retain checkout, Node 22 setup, `npm ci`, tests, and build. Add steps that create a non-secret CI `.env`, run `docker compose config`, build, `docker compose up -d --wait`, assert health/static/security headers and loopback publication, and always run `docker compose down --remove-orphans`. Remove all Pages permissions, environment, artifact upload, and deployment actions.

- [ ] **Step 2: Add the MIT license**

Create `LICENSE` using the standard MIT text and `Copyright (c) 2026 Emotion Orbit contributors`.

- [ ] **Step 3: Rewrite the README around Compose**

Preserve the product description, interpretive-not-diagnostic disclaimer, interaction guide, and contributor test/build commands. Make Docker Compose the primary path and document:

- Docker Engine/Desktop with Compose v2 and a modern WebGL-capable browser.
- Clone, `.env` creation, provider/model, generic key, and provider-native credential alternatives.
- Foreground first run and loopback URL/port override.
- Status, background start, logs, stop, update, and orphan cleanup commands.
- One-container/localhost/ephemeral/provider-pass-through support boundary.
- Prompt/provider data leaving the machine and upstream retention terms.
- Troubleshooting for configuration, auth readiness, invalid keys, quota, port conflicts, health, logs, WebGL, and shutdown.
- Native npm/Pi setup only under contributor development.

Do not document LAN/public exposure, persistence, registry pulls, or unsupported provider guarantees.

- [ ] **Step 4: Validate docs and CI references against real files**

Run targeted searches for stale Pages deployment language, stale host-first startup instructions, wrong service names, and wrong variable names. Run `rtk git diff --check` over the implementation paths.

Expected: no stale deployment contract and no whitespace errors.

---

## Phase 4: Integrated Acceptance

**Outcome:** The current liquid experience runs through the one-container production path with clean runtime behavior, responsive rendering, truthful provider errors, and no regressions in the existing test/build contract.

### Task 4: End-to-End Verification and Cleanup

**Load-bearing:** No

**Dependencies:** Tasks 1, 2, and 3

**Files:**
- Verify all changed files.
- Remove only temporary verification artifacts created by this plan.

**Interfaces:**
- Consumes: complete runtime, Compose, CI, and documentation contracts.
- Produces: verification evidence; no new application interface.

- [ ] **Step 1: Run the complete code verification gate**

Run:

```bash
rtk npm test
rtk npm run build
rtk git diff --check
```

Expected: all tests pass, Vite build succeeds, and no whitespace errors. The accepted existing Vite chunk-size warning is not a failure.

- [ ] **Step 2: Run the clean Compose smoke gate**

With a temporary dummy `.env` only when no user `.env` exists:

```bash
rtk docker compose config
rtk docker compose build
rtk docker compose up -d --wait
rtk docker compose ps
```

Assert one healthy service, non-root runtime identity, exact Pi version, loopback port publication, minimal `/healthz`, static app delivery, required security headers, and no credential value in logs or image history. Do not print the `.env` or inspect secret-bearing process arguments.

- [ ] **Step 3: Browser-verify the actual containerized surface**

Open the Compose URL in Chromium and verify desktop 1440×900 and mobile 390×844:

- Current liquid visual renders rather than a fallback or blank canvas.
- No horizontal overflow, console errors, or page errors.
- Keyboard-accessible controls and reduced-motion behavior remain available.
- A prompt using the dummy key reaches the real containerized `/chat` path and produces a truthful provider/auth error rather than a fake reply.
- Refresh creates a clean ephemeral session.

- [ ] **Step 4: Verify shutdown and orphan cleanup**

Close the browser socket and run:

```bash
rtk docker compose down --remove-orphans
```

Expected: the service exits inside the grace period and no Compose container remains. Delete the temporary dummy `.env` only if this plan created it.

- [ ] **Step 5: Run real-provider acceptance when credentials are already available through a user-owned `.env`**

If a pre-existing user `.env` supplies valid container credentials, start Compose and send one real prompt, confirming streamed deltas and completion. Never extract, copy, print, or synthesize credentials from host Pi configuration. If no such `.env` exists, report this single external acceptance item as unexecuted while completing every structural, provider-error, and browser check above.

- [ ] **Step 6: Final scope review**

Confirm no implementation added accounts, remote exposure, persistence, databases, volumes, telemetry, provider maps, visual changes, or container publishing. Report exact verification results and the real-provider prerequisite, if any.
