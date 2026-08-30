# Emotion Orbit Frontend and Design Audit

**Date:** 2026-08-31  
**Surface reviewed:** `http://127.0.0.1:5180/`  
**Method:** Rendered inspection, responsive checks, source review, console inspection, and frontend-design accessibility rubric.

## Skills and methodology

### Skills used

- **`frontend-design`** was the primary audit framework. It covers user and task fit, accessibility, information hierarchy, responsive behavior, performance, interaction states, maintainability, and rendered verification.
- **`emotional-3d-art`** was used to evaluate whether each emotion changes the visual system meaningfully through color, motion, deformation, glow, energy, and interaction rather than functioning only as a palette swap.
- **`control-in-app-browser`** was used to inspect and test the running application. The review was therefore based on the actual rendered site rather than source code or a static screenshot alone.

### Review methodology

#### 1. Product and visual review

The review evaluated:

- Clarity of the product purpose.
- Primary action and information hierarchy.
- Art-direction coherence.
- Emotional differentiation.
- Relationship between the chat and animated field.
- Typography, spacing, color, and focal composition.

#### 2. Responsive testing

The site was rendered at representative sizes:

- 320×700.
- 390×844.
- 652×722.
- The largest available desktop browser panel.

The checks covered element positions, dimensions, pointer-target sizes, canvas sizing, document overflow, navigation layout, and chat placement.

#### 3. Accessibility review

The `frontend-design` WCAG 2.2 Level AA checklist was applied to:

- Landmarks and semantic HTML.
- Accessible names and labels.
- Live regions and status announcements.
- Keyboard and focus implementation.
- Text and user-interface contrast.
- Pointer-target sizes.
- Reduced-motion behavior.
- Color-only communication.
- Mobile reflow.
- Loading, offline, error, busy, and success states.

The report does not claim WCAG conformance because a real screen reader, 200% zoom, forced-colors mode, and the complete keyboard workflow were not fully tested.

#### 4. Interaction-state testing

The live review checked:

- Switching between Wonder, Joy, and Anger.
- Active emotion states.
- Differences between visual transitions.
- Pi connection status.
- Chat input and send controls.
- Mobile and desktop navigation behavior.
- WebGL and network failure paths in the source.

#### 5. Source inspection

The following implementation files were reviewed:

- `src/main.js`.
- `src/style.css`.
- `src/emotions.js`.
- `src/pi-chat.js`.
- `src/liquid-experience.js`.
- Project configuration and file structure.

This connected rendered problems to concrete implementation causes rather than relying only on subjective impressions.

#### 6. Runtime health inspection

The runtime review verified:

- Canvas and viewport dimensions.
- Horizontal document overflow.
- Browser console warnings and errors.
- Continuous rendering behavior.
- Page-visibility pausing.
- Pixel-ratio and post-processing strategy.
- Reduced-motion implementation.

The resulting audit combines confirmed rendered defects, source-confirmed issues, design judgments, and explicitly identified unverified areas.

## Executive summary

Emotion Orbit is visually distinctive and technically stable, but the current interface hides too much of its concept. It succeeds as atmosphere, yet the user journey, emotional differentiation, accessibility, and failure handling need substantial work.

**Provisional score: 65/100.** Accessibility and state-completeness hard gates are not currently met.

| Area | Score | Assessment |
| --- | ---: | --- |
| User and task fit | 12/20 | The input is obvious, but what Pi does and what happens next are unclear. |
| Accessibility | 9/20 | Good semantic foundation, but contrast, status communication, live responses, and mobile error visibility need work. |
| Usability and hierarchy | 9/15 | Clean composition, but the primary concept and expected outcome are hidden. |
| Visual coherence | 13/15 | Strong palette, typography, restraint, and recognizable identity. |
| Responsive behavior | 8/10 | Fits from 320 to 927 px without overflow, though mobile typography becomes cramped. |
| Performance and resilience | 7/10 | Healthy live rendering, but the full-screen pipeline runs continuously without adaptive quality. |
| State completeness | 2/5 | Weak offline, error, retry, cancel, and degraded-rendering experiences. |
| Maintainability and verification | 5/5 | The implementation is compact, structured, and exposes useful debug state. |

## Critical and high-priority problems

### 1. The product purpose is visually hidden

The page contains a strong heading—“Let feeling take form.”—and descriptive emotion copy, but final CSS hides both on every viewport. Users only see “FORM & FLOW” and “What is moving through you?”

Evidence:

- `src/style.css:629`
- `src/main.js:19`

Impact:

- New users cannot tell whether this is art, journaling, emotional analysis, or an AI assistant.
- There is no visible explanation of how their message affects the field.
- The experience relies on discovery but provides too little feedback to make discovery satisfying.

Recommendation: restore a concise visible thesis near the input, such as: “Describe what you feel. Pi responds while the field translates your words into color and motion.”

### 2. Emotional states mostly change palette rather than visual language

Joy, Wonder, and Anger clearly change color and animation intensity, but retain nearly identical composition, topology, interaction, and focal structure. The current model maps emotions to palette, energy, fold depth, speed, and lens parameters in `src/emotions.js`.

Impact: the emotions feel like themed color grades rather than distinct embodied states.

Each emotion should alter several perceptual dimensions:

- **Joy:** buoyancy, outward expansion, quick light pulses.
- **Calm:** larger smooth forms, slower drift, low turbulence.
- **Love:** attraction, paired forms, warm internal glow.
- **Wonder:** orbital motion, depth opening, unexpected refraction.
- **Anger:** compression, sharp velocity changes, boundary pressure.
- **Melancholy:** downward drift, longer trails, quieter contrast.

### 3. Important status and safety copy is invisible

The “visual readings are interpretive” disclaimer and connection/error feedback live inside `.form-note`, but final CSS converts it into screen-reader-only content. On mobile, the visible “Pi connected/offline” text is also hidden, leaving only a colored dot.

Evidence:

- `src/style.css:698`
- `src/main.js:168`

Impact:

- Sighted users cannot see the interpretive-not-diagnostic disclaimer.
- Offline and error states are difficult to understand on mobile.
- A failed chat appears inert rather than recoverable.
- Mobile status is communicated through color alone.

Recommendation: keep a short visible status line below the input. Show explicit text such as “Pi offline — reconnecting…” and provide retry behavior.

### 4. Streaming responses are not announced properly

The chat container uses `role="log"` but explicitly sets `aria-live="off"` in `src/main.js:24`. Pi responses are appended incrementally, but assistive technology may receive no useful completion announcement.

Recommendation: keep streaming tokens quiet, then announce the completed response once through a dedicated polite live region. Do not announce every token.

### 5. Text is too small and some contrast is inadequate

Measured rendered sizes included:

- Desktop emotion labels: approximately 8.3 px.
- Eyebrow: approximately 8.3 px.
- Status: approximately 8.6 px.
- Chat response: approximately 11.8 px.
- Input: approximately 12.5 px.

Inactive emotion indices use 30% white over black, and the placeholder uses 42% white. These combinations are unlikely to meet the WCAG 2.2 AA 4.5:1 requirement for normal text.

Evidence:

- `src/style.css:174`
- `src/style.css:292`
- `src/style.css:398`
- `src/style.css:407`

Recommendation:

- Use at least 12–14 px for secondary UI text.
- Increase inactive-navigation and placeholder contrast.
- Preserve the restrained aesthetic through weight and spacing rather than extreme text reduction.

## Medium-priority problems

### Interaction hierarchy

The input is visually central, but the experience does not clearly communicate the result of submitting. The field changes immediately, Pi streams later, and the active navigation state changes to an emotion blend. These are three simultaneous outcomes without a clear causal explanation.

Show a lightweight transition label such as “Field shifting toward melancholy” near the canvas rather than hiding it in a live region.

### Incomplete chat controls

The client supports aborting a response, but the UI exposes no Stop button. There is also no:

- Retry action.
- Reconnect strategy.
- Resend action.
- Clear distinction between network failure and Pi failure.
- Visible busy indicator beyond a disabled button.

Evidence: `src/pi-chat.js:32`.

### No automatic WebSocket recovery

A closed socket changes status to offline and stays offline. Users must reload the page.

Evidence: `src/pi-chat.js:16`.

Add bounded exponential reconnection with visible status and a manual retry option.

### WebGL fallback throws after rendering its fallback message

The application inserts a WebGL error message and then rethrows the exception. This can leave an uncaught error and prevent the rest of the interface from initializing.

Evidence: `src/main.js:87`.

A resilient fallback should retain chat and emotion controls with a static or CSS-rendered background.

### Continuous GPU usage

The full-screen WebGL scene and four-pass composer render on every GSAP tick, even under reduced motion. Reduced motion lowers animation speed to 8%; it does not stop continuous rendering.

Evidence:

- `src/liquid-experience.js:24`
- `src/liquid-experience.js:210`

Positive: rendering pauses when the tab becomes hidden.

Recommendation:

- Render on demand when reduced motion is active.
- Add automatic quality reduction when sustained FPS drops.
- Reduce post-processing or pixel ratio on mobile and low-power devices.
- Handle WebGL context loss and recovery.

### The brand link is not a real destination

The home link points to `#`, which can alter the URL without providing meaningful navigation.

Evidence: `src/main.js:10`.

Use `/`, or make the brand non-interactive if there is only one view.

## Responsive findings

Confirmed at 320×700, 390×844, the default 652×722 panel, and the largest available browser panel:

- No horizontal document overflow.
- Canvas correctly fills the viewport.
- Chat and navigation do not overlap.
- Emotion controls meet approximately 44 px height.
- The 320 px layout technically fits.

Problems:

- “Melancholy” becomes cramped at 320 px.
- The mobile selector feels dense while the rest of the screen is extremely sparse.
- The chat panel sits around the vertical midpoint, but the emotional field has no focal object to justify the surrounding empty area.
- The header reduces connection status to an unlabeled dot.
- Fixed viewport height plus hidden overflow could clip content under larger text, localization, browser UI changes, or expanded chat states.

Evidence:

- `src/style.css:26`
- `src/style.css:711`

## What is working well

- The art direction is memorable and coherent.
- Color transitions are smooth and visibly distinct.
- The acid-green action color gives the interface a strong signature.
- Native buttons, textarea, form, navigation landmark, main landmark, labels, and pressed states provide a good semantic base.
- The decorative canvas is correctly hidden from accessibility APIs.
- Reduced-motion preference is detected and meaningfully reduces motion.
- Pointer targets are generally adequate.
- No console warnings or errors appeared during the live review.
- The inspected layouts had no horizontal overflow.
- The page pauses WebGL work when hidden.
- Emotion changes are announced through a polite live region.
- Long messages can wrap and the chat log is scrollable.

## Recommended remediation order

1. Restore a visible product thesis and explain the input-to-field relationship.
2. Make status, failure, and interpretive-disclaimer text visible.
3. Increase typography size and verify all foreground/background contrast pairs.
4. Give each emotion distinct motion and structural behavior.
5. Add reconnect, retry, and stop-response controls.
6. Announce completed Pi responses accessibly.
7. Add a static or degraded experience for missing WebGL.
8. Implement adaptive rendering quality and reduced-motion on-demand rendering.
9. Test 200% zoom, keyboard-only operation, a real screen reader, long chat content, offline mode, and WebGL loss.

## Verification boundaries

The review confirmed rendered behavior, representative responsive widths, source structure, canvas sizing, page overflow, emotional state changes, and live console health.

The following remain unverified:

- Real screen-reader behavior.
- Complete keyboard-only workflow.
- 200% text resize and browser zoom.
- Network throttling and reconnection behavior.
- GPU timing and sustained thermal behavior.
- Core Web Vitals.
- Forced-colors and operating-system high-contrast modes.
- Physical touch-device behavior.

A static or automated inspection cannot establish WCAG conformance or production performance by itself.
