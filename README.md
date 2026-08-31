# Emotion Orbit

Emotion Orbit is an interactive Three.js conversation that translates emotional language into color, light, analytic liquid folds, flow, and refraction while an isolated Pi agent streams a reply.

The visual reading is deterministic and interpretive. It does not detect, diagnose, or treat a person's emotion or replace crisis or medical support.

## Self-host with Docker Compose

The supported production path is one Compose service containing the built frontend, Node/WebSocket server, and Pi CLI. It binds only to host loopback, creates no volumes, and stores no conversations or visual state.

### Prerequisites

- Docker Engine or Docker Desktop with Compose v2
- A modern WebGL-capable browser
- Credentials for a provider and model supported by the bundled Pi CLI

No host Node.js or Pi installation is required. The image pins Node 22.22.0 and Pi 0.84.4.

### First run

```bash
git clone <repository-url>
cd emotion-orbit
cp .env.example .env
```

Edit `.env`:

```dotenv
PI_CHAT_PROVIDER=zai
PI_CHAT_MODEL=glm-5.1
PI_CHAT_API_KEY=your-provider-key
EMOTION_ORBIT_PORT=5173
```

Then build and start in the foreground so configuration failures stay visible:

```bash
docker compose up --build
```

Open `http://localhost:5173`. If `EMOTION_ORBIT_PORT` changes, use that port instead.

### Provider credentials

`PI_CHAT_API_KEY` works for providers that accept one API key. Providers requiring multiple or provider-native variables can place the variables recognized by Pi in the same dedicated `.env` and leave `PI_CHAT_API_KEY` empty. For example, AWS or Azure deployments may require their normal Pi-supported environment variables.

Emotion Orbit passes provider, model, and credentials to the pinned Pi interface. It does not maintain a separate provider map and does not claim that every upstream provider/model combination is continuously tested.

Never commit `.env`. Compose injects it only when the container starts; Docker does not copy it into the image.

## Operations

```bash
# Optional background start
docker compose up --build -d

# Service health and published port
docker compose ps

# Runtime and provider diagnostics
docker compose logs -f emotion-orbit

# Stop
docker compose down

# Update a clean checkout
git pull --ff-only
docker compose up --build -d

# Remove obsolete containers; there are no application volumes
docker compose down --remove-orphans
```

The application is intentionally localhost-only. Do not change the port binding to `0.0.0.0` or expose it through a reverse proxy; LAN or public hosting requires authentication, TLS, and a separate security design.

## Privacy and session behavior

- Emotion Orbit does not persist prompts, replies, conversations, or visual state.
- Refreshing, disconnecting, or recreating the container starts a clean session.
- Prompts and the current validated visual label/colors leave the machine through Pi and the configured model provider.
- Provider processing and retention follow that provider's terms.
- Application logs contain lifecycle and provider/model diagnostics, not conversation content or credentials.
- Pi runs with sessions, tools, skills, extensions, and repository context disabled.

## Interaction

- Write a freeform message and press Enter to send; use Shift+Enter for a new line.
- Emotional language blends the liquid palette, energy, fold depth, flow speed, and refractive lens immediately while Pi streams its reply.
- Choose Joy, Calm, Love, Wonder, Anger, or Melancholy to tune the field directly.
- Sending a message adds a restrained visual pulse.
- The scene respects `prefers-reduced-motion`; all controls are keyboard accessible.

## Troubleshooting

### Configuration exits immediately

The startup log names a missing `PI_CHAT_PROVIDER`, `PI_CHAT_MODEL`, built asset, or Pi executable. Recheck `.env`, then rebuild:

```bash
docker compose up --build
```

When `PI_CHAT_API_KEY` is empty, startup uses `pi auth check` for provider-native credentials. Add the required upstream variables to `.env`.

### Provider rejects a prompt

Invalid or expired credentials, an unavailable model, quota exhaustion, and upstream rate limits appear in the chat error state. The container remains healthy because `/healthz` checks the local runtime, not a paid provider request.

```bash
docker compose logs -f emotion-orbit
```

### Port is already in use

Choose another loopback port:

```dotenv
EMOTION_ORBIT_PORT=55173
```

If `docker compose ps` reports healthy and the app responds inside the container but localhost connections reset, repair or restart the Docker daemon's local port-forwarding/firewall integration. Do not work around it by publishing on every interface.

### Blank or degraded visual

Use a current browser with WebGL enabled. Check its console for GPU/WebGL errors. Reduced-motion mode intentionally limits animation but does not remove the interface.

### Complete shutdown

```bash
docker compose down --remove-orphans
```

No database or volume cleanup is necessary.

## Contributor development

Native development uses the host Node.js and Pi configuration:

```bash
npm install
pi --version
npm run dev
```

`PI_CHAT_PROVIDER` and `PI_CHAT_MODEL` may override the host Pi defaults. Development still creates isolated, non-persistent Pi RPC processes.

Run the repository checks:

```bash
npm test
npm run build
```

## License

MIT. See `LICENSE`.
