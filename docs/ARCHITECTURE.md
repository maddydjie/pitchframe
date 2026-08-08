# Architecture

How Pitchframe is put together, and why.

## The shape of the thing

Pitchframe is a **plugin-first** system. The reasoning happens inside the
founder's Claude Code session; the npm package only installs things.

```
npx pitchframe install
        │
        ├──▶ ./pitchframe/          the Remotion project (template/)
        │      plan.json, palette.json, src/, scripts/, public/assets/
        │
        └──▶ ./.claude/
               skills/   what the agent knows, one directory per step
               agents/   subagent definitions — these pin the per-step model
               commands/ the /pitchframe slash command
```

That choice has consequences worth knowing:

- **Nothing in `bin/` calls a model.** The CLI is an installer.
- **The reasoning is visible** in the session the user is already in, rather than
  happening in a subprocess.
- **It costs the user's Claude Code subscription**, not a separate API key.
- The trade: a plugin can't pick a model per step on its own, which is why the
  four reasoning-heavy steps are dispatched to **subagents** that carry a
  `model:` field in their frontmatter.

## The pipeline

Nine steps. Each writes a file, and a failed step is retried alone.

| # | Step | Writes |
|---|---|---|
| 1 | Scout the live site | `.work/recon.json` |
| 2 | Fetch the real logo | `public/assets/logo.*` |
| 3 | Extract palette, choose the look | `palette.json` → `src/theme.ts` |
| 4 | **Direct** — write the script *(Opus)* | `script.json`, `.work/director.md` |
| 5 | Record what the script names *(Sonnet)* | `assets/<name>/*.jpg` + cursor track |
| 6 | **Voice it** | `public/audio/vo/*.wav`, `.work/voice.json` |
| 7 | **Cut the picture to the voice** | `plan.json` |
| 8 | Score it | `public/audio/*.wav` |
| 9 | Render *(Opus)* | `output.mp4` |
| — | Judge, on request | `.work/judgement.md` → edited `script.json` |

### The script is the spine

Step 4 decides everything — what is said, what is shown, which structure, which
palette, which music — and no later step re-decides any of it. Each line of
`script.json` carries **both halves at once**: the spoken sentence and the beat
spec shown under it. They are one decision, not two tracks aligned later.

Before the Director existed, structure was hard-coded ("five parts, in this
order, always") and every product got the same video with the colours swapped.
That was the single biggest design failure in the project's history.

### Audio leads, picture follows

Steps 6 and 7 are the order that matters, and it is not the intuitive one.

Nobody controls how long a spoken line takes. Plan the picture first and the
voice either overruns its beat or leaves dead air, and the error compounds. So
the voice is generated first, **measured**, and the measurements *become* the
beat lengths.

Maya returns raw PCM (16-bit LE, mono, 24kHz), so a clip's duration is
`bytes / (24000 × 2)` — exact. **Nothing has to listen to the audio to stay in
sync.** Sync is arithmetic.

One clip per line, never one file for the whole video: separate files make every
beat boundary exact by construction, and a line the judge rewrites costs one
regenerated clip instead of a re-edit.

### Data flow

```
codebase ─┐
          ├─▶ DIRECTOR ─▶ script.json ─▶ gen-voice ─▶ vo/*.wav + durations
recon ────┘                    │                            │
palette ──┘                    │                            ▼
logo ─────┘                    └──────────▶ plan-from-script ──▶ plan.json
                                                                     │
capture ─▶ assets/ ──────────────────────────────────────────────────┤
theme.ts ────────────────────────────────────────────────────────────┤
                                                                     ▼
                                                              LaunchVideo
                                                                     │
                                                                 output.mp4
                                                                     │
                                              JUDGE ◀────────────────┘
                                                │
                                                └──▶ edits script.json (loop)
```

## The scene plan

`template/src/lib/types.ts` is the contract; the schema is documented for the
agent in `skills/pitchframe-launch-video/SKILL.md`. **Change one and you must
change the other** — the agent generates against the skill, the renderer parses
against the types, and a drift between them fails at render time with a
confusing error.

Five beat types, deliberately few:

| Beat | Role |
|---|---|
| `typography` | Setup and payoff. Never narration. |
| `logo` | The brand mark landing, between setup and hero |
| `interaction` | **The hero moment.** Exactly one per video. |
| `ui` | A single establishing shot. Optional. |
| `cta` | The URL |

There is no beat type for "another feature". That is not an oversight: the
moment a schema can express a feature list, plans start containing one. An
earlier version had `feature`, `chapter`, `montage` and `stat` beats and
produced a 90-second feature tour — they were deleted.

Beats are contiguous — each starts where the previous ended, first at 0, last
ending exactly at `total_frames`. The composition adds its own 8-frame
cross-dissolve with a paired scale (outgoing drifts to 1.02, incoming settles
from 0.98), so plans must not build overlap in themselves.

## The interaction beat

`template/src/scenes/InteractionBeat.tsx`. Nine phases over a 240-frame
reference length, scaling to whatever the plan allots:

| Frames | Phase |
|---|---|
| 0–20 | Wide. 0.85 scale, target off-centre. |
| 20–40 | Cursor fades in, ~200px out from the target. |
| 40–90 | Cursor travels an eased arc; camera eases to 0.95 and pans toward it. |
| 60–90 | Focus pull dims everything but the target. |
| 90–96 | Click: cursor scale pulse 1.0 → 0.85 → 1.0, ripple ring. |
| 96–120 | Cinematic zoom to 1.3 on the zoom target. Depth of field opens. |
| 120–180 | The state change — cross-dissolve to the after-screenshot. |
| 180–210 | Zoom releases to 1.0. |
| 210–240 | Hold, then hand off. |

The phases **overlap on purpose**. Clean sequential stages read as a slideshow
of states; overlapping them reads as one continuous move.

The depth of field is a `backdrop-filter` under a radial mask, so the subject
stays sharp and the periphery falls away. Blurring the whole frame at the zoom
would make the wow moment the blurriest frame in the video.

## The palette pipeline

Three sources, strict priority, stop at the first that yields a brand colour:

1. **`tailwind.config.*` → `theme.extend.colors`** — a *declaration* of intent.
   Parsed, not executed: running arbitrary code from a repo you're making a
   video about is a bad trade for a few hex values.
2. **Global CSS custom properties** — `--primary`, `--accent`, `--brand`, and
   the bare `222 47% 11%` triplet shadcn writes.
3. **Computed styles on the deployed URL** — body background, largest heading,
   the biggest filled saturated CTA, and declared custom properties read off the
   live page.

Then `apply-palette.mjs` writes `src/theme.ts` with literals plus derived tokens
(`SURFACE`, `BORDER`, `TEXT_MUTED`, `SHADOW`, `GLOW`). Deriving those from the
palette rather than hardcoding greys is what makes a violet-branded product and
a green-branded one look like different videos.

It also fixes three things automatically, and logs each:

- A dark brand colour is **lightened** until it clears 4.5:1, not discarded.
- A light background is **forced dark** — the genre is dark; the hue is kept.
- Text that fails contrast on the final background is **flipped first**, before
  anything is derived from it.

## Capture

`scripts/capture.mjs` boots the dev server if nothing is serving, then drives
Playwright against a manifest at `.work/capture.json`. Three capture modes:

- **Plain** — a route, optionally `fullPage` or at a `scrollY`.
- **Interaction** — before frame, perform the action, after frame. Fails the
  shot if the two frames are identical.
- **Element** — a single element (the logo) at high DPI with a transparent
  background.

It is built so it **can never be the reason a run fails**: every failure is
caught, recorded in `.work/capture-result.json`, and exits 0. A partial capture
is a normal outcome — beats without screenshots render an abstracted surface.

Hard-won details are in [`../CLAUDE.md`](../CLAUDE.md#gotchas-that-have-already-cost-time).

## Rendering

Remotion, 1920×1080, 30fps, h264 CRF 16, ANGLE GL renderer (most reliable on
Windows for blur-heavy frames). A 22-second video renders in about a minute on a
modern laptop.

```bash
cd pitchframe && npx remotion render LaunchVideo output.mp4
```
