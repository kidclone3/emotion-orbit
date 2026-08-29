# Emotion Orbit

Emotion Orbit is an interactive Three.js conversation that translates emotional language into color, light, shape, surface motion, and particle behavior while a local Pi coding agent replies over a streamed WebSocket bridge.

The visual reading is deterministic and interpretive; it does not claim to detect or diagnose a person's emotion.

## Run locally

```bash
npm install
pi --version
npm run dev
```

The server uses the Pi model/provider already configured on the machine. Set `PI_CHAT_PROVIDER` or `PI_CHAT_MODEL` before starting the server to override Pi's defaults. Each browser connection gets an isolated, non-persistent Pi RPC process with tools, skills, extensions, and repository context disabled.

## Checks

```bash
npm test
npm run build
```

## Interaction

- Write a freeform message and press Enter to send; use Shift+Enter for a new line.
- Emotional language blends the visual palette, energy, motion, and silhouette immediately while Pi streams its reply.
- Choose Joy, Calm, Love, Wonder, Anger, or Melancholy to tune the field directly.
- Drag the egg with a mouse, pen, or touch gesture to rotate it; release to keep a short inertial spin.
- Tap/click without dragging, or focus the field and press Enter/Space, to add a short energy burst.

The scene respects `prefers-reduced-motion` and all controls are keyboard accessible.
