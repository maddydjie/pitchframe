# Closing the loop

**Date:** 2026-08-09
**Status:** approved design, not yet implemented
**Scope:** one implementation plan

## The problem

Four complaints about Pitchframe's output — it looks templated, the hero moment
doesn't land, the script reads as generated, visual bugs slip through — share a
single cause.

**The pipeline is open-loop.** Nothing between `npx pitchframe install` and
`output.mp4` ever examines what it produced. Every fix in the project's history
has been either a rule added to a skill or a script that *chooses* something up
front. Neither can detect that the choice went wrong.

`CLAUDE.md` already states the lesson:

> Variety cannot be prompted for. […] Any future "make it more X" instruction
> aimed at a model's judgement will fail the same way; make it checkable or it
> will not happen.

That lesson was applied to exactly one axis — the look, via
`art-direction.mjs` — and to nothing else. This design applies it to the rest:
render correctness, conformance to the chosen look, and script quality.

Every gotcha in `CLAUDE.md` is described as a bug that "rendered without error
and only showed up in the output." That is not twenty separate bugs. It is one
missing feedback channel, twenty times.

## Non-goals

- **Additional output formats.** Vertical, cutdowns, GIF, stills are out.
  Pre-launch, with output quality unproven, more formats multiply an unsolved
  problem. Ship one format that is excellent.
- **An automatic judge loop.** `/judge-vc` and `/judge-user` stay manual and
  post-render. An unattended loop optimises toward whatever the checker rewards,
  which is not the founder's taste. Every gate below is capped at one repair
  pass for the same reason.
- **Re-rendering to verify a fix.** Renders are only *nearly* deterministic —
  one run in three differs by ~150 bytes on a static frame. A single re-render
  cannot prove a difference is real.

## Prerequisite: one source for `scripts/`

`scripts/*.mjs` is duplicated into `template/scripts/*.mjs` by hand. The two are
currently in sync; nothing enforces it. This design adds four scripts, and every
future one pays the tax twice.

- `scripts/` becomes the single source of truth.
- `bin/pitchframe.mjs` copies it into the installed project at install time.
- `template/scripts/` leaves git; local development gets it from a
  `npm run sync` step.
- A preflight check fails loudly if the two diverge, so a stale local copy
  cannot silently run the old script.

Do this before writing anything else.

## Layer A — give it eyes

New: `scripts/inspect.mjs`, plus a `pitchframe-review` skill. Runs after the
render, before `archive-run.mjs`.

Two halves, and the split is the point.

### Half 1 — static checks, no pixels required

Most of what has gone wrong never needed a rendered frame to catch. Contrast is
computable exactly from `src/theme.ts` and each beat's declared surface. The
white-display-type-on-pale-lavender bug rendered at **1.57:1**; detecting it
required multiplying two numbers, not looking at an image.

Checks in this half:

| Check | Failure it catches |
|---|---|
| Contrast of every text token against its beat's actual surface | Light-surface type invisible in the video |
| Beats contiguous; first at 0; last ends at `total_frames` | Schema drift between plan and renderer |
| Exactly one `interaction` beat | Two hero moments, neither proven |
| Hero ≥ 30% of `total_frames` | Hero is a feature, not a spine |
| A payoff beat exists | Hero is a screenshot, not a claim |
| `chrome` and `framing` do not contradict | The default that silently reverted the framing fix across three videos |
| Blur ramp is zero when `zoom` is 1 | A lens that does not move still blurring the subject |
| No colour literals outside `theme.ts` | Two products' videos looking identical |

This half is fast, deterministic, and is what actually gates the run.

### Half 2 — frames, for what only pixels can tell you

Extract stills from `output.mp4` with ffmpeg at frames **derived from
`plan.json`**: each beat's midpoint, the hero's click frame, its before/after
pair, and every transition boundary. Not uniform sampling — uniform sampling
spends most of its frames on holds, where nothing is moving and nothing can be
wrong.

Measured per sampled frame:

| Measure | Failure it catches |
|---|---|
| Luminance variance | Blank or black frame. A solid-black 3840×2160 PNG compresses to ~29KB, so file size cannot detect this — the same reason `capture.mjs` measures variance |
| Laplacian energy, centre vs periphery | The subject blurrier than its surroundings — the depth-of-field bug that survived three renders |
| Frame delta across the hero's before/after | "The product did nothing", which is worse than having no hero beat |
| Content occupancy in the edge regions | Chrome cropped away by `bleed` — the run where a canvas app's toolbar and sidebar vanished entirely |

Writes `.work/inspection.json` and the sampled PNGs to `.work/frames/`.

### The review step

`pitchframe-review` reads `inspection.json` **and looks at the frames**. This is
the first point in the pipeline's life where anything sees the output.

- Deterministic failures are non-negotiable. Each names its fix target — a
  `script.json` line or a specific plan field — so the repair is targeted rather
  than a rerun.
- Vision findings are advisory. Their job is the judgment metrics cannot make:
  *does this read as one moment?*
- **One repair pass, capped.** A failure here is post-render: the video already
  exists, so after one repair attempt the run continues to archive regardless,
  logging by name whatever was not fixed. Blocking a founder from a finished
  video over a check is the wrong trade; hiding the defect from them is worse.

## Layer B — make the chosen look stick

`art-direction.mjs` already rotates `style`, `structure`, `type_layout`,
`hero_progression` and diffs the signature against `runs/`. Videos still
converge. So signature *breadth* is not the main gap. Two others are.

### B1 — nothing verifies the Director obeyed `direction.json`

`.work/direction.json` is described as binding, and is binding by prose alone.
Prose is what failed for "be varied", for `bleed`-is-the-default, and for
`chrome`.

New: `scripts/check-conformance.mjs`. Diffs `script.json` and `plan.json`
against `direction.json` field by field. A deviation is legal only if
`.work/director.md` carries a written reason naming that field.

An unexplained deviation is a **blocking** failure — it runs before capture and
voicing, so the repair is a re-direct, not a re-render, and the pipeline stops
until the Director either conforms or writes its reason. Unlike Layer A's
post-render gate, nothing has been spent yet, so there is no reason to continue
past it.

This converts the frame from advice into a contract. It is the highest-leverage
item in this design and the cheapest — roughly eighty lines.

### B2 — axes the direction does not own

`framing`, `chrome`, hero shot count, hold times and cut rate are left to the
Director's free choice, and free choice converged on the same point in the space
every time. Move them into `direction.json` so they rotate and are checked like
every other field.

A side effect worth naming: `chrome` and `framing` becoming one decision removes
the contradiction where `chrome: macos` forced `contained` and silently undid
the framing work in the same session it landed.

The signature widens by `framing` and a pacing band, and no further.
`CLAUDE.md` warns that a signature too broad makes every candidate collide, and
the rotation bound is 60.

### B3 — a floor on hero shot count

Sixteen samples of a reference launch film gave sixteen different compositions.
Three Pitchframe videos in a row held one window for thirty seconds. This is
currently a paragraph of advice in the motion-language skill.

Make it arithmetic: `shots.length >= f(hero_duration)`, checked in Layer A's
static half.

## Layer C — judge before the render

`/judge-vc` and `/judge-user` remain manual and post-render. Unchanged.

Added: a **text-only adversarial pass on `script.json` before `gen-voice.mjs`**.
Rewriting a line before voicing costs one regenerated clip; after the render it
costs a re-voice and a re-render. The pass is cheap because no audio, capture or
render has happened yet.

Alongside it, mechanical script checks — each currently enforced by prose only:

- Every drawn label exists in `.work/recon.json`. A rebuilt component carrying
  the product's real words is truthful; one with invented words is a lie that
  renders beautifully.
- The thesis names a concrete artifact present in recon, not an abstraction.
- The hero line names the state change, not the feature.
- Generic-copy detection: abstract-noun density and the
  *seamlessly / effortlessly / powerful* register.

No check makes writing good. These catch the specific failure named — copy that
reads as generated.

## Documentation

- `docs/ARCHITECTURE.md` says the pipeline is nine steps;
  `skills/pitchframe/SKILL.md` says eleven. Reconcile.
- The `plan.json` schema is documented in
  `skills/pitchframe-launch-video/SKILL.md` and typed in
  `template/src/lib/types.ts`, paired by a bolded warning. Make the pairing a
  checked invariant in Layer A's static half instead.

## Sequencing

Order is load-bearing. Until something looks at the output, there is no way to
tell whether B or C improved anything.

1. Prerequisite — single-source `scripts/`
2. Layer A — `inspect.mjs` static half, then the frame half, then
   `pitchframe-review`
3. Layer B — `check-conformance.mjs`, then the direction widening, then the
   shot-count floor
4. Layer C — mechanical script checks, then the pre-render persona pass
5. Documentation reconciliation

## How we know it worked

- A deliberately broken plan — white type on a light surface, a hero with one
  shot, a `chrome`/`framing` contradiction — is caught and named by Layer A's
  static half, so the founder is told which field is wrong rather than
  discovering it by watching.
- A Director output that silently substitutes its own look stops at
  conformance, before capture or voicing spends anything.
- Two consecutive runs on the same product produce identical `direction.json`
  (determinism), and two different products produce different ones.
- The existing palette-pipeline test still passes: a frame rendered under two
  palettes must differ byte-wise.
