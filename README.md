# Emotion Orbit

Emotion Orbit is an interactive Three.js experience that translates emotional states into color, light, surface motion, and particle behavior.

It intentionally does not claim to detect a person's emotion. People choose one of six states or enter common mood language such as “peaceful,” “furious,” or “nostalgic.”

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Checks

```bash
npm test
npm run build
```

## Interaction

- Choose Joy, Calm, Love, Wonder, Anger, or Melancholy.
- Enter a related mood in the text field to map it to a visual state.
- Drag the egg with a mouse, pen, or touch gesture to rotate it; release to keep a short inertial spin.
- Tap/click without dragging, or focus the field and press Enter/Space, to add a short energy burst.

The scene respects `prefers-reduced-motion` and all controls are keyboard accessible.
