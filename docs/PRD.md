# Pitchframe — Master PRD

**Author** Sachin Baluragi
**Event** Push to Prod · Building at the Frontier · Anthropic × Elevation Capital
**Date** August 8, 2026 · Bengaluru, India
**Status** Working software. Shipped as a Claude Code plugin.

> An autonomous agent that decides what story your product deserves, films it
> from your real UI, scores it, watches its own work, and fixes itself.

---

## 1. The problem

**A technical founder can ship a product in a weekend and then cannot tell
anyone about it.**

The launch video is the single highest-leverage artifact in a software launch —
it is what goes on the landing page, in the Product Hunt post, in the tweet, in
the investor email. It is also the one artifact a technical founder cannot
produce. Every route is blocked:

| Route | Why it fails a technical founder |
|---|---|
| **Hire an editor** | ₹40k–₹2L and 1–3 weeks per video. The editor does not understand the product, so the founder writes the brief, records the screens, reviews four cuts, and still gets a feature tour. |
| **Learn After Effects / Premiere** | Weeks to competence. A licence. And the skill decays between launches, which are months apart. |
| **AI video generators** | They generate *footage that does not exist*. A model asked for "a developer using my CRM" invents a UI. For a product launch the UI **is** the claim — inventing it is worse than showing nothing. |
| **Screen-record it yourself** | Produces a demo, not a launch. Unedited, no story, no motion design. It looks like documentation because it is. |

Underneath all four is one structural fact: **the founder's product knowledge
and the video production capability live in different heads.** Every existing
workflow is an expensive, lossy attempt to move context from one to the other.

There is a second, subtler failure. Even founders who *do* make a video usually
make the wrong one. They make a **demo** — "here is what it does", a tour of
features — when a launch needs a **claim**: one moment that proves why the
product should exist. That distinction is not obvious, and nothing in the
existing toolchain enforces it.

## 2. The solution

**Pitchframe is a Claude Code plugin that turns a codebase into a launch video.**

One request, inside the terminal the founder already works in:

```
/pitchframe
```

It reads the codebase, scouts the live product in a real browser, decides what
the video should argue, writes a script with both what is *said* and what is
*shown*, drives the real UI with Playwright while recording every painted
frame, generates the voice-over, cuts the picture to the measured audio,
scores it, renders an MP4 — and, on request, watches its own output as a
skeptical VC or user and rewrites the script.

The insight that makes it work: **Claude Code is already sitting inside the
codebase with full context.** The expensive part of video production for a
technical product is not the editing — it is knowing what the product does,
what makes it different, and which screen proves it. An agent in the repo has
that for free. Everything downstream is mechanical.

The second insight: **the video is code.** Every frame is a React component
rendered by Remotion. There is no timeline, no Premiere project, no binary that
only one person can open. The output is source the founder can `git diff`,
edit, and re-render.

## 3. Features

**Autonomous direction.** A Director agent reads the repo and the live site and
writes `script.json` — the thesis, the hero moment, and per line what is spoken
and what appears. No prompt engineering by the founder.

**Real footage, not screenshots or generated video.** Playwright drives the
actual product — typing, clicking, waiting for real responses — while Chrome's
CDP screencast captures every painted frame. Your easing, your hover states,
your spinner, your data.

**A recorded cursor.** A screencast contains no pointer, so the recorder logs
coordinates to a track and the composition draws the cursor as a layer — sharp
under any zoom, with the click ripple on the exact frame of the press.

**Audio-first timing.** Voice is generated *before* the picture is planned, each
line measured to the byte, and those measurements *become* the beat lengths.
Sync is arithmetic, not alignment. Duration is `bytes / (24000 × 2)` because the
TTS returns raw PCM — nothing has to *listen* to the audio to stay in sync.

**Per-product art direction.** A script picks palette style, structure, type
layout, accent, transitions, hero framing grammar, drawn archetypes and 3D
placement — derived from the product's own UI brightness and brand colour, and
**diffed against every previous run** so no two videos share a look.

**Drawn components, not just recordings.** Vector archetypes — glass action
chips, a fan of cards receding into depth, a lattice lit by a diagonal wave —
animated a piece at a time, carrying the product's *real* labels read off the
live DOM. Never invented text.

**Self-critique and a judge loop.** A critique pass enforces genre rules
mechanically ("hero ≥ 30% of frames", "exactly one interaction beat"). Then
`/judge-vc` or `/judge-user` watches the finished video in a persona and
rewrites the specific lines that failed — one regenerated clip, not a re-edit.

**Every run archived.** `runs/<product>-<timestamp>/` holds the script, plan,
direction, palette, video and feedback. This is also the memory the variety
check reads.

**Editable output.** Remotion React source. `npx remotion studio` to scrub it.

## 4. How it works

Eleven steps. Each writes a file; each can be retried alone.

| # | Step | Produces |
|---|---|---|
| 1 | Scout the live product in a real browser | `.work/recon.json` |
| 2 | Fetch the real logo (5-rung ladder) | `public/assets/logo.*` |
| 3 | Extract the brand palette | `palette.json` |
| 4 | **Choose the look**, diffed against past runs | `.work/direction.json` |
| 5 | Apply it | `src/theme.ts` |
| 6 | **Direct** — write what is said and shown | `script.json` |
| 7 | Record the hero moment from the real UI | `assets/<name>/*.jpg` + cursor track |
| 8 | **Voice it** — one clip per line, measured | `audio/vo/*.wav` |
| 9 | **Cut the picture to the voice** | `plan.json` |
| 10 | Score it — cues derived from the edit | `audio/*.wav` |
| 11 | Render, then archive the run | `output.mp4` → `runs/…` |

**The three contracts.** `direction.json` decides how it *looks*. `script.json`
decides what is *said and shown*. `plan.json` is generated from those plus
measured audio — never hand-edited. Keeping look and content in separate files
is what stopped every video converging on one template.

## 5. Impact

| | Before | With Pitchframe |
|---|---|---|
| **Time to a launch video** | 1–3 weeks | ~15 minutes |
| **Cost per video** | ₹40k–₹2L, or an editor on staff | The Claude Code session |
| **Cost of a revision** | Another round-trip, another fee | Rewrite one line, re-voice one clip |
| **Skills required** | Editing, motion design, sound | None |
| **Who holds product context** | Transferred to a stranger, lossily | Already in the agent |

The compounding effect matters more than any single video. When a launch video
costs minutes, a founder makes one **per feature**, per release, per experiment
— the artifact stops being a launch-day event and becomes part of shipping. That
is a category change, not a cost saving.

## 6. Architecture

```
Claude Code (the agent runtime — reasoning, context, tool use)
│
├── skills/    14 skills — what the agent knows
├── agents/     5 subagents — pins the right model per step
├── commands/   /pitchframe · /judge-vc · /judge-user
│
├── scripts/   deterministic Node — the things a model must NOT improvise
│   ├── recon.mjs           live-DOM scout, ranked interactive elements
│   ├── extract-palette.mjs brand colour, declarations beat pixel counts
│   ├── art-direction.mjs   the look; refuses to repeat a past run
│   ├── fetch-logo.mjs      5-rung ladder to the real mark
│   ├── capture.mjs         Playwright + CDP screencast + cursor track
│   ├── gen-voice.mjs       Maya TTS, one clip per line, exact durations
│   ├── plan-from-script.mjs picture cut to measured audio
│   ├── gen-audio.mjs       cues + bed derived from the edit (seeded, no RNG)
│   └── archive-run.mjs     files the run; feeds the variety check
│
└── template/  the Remotion composition — the video, as React
```

**The split is the design.** Anything requiring judgement (what is the thesis,
which screen proves it, what should be said) is the model's. Anything requiring
determinism (frame arithmetic, colour derivation, audio timing, cue placement)
is a script. A model choosing camera math produces a different video every run,
which is the same thing as an unreliable one.

## 7. User flow

```
Founder, inside their repo:

  /pitchframe                         "make a launch video"
      │
      ├─ agent reads repo + scouts live product        ~2 min
      ├─ picks a look no previous run used             instant
      ├─ writes the script (thesis, hero, every line)  ~1 min
      ├─ drives the real UI, records the hero          ~2 min
      ├─ generates + measures the voice-over           ~1 min
      ├─ cuts picture to audio, scores it              instant
      └─ renders 1920×1080 h264                        ~3 min
                                                        ─────
                                              output.mp4 (~15 min)

  /judge-user      ← watches it as a developer, rewrites weak lines
  /judge-vc        ← watches it as an investor, same loop

  npx remotion studio   ← scrub, tweak a component, re-render
```

The founder writes no script, picks no screens, and opens no editor. They can
override anything, because every decision is a plain JSON file.

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Intelligence** | **Claude (Opus / Sonnet via Claude Code)** | Already in the repo with full context. Subagents pin the right model per step. |
| **Distribution** | Claude Code plugin + marketplace | `/plugin install` — no separate app, no account. |
| **Rendering** | Remotion 4.0.506 (React → h264, CRF 16) | Video as code: diffable, editable, deterministic. |
| **Browser control** | playwright-core + Chrome DevTools Protocol | Drives the founder's *installed* Chrome. `Page.startScreencast` for real frames. |
| **Voice** | Maya (mayaresearch.ai) — raw PCM 16-bit 24kHz | Raw PCM makes duration exact arithmetic. 11 languages, Indian English. |
| **Motion** | GSAP (paused timeline, seeked per frame) | Frame-accurate under a deterministic renderer. |
| **3D** | Three.js via `@remotion/three` | Optional signature moment. 1.9× per-frame cost, not the order of magnitude assumed. |
| **Audio** | Synthesized in Node (seeded LCG) | Cues derived from the plan, so they land on the actual cuts. Never `Math.random()`. |

## 9. Competition

### Against video tooling

| | What it is | Why it does not solve this |
|---|---|---|
| **After Effects / Premiere** | Professional editors | Weeks to learn, licence, decays between launches. The founder is not the bottleneck's owner — context transfer is. |
| **Descript, Veed, Kapwing** | Browser editors | Still a timeline someone must operate, and they know nothing about your product. |
| **Loom** | Screen recorder | Produces a demo. No story, no motion design, no edit. |
| **Jitter, Rive** | Motion design tools | Excellent, and still tools — someone has to design. |
| **Agency / freelancer** | Humans | Best output, worst loop: ₹40k–₹2L, 1–3 weeks, per revision. |

### Against AI video generators — the important comparison

Sora, Runway, Veo, Pika and Kling are **frontier models solving a different
problem.** They synthesize footage that has never existed. That is
extraordinary for film, advertising and B-roll, and **structurally wrong for a
product launch**:

- **They invent your UI.** Asked for "a developer using my CRM", they generate a
  plausible-looking CRM that is not yours. For a launch video the UI *is* the
  claim. Inventing it is not a stylistic compromise, it is a false statement
  about your product.
- **They cannot be corrected precisely.** Changing one word of on-screen text
  means re-rolling a generation and hoping. Pitchframe changes a string in
  `script.json` and re-renders that one beat.
- **They have no idea what your product does.** You must supply the story. That
  is exactly the work the founder cannot do — and the work an agent in the repo
  gets for free.
- **They cost per second, forever.** Pitchframe's marginal cost is a render.

**The distinction in one line:** generative video models *imagine* footage.
Pitchframe *films the real thing* and edits it — and the thing it generates is
**code**, not pixels.

### Why a technical founder chooses this

- **No new model to buy.** Claude Code is already installed and already has
  repo access. No second subscription, no per-second generation bill.
- **No editor to hire.** No brief, no round-trips, no explaining the product to
  someone who has never used it.
- **No heavy software.** No Premiere, no After Effects, no licence, no timeline.
  A React component and `npx remotion render`.
- **The context is already there.** This is the unfair advantage. Every other
  tool starts by asking the founder to explain their product. Pitchframe starts
  by *reading* it.
- **One install, three formats.** Launch, teaser and guide videos come from the
  same pipeline with a different structure — install once, post continuously.

## 10. Why this is audacious

Against the hackathon's five definitions:

**A frontier capability, not a repackaging.** Nothing today takes a repository
and returns a directed, scored, self-critiqued film. The novel pieces are real:
an agent that *decides the argument* rather than executing a brief; audio-first
timing where measured speech determines the edit; a variety system that diffs
against its own history so output cannot converge; and a judge loop where the
system watches its own work in a persona and rewrites the script.

**A believable path to scale.** Every software company that ships needs launch
video, forever, in every language. The wedge is technical founders in Claude
Code; the expansion is every product team, every release, every locale — the
same pipeline with a different structure and a different voice.

**It redefines the category.** Today video production is *editing*: a human
operating a timeline. Pitchframe makes it *compilation* — a source artifact
(`script.json`) compiled to an output artifact (`output.mp4`) by a deterministic
toolchain, with the creative decisions in version control. That makes the
current default look like hand-assembling machine code.

**An interface that does not exist yet.** There is no timeline and no canvas.
You state an intent in a terminal and an agent returns a film, then critiques
it as your harshest viewer and fixes it. The interaction is *conversation plus
review*, not direct manipulation.

**Infrastructure others build on.** The layers underneath — a live-DOM scout, a
cursor-tracked screen recorder, audit-able art direction, audio-first cutting —
are general. Any agent that needs to *show* software rather than describe it
needs them.

### Claude as the intelligence layer

Claude is not a feature here, it is the runtime. It reads the codebase and
decides the thesis. It chooses which screen proves the claim and writes the
Playwright actions that reach it. It writes every spoken and on-screen word. It
critiques its own plan before rendering, and judges the finished video in a
persona afterwards. Distribution is a Claude Code plugin; the skills, subagents
and slash commands *are* the product surface. Remove Claude and there is no
Director, no Judge, and nothing to compile.

---

## Appendix — proof it works

Built and shipped during the event, then run end-to-end against a real,
unfamiliar codebase (**Raphael**, an in-browser AI coding agent with built-in
security scanning):

- **52.7s** launch video, 1920×1080, 30fps, h264 — voiced and scored.
- **Hero at 47% of runtime**, cut from one continuous take.
- **11 spoken lines, 51.0s of narration**, every beat length measured from the
  audio rather than chosen.
- The hero is **not staged**: the agent drove the product to generate a Tic Tac
  Toe game, then ran its Semgrep scanner on the code it had just written —
  `Scanned 3 files in 21.02s`, 6 critical findings, `CWE-798` at `script.js:6`.
  Real product, real scan, real findings.
- The mark is the product's own wordmark, captured at 8× from the live DOM —
  Raphael has no logo image file, so nothing else would have found it.

Both cuts are archived in `runs/`, alongside the script that produced them and
the judge's written critique.
