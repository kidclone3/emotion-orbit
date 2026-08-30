# Emotion Orbit

Emotion Orbit is an interactive Three.js conversation that translates emotional language into color, light, analytic liquid folds, flow, and refraction while a local Pi coding agent replies over a streamed WebSocket bridge.

The visual reading is deterministic and interpretive; it does not claim to detect or diagnose a person's emotion.

## Run locally

```bash
npm install
pi --version
npm run dev
```

The server uses the Pi model/provider already configured on the machine. Set `PI_CHAT_PROVIDER` or `PI_CHAT_MODEL` before starting the server to override Pi's defaults. Each browser connection gets an isolated, non-persistent Pi RPC process with tools, skills, extensions, and repository context disabled.

Chat requests are unlimited only when they both originate from a loopback address and are addressed to `localhost`, `*.localhost`, `127.0.0.0/8`, or `::1`. All other requests are limited server-side to 5 prompts per rolling minute for each client IP. The in-memory limit survives WebSocket reconnects and resets when the server restarts.

Behind a trusted reverse proxy, set `TRUST_PROXY=1` so the limiter uses the first `X-Forwarded-For` address. Enable this only when the proxy overwrites that header; otherwise clients can spoof their rate-limit identity.

## Checks

```bash
npm test
npm run build
```

## Interaction

- Write a freeform message and press Enter to send; use Shift+Enter for a new line.
- Emotional language blends the liquid palette, energy, fold depth, flow speed, and refractive lens immediately while Pi streams its reply.
- Choose Joy, Calm, Love, Wonder, Anger, or Melancholy to tune the field directly.
- The liquid field remains ambient and does not track clicks or pointer movement.
- Sending a message adds a restrained visual pulse.

The scene respects `prefers-reduced-motion` and all controls are keyboard accessible.
