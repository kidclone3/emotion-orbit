# 001 — Liquid Emotion Orbit

## Decision

Decide whether the supplied editorial references can become Emotion Orbit's full-viewport visual direction without production architecture: one procedural Three.js field must create broad moving folds and a cropped, refractive liquid-glass body while preserving monochrome interface legibility across desktop and mobile.

The cost of being wrong is committing the production scene and chat surface to a visual mechanism that only works in one still frame or collapses under responsive layout.

## Question

Given Three.js 0.185.1 and one full-screen fragment shader, when the supplied editorial direction is rendered and exercised across target viewports, then a single deterministic field should produce lit liquid folds, a glass-like absorbed bulge, legible monochrome controls, and emotion-driven motion without scene reconstruction.

| # | Given | When | Then | Risk |
|---|---|---|---|---|
| 1 | Three.js 0.185.1 and one full-screen fragment shader | the study renders at 2560×1080, 1440×1024, and the 1059×1121 reference aspect | one filtered field creates green/amber folds and a dimensional absorbed bulge without chromatic UI controls or one-pixel lighting scratches | High |
| 2 | the same shader and DOM overlay | the browser is dragged from 1568×900 to a 784×900 half window, restored, and separately rendered at 390×844 | resize events coalesce to rendered commits, the drawing buffer stays populated, composition changes continuously with aspect, and no overflow appears | High |
| 3 | deterministic input, seed, time, and emotional palettes | a feeling is submitted or a named state is selected | palette, fold energy, live status, and selected state change without rebuilding the scene | Medium |
| 4 | named height, normal, and specular causes | diagnostic views are enabled | each controlling field is separately inspectable and the final image still reads with the baseline treatment disabled | Medium |

## Approach

### Field contract

```text
stable screen coordinates + seed
  → shared advected domain warp
  → broad fold + cross-fold + ribbon height
  → derivative normal + valley + specular + Fresnel causes
  → green/amber surface identity
  → refracted-coordinate bulge + thickness absorption + rim response
```

Height, normals, valleys, specular response, palette identity, distortion, and motion consume the same field bundle. The bulge adds a sphere-derived normal, thickness-based absorption, and Fresnel/rim response without allocating an additional render target.

### Visual contract

- Subject: broad folded liquid media beneath one immense absorbed glass-like body, cropped beyond the top and right frame.
- Interface: white/gray editorial chrome only; color is confined to canvas media.
- Camera: fixed orthographic full-screen plane; no perspective dependency.
- Motion: patient advected folds with explicit smooth phases; simulation steps clamp to 33.333ms after dropped frames, and only a static subpixel dither remains in the presentation path.
- Reproducibility: default seed `7`; `?freeze=1&time=2.75` freezes the authored frame.
- Quality tiers: `?quality=low`, default balanced, and `?quality=high`; balanced DPR uses a continuous aspect-derived cap from `1.25–1.6`, remains fixed during active resizing, and recomputes once 150ms after the window settles.
- Dynamic resize: native and `visualViewport` events coalesce to one drawing-buffer commit per animation frame; every changed buffer is rendered immediately, and the orb center interpolates by aspect instead of jumping at a width breakpoint.
- Diagnostics: `?debug=height`, `?debug=normals`, and `?debug=specular`, or press `D` to cycle.
- Baseline: `?baseline=1` removes the vignette and CSS presentation overlay; no post-processing or render targets are used.

## How to Run

From the repository root:

```bash
rtk npm run dev
```

Open:

```text
http://127.0.0.1:5173/spikes/001-liquid-emotion-orbit/?freeze=1&time=2.75&seed=7
```

The study uses the repository's installed `three@0.185.1`; it has no additional package or credential requirement.

### Interaction

- Submit freeform text with **Enter** or the **Send** pill; **Shift+Enter** retains a newline.
- Select one of the six named emotional fields.
- Drag the canvas to offset the field.
- Press **Left/Right** to step through emotional states.
- Press **D** to cycle final, fold-height, surface-normal, and specular-field views.
- Append query parameters for fixed evidence views.

## Evidence

Captured browser evidence and the observation manifest live under `evidence/`. `window.__spike.getState()`, `window.__spike.getMetrics()`, `window.__spike.getResizeState()`, and `window.__spike.sampleTemporalStability()` expose deterministic state, resize commits, frame timing, and live fixed-pixel temporal measurements.

- `desktop-final.png`: 1440×1024 authored frame; zero horizontal overflow and no page errors.
- `ultrawide-final.png`: filtered 2560×1080 final material; no visible dotted contours, no overflow, and no page errors.
- `ultrawide-normals.png` and `ultrawide-specular.png`: band-limited normal and footprint-attenuated highlight diagnostics at 2560×1080.
- A 305,868-point ultrawide luminance-gradient probe measured maximum neighboring delta `0.030256`; zero sampled points exceeded `0.08` or `0.12`.
- `boundary-crop.png`: the lower 200px of a live 1568×900 frame after broadening the bulge transition; the former horizontal contour is replaced by a continuous dark fade.
- `half-window.png`: live 784×900 half-window state after a ten-step resize burst; canvas and CSS bounds both resolved to 784×900 with no overflow, cracks, or cleared frame.
- `reference-frame.png`: 1059×1121 frame matching the supplied reference's aspect, using stress seed `41` at fixed time `7.5`.
- `mobile-final.png`: 390×844 responsive frame; zero horizontal overflow, fully contained form, and an 88×44px send target.
- `desktop-anger.png`: the submitted phrase “I am furious and frustrated” selected anger, changed the moving field target, updated live status and selected-state semantics, and cleared the input.
- `desktop-baseline.png`: the historical capture shows the folded surface and editorial composition with the then-present CSS and shader grain, overlay treatment, and vignette disabled.
- `desktop-height.png`, `desktop-normals.png`, and `desktop-specular.png`: clean diagnostic views of the height, derivative-normal, and lighting causes.
- `tablet-stress-seed41.png`: seed 41 at 1024×768 preserves the composition and produces no horizontal overflow.
- `temporal-sequence.png`: six live canvas samples from `0–1500ms` show continuous fold displacement.
- A 12-frame live probe after specular filtering sampled nine fixed canvas points: shader time was monotonic from `3.0061` to `3.3583`, mean RGB step was `0.000119`, and peak RGB step was `0.000290`.
- A full→half burst emitted 20 resize notifications but only 10 changed-buffer commits after initialization; its settled state was `pending: false`. Restoring through ten widths kept every sampled center pixel populated with alpha `255`.
- During the ultrawide 2560×1080→1280×1080→2560×1080 regression, the half-width eight-frame probe recorded monotonic shader time, mean RGB step `0.000104`, and peak RGB step `0.000290`.
- At device-pixel ratio `2`, the 784×900 half window settled to DPR `1.40338`, a 1100×1263 drawing buffer, zero overflow, and a populated center pixel with alpha `255`; restoring to DPR `1` settled back to an exact 1568×900 buffer.
- Reduced-motion emulation matched, reduced CSS transition durations to `0.00001s`, retained the slowed shader mode, and produced no mobile overflow.

The headless Chromium run used software WebGL and missed a 60fps frame budget. Simulation time therefore clamps each rendered advance to 33.333ms; this prevents dropped frames from becoming large visual jumps. The CPU samples remain an environment constraint, not GPU timing or a production performance claim.

## Investigation Trail

- The first implementation uses a shader-owned screen field rather than adapting production orbit geometry. This keeps the experiment disposable and tests the reference's actual mechanism: a singular fluid media field under silent editorial UI.
- The canvas is full-screen and the interface is semantic DOM. This separates visual feasibility from chat transport and keeps input, keyboard, and responsive behavior directly inspectable.
- The first diagnostic capture exposed that the editorial CSS overlay contaminated field inspection. Debug and baseline modes disable that overlay so their captures show the underlying shader causes.
- The liquid-glass revision replaced the original soft color orb with a shared advected height field, derivative normals, coupled lighting, and a thickness-absorbed bulge. It deliberately models the reference's opaque oil/silk character rather than claiming physically complete transparent glass.
- The first reported flicker traced to a temporal grain hash keyed by `floor(time * 11.0)`. A later hardware report exposed a second interference source: the static `0.018` shader grain and a separate CSS `feTurbulence` layer were both pixel-scale signals, so DPR scaling and soft-light compositing could turn them into visible digital traces. The CSS layer is removed and the shader now uses only a static `1/255` interleaved dither; fold phases still advance through the capped simulation clock.
- The initial “two screenshots differ” check proved activity but not stability. The spike now records fixed-point color steps and a six-frame temporal contact sheet.
- The sharp horizontal contour was the oversized bulge's lower edge. The old mask ended over `0.033` normalized units, its rim used an exponential width of `74`, and the conditional branch stopped while the rim still contributed. The mask now blends over `0.18`, the rim uses a Gaussian width of `0.07`, and the branch exits only at radial distance `1.16`, after both contributions are negligible.
- Half-window cracking traced to synchronous `setPixelRatio` and `setSize` calls on every resize notification, plus a DPR cap and orb center that jumped at `700px`. Resizing now coalesces through `requestAnimationFrame`, keeps DPR stable during the drag, renders immediately after a buffer change, settles quality after 150ms, and derives composition continuously from aspect.
- Widescreen scratches first traced to resolution-amplified normals and narrow highlights. The attempted footprint filter then introduced `dFdx`/`dFdy` calls over a normal already derived with `dFdx`/`dFdy`; those higher-order screen derivatives are undefined across fragment implementations and explain the backend-specific broken segments and flicker that the recorded captures missed. The current shader derives perceptual roughness from the first-order normal slope and uses broader surface and glass lobes without nested derivatives.

### What worked

- All four observable hypotheses held in the captured desktop, tablet, and mobile runs.
- The final surface retained the reference's singular chromatic media gesture while every control remained monochrome.
- Height, normal, and specular diagnostics expose the mechanism behind the folds, and the baseline reads without post treatment.
- Deterministic seed, time, emotional palette, baseline, and diagnostic controls produced reproducible evidence.
- The live temporal probe measured monotonic shader time, sub-`0.0006` peak RGB steps at nine fixed points, static subpixel dither, and a 33.333ms simulation-step cap.
- A live 1568×900 canvas-row probe over the lower 33% measured a maximum adjacent sampled-row luminance step of `0.001601`; `boundary-crop.png` shows no isolated horizontal contour.
- At 2560×1080, the final, normal, and specular captures remain continuous; a 305,868-point gradient probe found no neighboring luminance deltas above `0.08`.
- The full→half→full run ended with exact drawing-buffer/viewport agreement, zero overflow, no page errors, fewer commits than resize notifications, and nonzero alpha at every sampled intermediate width.

### What did not

- The earlier validation did not establish cross-GPU portability: it missed undefined higher-order derivatives that could remain smooth on the capture backend while breaking into unstable quad-sized segments elsewhere. The current browser confirmation is clean, but the originally affected physical GPU remains the final portability check.

### Constraints and surprises

- Software-WebGL CPU samples were slower than a 60fps frame budget on desktop and tablet; they cannot predict hardware GPU time.
- The stylized bulge uses a single-pass refracted coordinate, Beer-Lambert-inspired absorption, and Fresnel response. That is sufficient for the opaque reference but is not a closed-volume optical simulation.
- The stability probe measures representative fixed pixels and contact-sheet continuity; it is not a substitute for GPU profiling or a long-duration video regression on representative hardware.

### Recommendation

Keep the full-screen shader media layer and semantic chat chrome split. If this direction moves to production, profile GPU time on representative hardware first; only adopt a two-pass transmission path if later art direction requires visibly transparent glass rather than the current opaque liquid-silk response.

## Verdict: READY FOR HARDWARE RECHECK

The earlier `VALIDATED` verdict was too broad. The shader contained undefined higher-order screen derivatives in its specular filter, and the presentation stacked two pixel-scale noise sources, so clean captures from one backend did not prove portable temporal behavior. After replacing the derivative filter, removing the CSS turbulence layer, and reducing shader noise to a static `1/255` dither, a bounded confirmation at 1440×1024 and 390×844 produced no page errors or horizontal overflow; the desktop 12-sample, 180×128 full-frame probe recorded peak temporal acceleration `2/255` and zero jumps at or above `12/255`. Recheck the originally affected physical GPU before production adoption.
