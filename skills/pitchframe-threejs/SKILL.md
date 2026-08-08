---
name: pitchframe-threejs
description: Use when a beat carries the video's one signature 3D moment — a rotating brand mark, a device mockup, or an ambient particle field. Applied as a `three_d` treatment on an existing beat, never as a beat type of its own, and at most once per video. Loaded by the code-generation step only when the plan contains a `three_d` field.
---

# Three.js inside Remotion

Three.js composes with Remotion cleanly, because it has no clock of its own —
you call `render()` when you want a frame, which is exactly Remotion's model.
`@remotion/three`'s `<ThreeCanvas>` wires that up.

## It is a treatment, not a beat type

`three_d` goes **on an existing beat**:

```json
{ "id": 3, "type": "logo", "frames": [165, 255],
  "three_d": { "template": "rotating_logo", "props": { "turns": 1 } } }
```

A rotating mark is the **logo beat** in 3D. A device mockup is the **ui beat**
in 3D. A particle field composes *underneath* a beat and is not a shot at all.
None is a new thing to show, which is the bar a new beat type has to clear —
and keeping them as treatments leaves the "exactly one interaction beat, hero
≥30% of frames" arithmetic untouched.

## Reach for one by default on the logo beat

**Three.js sat unused for its whole existence** — built, wired to the schema,
and no plan ever asked for it. The skills said "you may"; nothing said "you
should", so nothing did. That is now the default:

> **If `.work/logo.json` reports a real mark, put
> `three_d: {"template": "rotating_logo"}` on the logo beat.**

The condition is nearly always met — `fetch-logo.mjs` pulls a declared asset
(inline SVG, manifest icon, real `<img>` source) from almost any site. It costs
about 13 seconds of render for a 3-second beat, which is the cheapest signature
moment available.

Skip it when the mark is a wide wordmark: a wordmark turning edge-on is
unreadable for half the beat, and legibility is the only reason to show a mark.
`logo.json` reports `is_wordmark`.

If there is no logo beat, `particle_field` under the CTA is the fallback — it
composes underneath rather than replacing anything, and it is the cheapest of
the three.

## When it is justified

Any of these holds:

1. **There is a CTA or logo beat and a real logo asset.** A slow-turning mark
   is high impact and the cheapest of the three.
2. **The product is the device** — a mobile app, a hardware product — where
   seeing UI in a hand-held object says something a flat screenshot cannot.
   For desktop software the window chrome on the interaction beat already does
   this job, more honestly and much more cheaply.
3. **The thesis is about depth or space.** Rare, and real when it happens.

If none applies, stay in 2D. A signature moment that is not signature is just
an expensive frame.

**At most one per video, and the critique pass enforces it.** The reason is
attention, not cost — a video with two signature moments has none. This holds
even though the measured cost turned out low (below).

## Render cost — measured, not estimated

On this machine, 1920×1080, ANGLE renderer, a slab with three lights:

| | Per frame |
|---|---|
| 2D frame | **172 ms** |
| 3D frame | **321 ms** |

**1.9×, not the order of magnitude usually assumed.** A 3-second 3D beat adds
about **13 seconds** to a render; a 20-second video goes from roughly 113s to
126s.

Two caveats. Cost scales with what is in the scene — shadows, post-processing
or a high-poly model change this completely, which is why the rules below cap
scene complexity. And these numbers came from a *warm* cache: the first render
after adding Three.js pays a one-time bundling and shader-compilation cost of
roughly 15–20 seconds. Measure warm, or the number is meaningless.

## The three templates

Reach for these first; build custom Three.js only if none fit.

| Component | What it is | Beat |
|---|---|---|
| `RotatingLogo3D` | Lit slab carrying the brand mark, oscillating ±38° | `logo` |
| `Device3D` | Low-poly phone or laptop, screenshot as texture, slow dolly | `ui` |
| `ParticleField` | Sparse additive points at varying depth | composes under `cta` |

`RotatingLogo3D` turns rather than spins on purpose: a flat plane rotating on Y
passes edge-on and vanishes for several frames, which reads as a glitch. It is
a slab so it has an edge to catch the key light, and it never exceeds ±38° so
the mark stays readable — the only reason to show a mark.

## Rules

1. **Every animated value derives from `useCurrentFrame()`.** No
   `requestAnimationFrame`, no delta time, no elapsed clock.
2. **No `Math.random()` anywhere.** Use a seeded PRNG — see `ParticleField`.
   Random placement gives a different result per render, and because frames
   render in parallel, potentially per *frame*, which strobes.
3. **No OrbitControls.** Camera position is a function of the frame.
4. **No physics.** Non-deterministic under seeking.
5. **No procedural geometry per frame.** Build once in `useMemo`.
6. **Under 10k triangles.** All three templates are far under.
7. **No shadows unless the shot needs them.** They multiply cost.
8. **No external models.** A runtime `.glb` download breaks offline rendering.
9. **Textures load through `useThreeTexture`**, which uses `delayRender`.
   Suspense-based loaders let Remotion photograph the fallback.
10. **Canvas must be transparent** — `gl={{ alpha: true }}` — or it punches an
    opaque rectangle through the beat's surface and the video's grade.

## Anti-patterns

- Several animated objects competing for attention. One object, one idea.
- A 3D beat that duplicates a 2D one — a flat mark and a lit slab of the same
  mark is two logos, and the beat exists because there is one.
- Reaching for `Device3D` on desktop software. The window chrome is better.
- Physically-based rendering, subsurface scattering, volumetrics. The genre is
  a dark frame with one light source in it.

## Failure mode to plan for

**Headless WebGL can fail outright on some machines.** The composition already
forces the ANGLE renderer, which is the reliable path on Windows, but a 3D beat
should degrade to its 2D equivalent rather than failing the render. Every
template falls back on its own: a missing texture renders a plain brand-coloured
slab or a lit blank screen, never a hole.
