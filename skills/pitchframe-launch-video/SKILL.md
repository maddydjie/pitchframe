---
name: pitchframe-launch-video
description: The launch-video structure and scene plan schema — cold-open setup, hero moment, payoff, CTA — with duration derived from the thesis. Used by Pitchframe to write plan.json.
---

# The launch video

Five parts, in this order, always:

| # | Part | Share | What it does |
|---|---|---|---|
| 1 | **Cold-open setup** | 2–6s | Why the moment matters. Usually typography. |
| 2 | **Logo** | 1.5–3s | The brand mark answers the setup. Recommended. |
| 3 | **Hero moment** | 6–15s | The one action the thesis is about. **The spine.** |
| 4 | **Payoff** | 4–10s | What changed. Lets the viewer complete the thought. |
| 5 | **CTA** | 2–4s | URL. Nothing else. |

The logo sits **between the setup and the hero**, not at the end. That ordering
is the keynote shape: the setup states the problem, the mark answers it, the
hero proves the answer. A mark at the end is a watermark; a mark in that slot is
a claim.

For a 20-second launch: **5s setup, 3s logo, 8s hero, 2s payoff, 2s CTA.**
For a 60-second launch: **10s setup, 3s logo, 30s hero, 12s payoff, 5s CTA.**

The hero moment gets the most frames because it is the moment people remember.
**Skimping frames there to add more beats is exactly what turns a launch into a
demo.**

## Duration follows the thesis

There is no fixed runtime. Read `thesis_weight` from the brief:

| `thesis_weight` | Runtime | Shape |
|---|---|---|
| `single` | 15–25s | One claim, one hero moment |
| `two-part` | 25–45s | Setup and reveal, each earning its time |
| `three-beat` | 45–90s | Problem, product, ecosystem — rare |

**Under no circumstance is the video longer than the thesis earns.** A 90-second
video with a 15-second thesis is a demo. If you find yourself with runtime left
over and nothing to put in it, the answer is a shorter video, never another beat.

## Beat types

There are five. There is deliberately no beat type for "another feature" — the
moment a schema can express a feature list, plans start containing one.

### `interaction` — the hero moment

```json
{
  "id": 3,
  "type": "interaction",
  "frames": [120, 360],
  "recording": "deals",
  "target_element": { "coordinates": { "x": 38, "y": 52 } },
  "interaction_type": "drag",
  "zoom_target": { "x": 71, "y": 52 },
  "shot": "push_in_reveal",
  "caption": null
}
```

- **`recording` is the preferred source, by a wide margin.** It names footage
  captured by a `record` shot — the real product moving, with the cursor path
  recorded alongside so the composition can draw it as a sharp layer and land
  the click ripple on the exact frame of the press. **Size the beat to
  `frame_count` from `capture-result.json`**: footage is stretched to fit, and
  past ~1.6× the speed change reads as wrong rather than as pacing.
- **`before_screenshot` / `after_screenshot` are the fallback** for sites that
  cannot be driven. The beat then runs a synthetic cursor across two stills.
  Use it when capture reports the recording failed — never by choice.
- **`shots` cuts the hero into a sequence** — all from the same continuous
  recording, so one take becomes many angles. **Use it for any hero over about
  six seconds.** One framing held for thirty seconds is the single biggest
  reason a generated video reads as generated; the reference films cut every
  one to three seconds. Rhythm: wide → the action → punch in on the
  consequence → pull back. See `pitchframe-motion-language`.
- **In `script.json`, a shot's `frames` is a *weight*, not a frame count.**
  You are writing shots before the voice exists, so you cannot know the beat's
  length. `plan-from-script.mjs` reads the numbers as proportions and refits
  them to the measured beat, so `[3, 3, 2]` and `[90, 90, 60]` mean the same
  thing. Write small relative numbers; they are clearer about the intent. In a
  hand-written `plan.json` they are literal frames and must sum to the beat.
- **A shot can be `render`ed instead of filmed** — two archetypes, both fed
  from **real strings in `.work/recon.json`**: `chips` (a loose cluster of
  glass action pills, one lit — real control labels) and `fan` (cards splayed
  into depth, 4–6 real headings, for "there are many of these" without listing
  them). The reference films are mostly drawn, not recorded.
  The hero moment itself stays real footage; drawn shots carry the ones around
  it. Never invent a label — if recon has none, film the shot instead.
- **`framing`** (per shot, or on the beat when there are no shots) decides how
  the product fills the frame — `bleed` (default),
  `closeup` (needs `crop`), `component` — which lifts the crop *out of the app*
  onto the video's own surface, and is what the references do most — or
  `contained`. **This matters more than any other
  field here.** A screenshot centred in a card with margin on all four sides is
  the clearest tell that a video was generated; no reference launch video does
  it. See `pitchframe-motion-language`.
- **`chrome`** defaults to `none`. Set `"macos"` for the window title bar with
  the traffic lights, plus `chrome_url` for the URL pill — it resolves "is this
  a real application?" in one frame. Use it for one shot, not the whole hero:
  chrome forces `contained` geometry, and a whole app in a card for thirty
  seconds is the look everything else exists to avoid.
- **`shot`** is the camera move. Defaults to `push_in_reveal`. See
  `pitchframe-motion-language`.
- **`zoom_target` is a percentage of the frame**, not pixels, and defaults to
  the target. Point it at the *consequence* when the change happens elsewhere —
  for a drag, the destination; for a form, the field that updated. Ten percent
  off centres the shot on empty chrome.
- **`interaction_type`** is `click`, `type`, `hover` or `drag`. With a
  recording this only decides whether a cursor is drawn; the real path comes
  from the track.
- **`caption` is usually null.** If the moment needs a sentence to explain it,
  it is not a hero moment.

**240 frames (8s) is the reference length.** The choreography scales to
whatever length you give the beat, but under ~180 frames the phases compress
past the point where the zoom can land.

### `logo` — the brand mark landing

```json
{
  "id": 3,
  "type": "logo",
  "frames": [180, 270],
  "transition": "flash",
  "source": "logo.png",
  "wordmark": "Acme",
  "tagline": null,
  "plate": "light"
}
```

- **`source`** is the mark captured from the real site — use an `element`
  capture at high DPI, because a header logo is often 40px and upscales to mush.
  Omit it and the beat sets the wordmark's initial instead.
- **`wordmark`** is the product name, wiping up under the mark.
- **`plate`** is `light` (default) or `none`. **Dark marks vanish on a dark
  background** — a light plate is how brands present a dark logo on dark, and
  for a product whose site is light it reproduces their own lockup. Use `none`
  for marks that already read light.
- **`tagline`** is almost always null. The thesis is the tagline, and it already
  ran in the setup.
- **1.5–3 seconds.** Its job is to punctuate, not to hold.
- **Add `three_d: {"template": "rotating_logo"}` when the mark is not a
  wordmark.** A real mark turning as a lit object is the cheapest signature
  moment there is — about 13s of extra render — and `fetch-logo.mjs` gets a
  real asset from almost any site. Check `is_wordmark` in `.work/logo.json`
  first: a wordmark turning edge-on is unreadable for half the beat.

### `typography` — setup and payoff only

`text`, optional `accent_word`, `accent_style`
(`italic_serif` | `bold_sans` | `none`), and `layout` (`centered` default, or
`stacked` for three or four short words, or `ghosted` for one short phrase
with momentum). Every beat also takes `surface`.

**`accent_word` matches a whole word, or part of one.** `"rectangle"` colours
the word; `"angle"` colours only those letters inside it, so the word turns as
it is read. A fragment stays in the sans — switching one syllable to an italic
serif reads as a font-loading failure rather than a choice.
Never under 45 frames. This is not a
caption track: if a typography beat is describing what the product does, it is
narration and it belongs in a demo.

### `ui` — establishing shot

A plain product frame to place the viewer. `screenshot`, `shot` (defaults to
`tilt_settle`), optional `caption`. **Use at most one.** A UI beat that exists
to show a capability is a demo beat wearing a different name.

### `cta`

`url` only. No button, no tagline, no "sign up free".

## The signature 3D moment

Any `logo`, `ui` or `cta` beat can carry a `three_d` treatment:

```json
{ "id": 3, "type": "logo", "frames": [165, 255],
  "three_d": { "template": "rotating_logo", "props": { "turns": 1 } } }
```

Templates: `rotating_logo` (on a `logo` beat), `device_mockup` (on a `ui`
beat), `particle_field` (composes underneath a `cta` beat).

**At most one in the whole plan**, and it is a treatment rather than a beat
type on purpose — a rotating mark is the logo beat in 3D, not a new thing to
show, and keeping it that way leaves the hero-frame arithmetic untouched.
Deliberately unavailable on `interaction`: the hero is real recorded footage,
and replacing evidence with a mockup is a downgrade.

Load `pitchframe-threejs` before generating one.

## Schema

```json
{
  "video_thesis": "Your CRM should be software you own, not a subscription you configure.",
  "hero_moment": "A developer forks the whole CRM in one terminal command.",
  "duration_seconds": 20,
  "fps": 30,
  "total_frames": 600,
  "music": false,
  "beats": [ ... ]
}
```

`video_thesis` and `hero_moment` are copied into the plan so the critique pass
can check the video against the claim without re-reading the brief.

Beats are contiguous: each starts where the previous ended, the first at 0, the
last ending exactly at `total_frames`. The composition adds its own 8-frame
cross-dissolve — do not build overlap into the plan.

## Camera, transitions and sound

Load **`pitchframe-motion-language`** for these — it carries the shot
catalogue, the transition budget, and the timing numbers the components already
enforce.

The short version: every beat takes a `shot` (default `push_in_reveal`); every
cut cross-dissolves automatically and `transition` adds an optional `sweep`,
`flash` or `none` on top; **use at most one or two effects in a whole video.**
Audio is generated from this plan by `scripts/gen-audio.mjs` — you never author
cues, and re-timing a beat re-times its sound.

## Worked example — a 20s single-claim launch

```json
{
  "video_thesis": "Every sales call becomes a Salesforce update. No rep types anything.",
  "hero_moment": "A rep drags a deal to Closed Won and the Salesforce field updates itself.",
  "duration_seconds": 20, "fps": 30, "total_frames": 600,
  "beats": [
    { "id": 1, "type": "typography", "frames": [0, 75],
      "text": "Reps spend a day a week", "accent_word": null },
    { "id": 2, "type": "typography", "frames": [75, 165],
      "text": "typing into Salesforce.", "accent_word": "typing", "accent_style": "italic_serif" },
    { "id": 3, "type": "logo", "frames": [165, 255], "transition": "flash",
      "source": "logo.png", "wordmark": "Acme", "plate": "light" },
    { "id": 4, "type": "interaction", "frames": [255, 495],
      "recording": "deal_move", "shot": "push_in_reveal",
      "target_element": { "coordinates": { "x": 31, "y": 48 } },
      "interaction_type": "drag",
      "zoom_target": { "x": 72, "y": 48 } },
    { "id": 5, "type": "typography", "frames": [495, 555],
      "text": "Nobody typed that.", "accent_word": "Nobody", "accent_style": "italic_serif" },
    { "id": 6, "type": "cta", "frames": [555, 600], "url": "acme.com" }
  ]
}
```

Setup 165 frames, logo 90, hero 240, payoff 60, CTA 45 — 600 total. The hero is
**40% of the video**, comfortably clear of the 30% floor.

## Anti-patterns

Any of these means the plan is wrong, not merely improvable:

- **More than one interaction beat**, unless `thesis_weight` is `two-part` or
  `three-beat` and you can name why. Two hero moments almost always means the
  thesis was two theses and neither got proven.
- **A hero moment under 30% of total frames.** That is the video treating its
  spine as a feature.
- **No payoff beat.** Without it the hero moment is a screenshot, not a claim.
- **Beats that exist to show capabilities.** The most common way a demo sneaks
  back in.
- **Runtime padded past what the thesis earns.**
- **Typography that narrates.** Setup and payoff only.
- **Any typography beat under 45 frames.**

## Before you hand off

Check the arithmetic yourself: beats contiguous, first at 0, last ending at
`total_frames`, hero beat ≥ 30% of frames, exactly one interaction beat, a
payoff beat present. The critique step will check the storytelling — it should
not have to fix your maths.
