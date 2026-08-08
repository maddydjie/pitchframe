---
name: pitchframe-editing
description: Edit an already-generated Pitchframe launch video from a natural-language request — timing, colours, text, the hero moment's framing — then re-render. Use when a pitchframe/plan.json exists and the user asks to change the video rather than make a new one.
---

# Editing a generated video

The output of Pitchframe is not an MP4. It is a Remotion project that happens
to have rendered one. That is the point: the founder edits their launch video
the same way they edit their app.

**Do not re-run the generation pipeline for an edit.** No positioning, no
re-planning, no re-capture. The founder accepted this plan; changing one colour
should not put it back up for debate. Edits land in 15–90 seconds.

## Where each kind of edit lives

| The founder says | You change | File |
|---|---|---|
| "make the accent purple" | `accent` (and `primary`) | `palette.json`, then re-run `apply-palette.mjs` |
| "hold the hero moment longer" | that beat's `frames`, then reflow | `plan.json` |
| "zoom on the field that changed instead" | that beat's `zoom_target` | `plan.json` |
| "the cursor should click the other button" | `target_element.coordinates` | `plan.json` |
| "change the payoff to X" | that beat's `text` / `accent_word` | `plan.json` |
| "make it shorter" | cut a beat, reflow, update `duration_seconds` + `total_frames` | `plan.json` |
| "use a different screenshot" | `before_screenshot` / `after_screenshot` | `plan.json` |
| "add a flash on that cut" | that beat's `transition` | `plan.json` |
| "make the text bigger" | `fontSizeFor()` | `src/scenes/TypographyBeat.tsx` |
| "slow the whole thing down" | `EASE` / fade durations | `src/lib/motion.ts` |
| "tone down the glowing borders" | `intensity` on `GlowBorder` | `src/components/Panel.tsx` |
| "the click should be punchier" | `clickPulse` | `src/lib/motion.ts` |

Almost every real request is `plan.json` or `palette.json`. Reach for a
component only when the request is about the *system* rather than this video.

## Colour edits

Change `accent` in `palette.json` and re-run:

```bash
node pitchframe/scripts/apply-palette.mjs
```

Then re-render. Do not edit `theme.ts` — it is generated and the next run
overwrites it. Do not edit colours inside components; the next edit will fight
this one.

## Timing edits and the reflow rule

Beats are contiguous: each starts where the previous ended, and the last ends
exactly at `total_frames`. Change one beat's length and every later beat moves.

**"Hold the hero longer" with the duration fixed.** Add frames to the hero,
then take them back from setup first, then from any UI beat — **never from the
payoff**. Rewrite every subsequent `frames` pair so the chain stays contiguous.

**"Hold the hero longer" and let it run longer.** Add the frames, shift every
later beat by the same amount, update `duration_seconds` and `total_frames`.

Re-check after any timing edit:

- No typography beat under 45 frames.
- `beats[last].frames[1] === total_frames`.
- **The hero beat is still ≥ 30% of `total_frames`.** This is the one that
  quietly breaks: adding a beat or extending the setup pushes the hero below
  the floor, and the video drifts back toward a demo without anyone deciding to.

## Adding and removing beats

**Adding.** Ask first whether the new beat serves the thesis. A request for
"one more thing to show" is a request for a demo, and the honest answer is to
say so and offer the alternative — a second video with its own thesis.

If it does serve the thesis: insert it, take its frames from setup, renumber,
and re-check the hero floor.

**Removing.** Delete, redistribute to the payoff and the hero, renumber, and
read the remaining typography aloud to check it still argues something.

**Never add a second interaction beat** unless the thesis genuinely has
multi-beat structure. Two hero moments means neither gets proven.

## Re-rendering

```bash
cd pitchframe && node scripts/gen-audio.mjs && npx remotion render LaunchVideo output.mp4
```

Required for any change to `plan.json`, `theme.ts`, assets, or components.

**`gen-audio.mjs` is not optional when frame numbers moved.** The sound is
derived from the plan — cues land on the frames the edit cuts on, including the
frame the mouse went down. Re-time a beat without re-scoring and the click
sound stays where the old edit was, which reads as the whole video being out of
sync rather than as one stale effect.

Changes to look, colour or camera only — no frame numbers touched — can skip it.

## Motion requests

Most "make it look better" asks are camera, not content. Load
`pitchframe-motion-language`; it has the translation table. The short version:
"more cinematic" usually means `shot: "push_in_reveal"` *and removing* effects,
and "it feels flat" usually means the beat has no camera move at all.

For iterating on look rather than content, `npx remotion studio` gives a
scrubbable preview — worth mentioning when they are on their third colour.

## Reporting an edit

One or two lines. What changed, and that it is rendered.

```
Hero moment now holds 12s (was 8s); setup trimmed to keep the total at 20s.
Hero is 60% of the video. Re-rendered → ./pitchframe/output.mp4
```

If you made a judgment call they did not specify — which beat lost frames, what
you cut — name it in a clause. They will care about that choice.
