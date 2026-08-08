---
name: pitchframe-critique
description: Adversarially evaluate a Pitchframe scene plan against its brief — above all whether it is a launch video or a demo — and rewrite the failing beats, producing the final plan.json. Used by Pitchframe step 5, max two revision passes.
---

# Self-critique

The agent does not generate blindly. It validates its own plan before rendering.

You are reading `pitchframe/.work/plan.draft.json` against `pitchframe/brief.json`
and writing the survivor to `pitchframe/plan.json`.

## Read it as an opponent

You wrote the draft. That is the problem — you will want to defend it. Take the
other side deliberately: your job is to find the beat that does not earn its
place and cut it, not to explain why each one is fine.

Judge only what is on screen. "The founder will understand it" is no defence;
the viewer is a stranger who gave you twenty seconds.

## The launch-vs-demo test — run this first

**Fail the plan if any of these is true.** These are not weighted alongside the
storytelling checks; they *are* the checks. A plan that fails one of them is the
wrong genre, and no amount of beat-level polish fixes a genre error.

### 1. More than one interaction beat

Unless `thesis_weight` is `two-part` or `three-beat` **and** the draft names why
the second moment is necessary. Two hero moments almost always means the thesis
was really two theses and neither got proven.
→ Cut the weaker one. Give its frames to the survivor and the payoff.

### 2. A beat that does not visibly serve the thesis or set up the hero moment

Read `video_thesis`, then each beat. A beat that would still make sense in a
different company's video is filler. **Feature-list beats that snuck in are the
most common failure mode** — they arrive disguised as "context" or "one more
thing worth showing".
→ Cut it and redistribute its frames.

### 3. The hero moment gets under 30% of total frames

Count the interaction beat's frames against `total_frames`. Under 30% means the
video is treating its spine as a feature, which means it has drifted back into
demo territory.
→ Extend the hero beat, taking frames from setup first, then from any UI beat.
Never from the payoff.

### 4. The video ends without a payoff beat

A payoff is what makes the hero moment feel like a claim rather than a
screenshot. A CTA is not a payoff.
→ Add one. Take the frames from setup.

### 5. The runtime exceeds what the thesis earns

Check the length against `thesis_weight`: `single` → 15–25s, `two-part` → 25–45s,
`three-beat` → 45–90s. A 90-second video with a one-sentence thesis is a demo.
→ Cut beats until the runtime matches. Shortening is always available and always
correct; if every beat earns its place and the video is still too long, the
thesis was mis-weighted and the fix is upstream.

## Then the storytelling checks

6. **Is the payoff earned?** The claim must have been *shown*, not asserted. If
   the payoff says "nobody typed that" and no beat shows a field filling itself,
   the payoff is unearned. → Fix the hero moment to chase the proof; soften the
   payoff only if the footage genuinely cannot support it.

7. **Does the setup make the moment matter?** A cold open that could precede any
   product's video is doing nothing. → Rewrite it against the thesis.

8. **Pacing.** No typography beat under 45 frames. Beats contiguous, first at 0,
   last ending exactly at `total_frames`.

9. **Accents.** At most one accent word per beat, at most 3 accented beats, each
   `accent_word` a verbatim substring of its `text`.

10. **Does the opening earn the next two seconds?** "In today's world", "Meet
    <product>" — generic scene-setters waste the only moment where attention is
    free. → Rewrite as the first line of the actual argument.

## Then the motion checks

These run after capture, because two of them need the recording. They are the
difference between a plan that is structurally correct and a video that looks
like one.

11. **Emphasis budget.** At most two beats carrying a `transition` other than
    `dissolve`, and at most one `snap_zoom` in the whole video. Emphasis is
    subtractive: three loud moments means none of them is loud.
    → Reduce to `dissolve` everywhere except the logo beat.

12. **Footage stretch.** For a beat with a `recording`, compare its length to
    `frame_count` in `capture-result.json`. Outside roughly 0.6×–1.6× the speed
    change stops reading as pacing and starts reading as broken.
    → Resize the beat to the recording and re-space everything after it.

13. **Legibility under the camera.** A beat the viewer has to *read* — anything
    with text they must follow — must not be on `tilt_settle`, `orbit_hold` or
    `raking_pass`, which never come square. → `push_in_reveal`, or
    `locked_off`.

14. **The hero is one shot.** A hero over ~8 seconds with no `shots` array, or
   with every shot on the same framing, fails. This is the most common and most
   damaging failure in the whole rubric — it is what makes three videos for
   three different products look like one video recoloured. → Cut it: wide →
   the action → punch in on the consequence → pull back, cutting every 1–3
   seconds. All shots come from the same recording, so it costs no capture.

15. **Two close-ups in a row**, or a shot over ~120 frames with no camera move.
   The first loses the viewer's place, the second stalls. → Alternate wide and
   tight; give a long shot a `shot` that moves.

16. **A crop under ~25% width.** The recording is 1920px, so a 20% crop is 384
   source pixels blown up to fill the frame and it will be visibly soft. →
   Widen the crop, or pick a denser region.

17. **`bleed` on a product whose UI lives at the edges.** Bleed crops several
   percent off every side; a toolbar or sidebar near an edge disappears and the
   shot becomes empty content with no product in it. Canvas tools, editors and
   IDEs are this shape. → `contained` or `chrome` to establish, `closeup` to go
   tight.

17a. **The hero is `contained`.** Unless the viewer genuinely needs to see the
   whole application at once, this is wrong — a screenshot centred in a card
   with margin on all four sides is the clearest signal that a video was
   generated. → `bleed`, or `closeup` with a crop on the element the moment is
   about.

18. **An invented label.** Every string in a `render` shot must appear in
   `.work/recon.json`. A rebuilt component carrying the product's real words is
   truthful; one carrying words you wrote is a lie that renders beautifully. →
   Use the real label, or film the shot instead.

19. **The hero moment is drawn.** Supporting shots may be drawn; the hero may
   not. It is the proof, and a drawing of a product proving something proves
   nothing. → Film it.

20. **Surface rhythm.** More than two bright beats (`mesh` or `light`), two
   bright beats adjacent, or a bright surface on the hero moment. All three
   cost more than they give: the first two spend the contrast that makes
   brightness mean something, the third stops the product being the brightest
   thing on screen. → Dark setup, dark hero, bright payoff.

21. **The hero fell back to stills.** If capture reports the recording failed
    and the beat is on `before_screenshot`/`after_screenshot`, that is a
    degraded video, not a finished one. → Say so in one line at the end, and
    name the fix: a working selector, or a route that does not need auth.

22. **Motion polish.** Is the hero moment an `interaction` beat? A `ui` beat
   standing in for the hero is a static shot where the proof should be — the
   thesis gets asserted instead of shown. → Convert it, or capture the
   interaction the thesis is actually about.

23. **A real mark and no signature moment.** If `.work/logo.json` reports a
   non-wordmark asset and no beat carries a `three_d` treatment, the plan left
   the cheapest signature moment on the table. → Add `rotating_logo` to the
   logo beat, or name why the video is better without it. (This check exists
   because Three.js was built and then never once invoked.)

24. **3D discipline.** At most one `three_d` treatment in the whole plan. If
   there are two, keep the one that is genuinely a signature moment — a mark
   landing, a product revealed — and drop the other to 2D. Ask what the 3D is
   *for*: a rotating logo on the CTA earns it; a device mockup of desktop
   software does not, because the window chrome already says "real product"
   more honestly and much more cheaply.

**Re-run `node pitchframe/scripts/gen-audio.mjs` after any frame-number
change.** The audio is derived from the plan, so a re-timed beat with stale
cues puts the click sound in the wrong place — which reads as the whole video
being out of sync.

## Revising

- **Maximum two passes.** After pass 2, whatever you have is final. An unpolished
  plan that renders beats a perfect plan that never does.
- Rewrite only what failed. Churning beats that passed is how a critique loop
  makes a plan worse.
- Re-run the arithmetic after every structural change. Cutting a beat means
  redistributing its frames, not leaving a gap.
- If a rewrite needs a screenshot capture has no route for, don't plan it.

If the first pass genuinely finds nothing, you did not read it adversarially —
go back to the thesis and check each beat against it word by word. If a second
honest read still finds nothing, record that and stop. Manufacturing a change to
look diligent is worse than passing a good plan through.

## Output

Write the revised plan to `pitchframe/plan.json`, and the reasoning to
`pitchframe/.work/critique.md`:

```markdown
# Critique pass 1

**Genre check** — FAIL (hero moment under 30% of frames)
The interaction beat runs 150 of 900 frames — 17%. Two UI beats after it show
the settings screen and the pricing page, neither of which the thesis mentions.
That is a feature tour with a hero moment at the front, not a launch video.
→ UI beats 5 and 6 cut. Hero extended 150 → 330 frames (37%). Video shortened
  from 30s to 20s, matching the `single` thesis weight.

**Beat 4 — "and it's fast"** — FAIL (serves thesis)
Speed is not the thesis. This beat would fit any product in the category.
→ Cut. 90 frames to the payoff.

**Beats 1, 2, 3, 7** — pass.

Pass 2: no further failures. Plan final at 5 beats, 600 frames, hero 40%.
```

Then print a two-line summary to the terminal — what you changed and why. This
is the moment that proves the agent checks its own work, so it should be legible
to someone reading over the founder's shoulder.
