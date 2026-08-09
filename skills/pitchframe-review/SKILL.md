---
name: pitchframe-review
description: Inspect a rendered Pitchframe video — run the deterministic checks, then look at the sampled frames — and repair at most one round of findings before archiving. Used by Pitchframe after the render.
---

# Reviewing the render

Nothing in this pipeline used to examine its own output. Every hard-won entry
in CLAUDE.md's gotcha list is a bug that rendered without error and only
appeared in the video. This step is the missing feedback channel.

## Run it

```bash
node pitchframe/scripts/inspect.mjs --project pitchframe
```

Writes `.work/inspection.json` and `.work/frames/*.png`. **Exits 0 always** — a
post-render check that blocks a founder from a finished video is the wrong
trade.

If it warns that ffmpeg is unavailable, the static checks still ran and the
frame half was skipped. Say so once; do not treat it as a clean review.

## Then look at the frames

Read every PNG in `.work/frames/`. The metrics cannot answer the question this
step exists for: **does this read as one moment, or as a tour?** Nor can they
tell you that type is sitting on a busy part of a screenshot, that the logo
landed off-centre, or that the payoff arrives after the viewer has already
understood the point.

Each frame carries its `why` in `inspection.json` — a beat midpoint, a cut
boundary, the hero's before/after pair. Judge it against what the plan says
should be happening there.

## Repair, once

Findings carry a `target` naming the field to edit. Fix `severity: "fail"`
findings by editing `script.json` and re-cutting, or by editing the named plan
field directly when the fix is a framing number rather than a line.

**One pass.** Then archive whatever you have and report by name anything left
unfixed. An unattended repair loop optimises toward whatever the checker
rewards, which is not the founder's taste — the same reason the judge is
manual and one-shot.

**Do not verify a fix with a single re-render.** Renders are only nearly
deterministic; one run in three differs by ~150 bytes on a static frame. Re-run
`inspect.mjs` and compare findings, not bytes.

## What each finding means

| Check | What went wrong |
|---|---|
| `contiguity` | A beat starts where the previous one did not end |
| `one_hero` | Two distinct recordings — two hero moments, neither proven |
| `hero_share` | The hero is under 30% of the runtime |
| `hero_shots` | The hero is held on too few framings for its length |
| `payoff` | No typography beat after the hero |
| `contrast` | Type below its threshold on its own surface — invisible in the video |
| `chrome_framing` | `bleed` and `macos` chrome — the bleed is silently discarded |
| `zoom_blur` | Blur running with the lens disabled |
| `colour_literal` | A colour written outside `theme.ts` |
| `blank_frame` | A sampled frame has almost no luminance variance |
| `subject_blur` | The subject is blurrier than its own periphery |
| `hero_static` | The before and after frames are the same — the product did nothing |

## What this step is not

It is not the judge. `/judge-vc` and `/judge-user` are the founder's, run after
watching, and they rewrite lines for taste. This step catches defects — the
things that are wrong regardless of taste.
