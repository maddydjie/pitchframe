# Pitchframe

**Turn a codebase into a launch video. One request, inside Claude Code.**

Pitchframe reads your product, works out why it should exist, finds the single
moment that proves it, captures that moment from your real UI, and renders a
launch video you can edit as source code.

```bash
npx pitchframe install
```

Then, in Claude Code, in your project:

> make a launch video for this product

Three to six minutes later: `./pitchframe/output.mp4`.

---

## Launch videos, not demo videos

This is the whole idea, and it is worth being precise about.

|  | Demo | Launch |
|---|---|---|
| Answers | *What does this product do?* | *Why should this product exist?* |
| Shape | A tour of features | One moment, held with intention |
| Reads as | Documentation | A keynote reveal |

Raycast AI, the original v0 launch, Cursor's early videos, Linear's cycles
announcement, Arc Search's reveal — **none of them list features.** Each shows
one specific moment; everything else is setup and payoff around that moment.

Pitchframe makes the second kind. Every constraint below exists to keep it there.

### Two structures, chosen per product

There is no fixed shape. The Director picks one:

| | For |
|---|---|
| **`thesis`** | One provable claim. Setup → mark → hero moment → payoff → close. |
| **`mosaic`** | Range. Six to ten short moments, cutting constantly, all serving one claim. |

An earlier version hard-coded a single five-part shape and enforced it in the
critique — so every product got the same video with the colours swapped. That
was the biggest design failure in the project's history, and the fix was to make
structure a decision rather than a law.

### Runtime follows the narration

Each beat lasts exactly as long as the line spoken over it. Length is a
consequence of how much there is to say, not a target — with voice-over on, a
minute is roughly ten to twelve spoken lines.

---

## What it actually does

**It reasons before it generates.** Before a single frame, it reads your README,
pricing page and route structure, searches for your three nearest competitors,
and writes a positioning brief: a one-sentence thesis, and the one concrete
moment that embodies it. If it can produce a thesis but no filmable moment, it
throws the brief away and reframes — because a thesis without a hero moment
becomes a feature tour.

**It checks its own work.** The plan goes through an adversarial critique before
rendering: more than one hero moment, a beat that doesn't serve the thesis, a
hero under 30% of frames, a missing payoff, runtime beyond what the thesis
earns — any of those fails the plan and it gets rewritten.

**It captures the real interaction.** The hero moment is a before/after pair
driven by Playwright: load the page, perform the action, capture the change. If
the two frames come out identical, the capture fails rather than shipping a
"hero moment" where nothing happens.

**Your brand comes from your code.** Colours are extracted from
`tailwind.config`, then CSS custom properties, then computed styles on your
deployed site — and written into a generated `theme.ts` as the single source of
colour.

**The output is source code.** The video is a Remotion project at
`./pitchframe/src/`. To change it, ask Claude Code:

> hold the hero moment longer, and zoom on the field that changed

It edits the plan and re-renders in under 90 seconds.

---

## Install

```bash
npx pitchframe install          # scaffold + skills, project-local
npx pitchframe install --global # skills to ~/.claude, available everywhere
npx pitchframe doctor           # check this machine can run the pipeline
```

This scaffolds `./pitchframe/` (the Remotion project) and installs fourteen
skills, five subagents and three slash commands into `.claude/`.

Also available as a Claude Code plugin:

```
/plugin marketplace add <your-github-user>/pitchframe
/plugin install pitchframe@pitchframe
```

**Requirements:** Node.js 20+, Claude Code, a Chromium-based browser (Chrome or
Edge — already on your machine), and ideally a dev server that starts with
`npm run dev`.

---

## Use

Plain English:

> make a launch video
> make a launch video, we're pitching enterprise buyers
> make a 40 second launch video — the thesis has a setup and a reveal

Or the slash command:

```
/pitchframe focus on the self-hosting story
```

A directive outranks the agent's own reading of your codebase. Where they
conflict, it follows you and says so in the brief.

### Editing

> hold the hero moment longer
> make the accent purple
> zoom on the field that changed instead
> change the payoff to "Nobody typed that."

Edits skip all the reasoning, so they take 15–90 seconds instead of minutes.

---

## How it works

Three agents and a loop. **A Director** reads your product and writes the
script — what is said, what is shown, which structure, which palette, which
music. **The generator** films your real UI and renders to it. **A judge**,
when you ask, watches it back as an investor or a user and rewrites the weak
lines.

```
/pitchframe            make the video
/judge-vc              an investor watches it and rewrites what fails
/judge-user            a prospective user does the same
```

Nine steps. Each writes a file, and each can be retried alone.

| Step | What happens | Output |
|---|---|---|
| 1 | Scout the live site — identity, and what can be clicked | `.work/recon.json` |
| 2 | Fetch the real logo — inline SVG, manifest icon, or the real `<img>` | `assets/logo.*` |
| 3 | Extract the palette and choose the look | `palette.json` → `theme.ts` |
| 4 | **Direct** — write the script *(Opus)* | `script.json` |
| 5 | **Record** what the script names, in a real browser | `assets/<name>/*.jpg` |
| 6 | **Voice it** — one clip per line, via Maya | `audio/vo/*.wav` |
| 7 | **Cut the picture to the voice** | `plan.json` |
| 8 | Score it — cues placed on the frames the edit cuts on | `audio/*.wav` |
| 9 | Render *(Opus)* | `output.mp4` |

Three steps run as subagents so each gets the right model — Opus for direction
and code generation, Sonnet for capture orchestration.

### Audio leads, picture follows

Nobody controls how long a spoken line takes. So the voice is generated first,
each line **measured**, and those measurements *become* the beat lengths — the
picture is cut to the audio, not the other way round.

Voice-over needs a [Maya](https://mayaresearch.ai) key. Put it in
`pitchframe/.env` (gitignored, read automatically):

```
MAYA_API_KEY=your-key-here
```

**Without it the voice step stops rather than skipping.** It used to skip with
a one-line notice, and the result was silent videos whose beats were timed by a
reading-speed guess — the failure the audio-first design exists to prevent,
arriving quietly. To render deliberately without narration, pass
`--allow-silent` to `gen-voice.mjs`.

**Music needs nothing.** Drop tracks in `template/public/audio/music/` and one
gets picked per product; with none, `gen-audio.mjs` synthesizes a bed and a set
of cues from your plan, so a fresh install is never silent. No music ships with
the plugin — see [that folder's README](template/public/audio/music/README.md)
for why.

More detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Three things that make it not look generated

**The hero moment is footage, not screenshots.** Playwright drives your real
product while Chrome's screencast captures every painted frame — your easing,
your hover states, your spinner. The cursor is recorded as a *coordinate track*
rather than baked into the pixels, because a screencast contains no pointer at
all. That turned out better than the alternative: the cursor stays sharp
through the zoom, and the click ripple lands on the exact frame of the press.

**There is a real camera.** Beats sit on a 3D stage with perspective, so a
push-in genuinely dollies — near edges grow faster than far ones, and layers at
different depths parallax on their own. Six named moves, chosen by the agent
from a catalogue. Not a free-text field: freeform camera math means a
different-looking video every run, which is the same thing as an unreliable one.

**The sound is synthesized from the plan.** A whoosh is filtered noise under an
envelope; an impact is a pitch-swept sine with a noise transient. All of it
generated with plain Node — no API key, no downloads, no licence question — and
placed on the frames the edit actually cuts on, including the frame the mouse
went down, read back out of the recording track. Drop an `mp3` in
`public/audio/` and it replaces the generated bed.

---

## Fallbacks

Nothing in the pipeline stops to ask you a question. Every failure has a route
around it:

- **Dev server won't start** → uses your deployed URL, then the landing page,
  then abstracted mock surfaces in your brand colour.
- **The interaction changes nothing on screen** → the shot fails loudly rather
  than shipping a hero moment where nothing happens.
- **Competitor search finds nothing** → reasons from the codebase and says so.
- **No brand colour found** → stays neutral. A wrong brand colour is worse than
  no brand colour.
- **Render fails** → the plan and assets are preserved so you can see why.

Every fallback taken is logged to `pitchframe/.work/run.log` and named in the
final message — never as a mid-run prompt.

---

## Not yet supported

Vertical/Shorts format, voiceover, hosted rendering, and visual critique of
rendered frames. All on the roadmap; none needed for what this does today.

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) first — it has the invariants and the gotchas that
have already cost time. Then [`docs/EXTENDING.md`](docs/EXTENDING.md).

## License

MIT
