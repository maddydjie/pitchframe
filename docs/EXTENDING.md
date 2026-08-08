# Extending Pitchframe

What to change, where, and what not to.

## Before you add anything

Ask which of these it is:

| It is… | Where it goes |
|---|---|
| A different *camera move* | A shot in `lib/camera.ts` |
| A different *look* for an existing beat | A token in the theme generator |
| A different *motion curve* | A helper in `lib/motion.ts` |
| A different *colour* | `scripts/apply-palette.mjs` — never a component |
| A different *sound* | A voice in `scripts/gen-audio.mjs` |
| A different *thing to show* | **Almost certainly nothing. Read below.** |

## Adding a beat type is almost always wrong

The schema has five beat types because a launch video needs five. It had nine
once, four of them existed to show features, and the system produced a
90-second feature tour.

If you want a beat type so a plan can show one more thing, you are rebuilding
that. The honest answer to "we should also show X" is usually **a second video
with its own thesis**, not another beat in this one.

A new beat type is justified when it serves the *existing* structure in a way
none of the five can — the `logo` beat qualified because "the mark answers the
setup" is part of the launch shape, not an extra thing to show.

If you do add one:

1. Add the spec to `template/src/lib/types.ts` and to the `BeatSpec` union.
2. Write the component in `template/src/scenes/`.
3. Add the case in `template/src/LaunchVideo.tsx`.
4. **Document the schema in `skills/pitchframe-launch-video/SKILL.md`.** The
   agent generates against the skill, not the types. Skipping this means the
   feature exists and is never used.
5. Say in the skill when *not* to use it. Every beat type needs a stated limit,
   or plans will reach for it.

## Adding a camera shot

The cheap, safe extension. `SHOTS` in `template/src/lib/camera.ts`:

```ts
tilt_settle: {
  from: pose({ z: -380, rotX: 10, rotY: -25 }),
  to:   pose({ z: -90,  rotX: 4,  rotY: -13 }),
  over: [0, 0.8],
  perspective: 1900,
  easing: EASE,
},
```

Add an entry, then **list it in `skills/pitchframe-motion-language/SKILL.md`
with when to use it and when not to**. A shot the agent cannot read about is a
shot that never gets chosen.

Three things learned the hard way:

- **Pitch and yaw compound much faster than they look.** `rotX: 7` with
  `rotY: 13` made the panel read as a sheet of paper in flight. Past ~8°
  combined, a screenshot stops being readable — which defeats showing it.
- **Prefer `z` for drama.** A dolly reads as cinematic; rotation reads as a CSS
  demo. Depth is the effect, angle is the seasoning.
- **`over` should end before the beat does.** A move that runs the full length
  never settles, and a shot that never settles gives the viewer nowhere to
  look. 0.6–0.8 is the usual range; `orbit_hold` runs to 1.0 precisely because
  not settling is its job.

There is exactly **one camera system**. Before adding perspective or a 3D
transform anywhere else, don't — this repo had two once, they drifted, and the
shots stopped looking like they were filmed by the same person.

## Adding a sound

`scripts/gen-audio.mjs` synthesizes everything from scratch, so a new cue is a
new function returning a `Float32Array`, plus a case in `cuesFor()` deciding
when it fires.

The constraint that matters: **no `Math.random()`.** The noise generators use a
seeded LCG so that re-rendering the same plan produces a byte-identical file.
Randomness here means a video that quietly changes every time you render it.

Cues are *derived from the plan*, never authored into it. If you find yourself
wanting a `sound` field on a beat, the question to answer first is why the beat
type doesn't already imply it.

## Adding motion

All curves live in `template/src/lib/motion.ts`. Use the existing ones:

| Helper | For |
|---|---|
| `EASE` | The house curve. Default for everything. |
| `EASE_OUT` | Anything decelerating into place — cursor travel, camera moves |
| `EASE_EXIT` | Exits, which leave faster than entrances arrive |
| `entranceBlur` | 12px → 0 over 8 frames. Everything that arrives, arrives soft. |
| `heldDrift` | 2–3px over the beat, so a held shot never freezes |
| `clickPulse` | 1.0 → 0.85 → 1.0 over 6 frames |

**Springs, bounces and elastic curves are banned.** They read as template, not
film. This is not negotiable — it is the single clearest tell that separates the
reference videos from generated ones.

If you add a helper, put the *reason* for its numbers in the comment. Every
magic number in that file has one.

## Colours

**Never write a colour in a component.** The check:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\([0-9]' template/src --include=*.tsx
```

Only `theme.ts` may match, and it is generated.

Need a shade the theme doesn't expose? Add a derived token to
`scripts/apply-palette.mjs` so every future video gets it:

```js
export const SURFACE_RAISED = ${JSON.stringify(mix(SURFACE_BASE, TEXT, 0.14))};
```

Derive from the palette, never hardcode. A hardcoded grey looks fine against one
brand and wrong against the next.

## Changing the palette extraction

`scripts/extract-palette.mjs`. The ladder is ordered by *how much the source
knows*: a Tailwind config is a declaration, computed styles are an observation.
Don't reorder it.

When adding a heuristic, remember the two traps already found:

- **Frequency ranking surfaces `#0000ee`**, the browser's default unstyled-link
  colour. Blocklist UA defaults.
- **A declaration beats a count.** Some brands are only recoverable from a
  declared custom property such as `--color-blue`; no amount of counting
  painted pixels finds it.

Always re-run the two-product test after touching it:

```bash
cd template
node scripts/extract-palette.mjs --url https://example.com && node scripts/apply-palette.mjs
npx remotion still LaunchVideo out/a.png --frame=200
node scripts/extract-palette.mjs --url https://linear.app && node scripts/apply-palette.mjs
npx remotion still LaunchVideo out/b.png --frame=200
# a.png and b.png must differ
```

## Changing a skill

Skills are what the agent knows. Two rules:

**Keep the schema in sync.** `skills/pitchframe-launch-video/SKILL.md` documents
what `types.ts` enforces. They drift silently and fail at render time.

**Say when *not* to.** Every capability needs a stated limit. A skill that only
says what a thing does will see it used everywhere — that is how transitions
ended up on every cut before the "at most one or two" rule was written down.

## Changing a script

`scripts/` is the source. `template/scripts/` is a copy for local development,
because the scripts resolve `palette.json` relative to their own location and
need the installed layout to test against.

**Change one, copy to the other**, or your local run silently tests the old
version:

```bash
cp scripts/*.mjs template/scripts/
```

## Verifying a change

In order of speed:

```bash
cd template && npx tsc --noEmit                                  # seconds
npx remotion still LaunchVideo out/f200.png --frame=200          # ~15s
npx remotion render LaunchVideo output.mp4                       # ~60s
```

**Look at the frames.** Every bug that has cost real time in this project
rendered without error and was only visible in the output — an invalid gradient
that silently disabled the focus pull, a mask that blurred its own subject, a
capture that photographed a blank page. The typechecker cannot see any of them.
