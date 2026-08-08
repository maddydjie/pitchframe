---
name: pitchframe-motion-language
description: How a Pitchframe video looks and moves — framing, light and dark surfaces, the camera shot catalogue, depth, transitions, sound, and the timing numbers that separate a launch video from a template. Load alongside pitchframe-launch-video when writing or editing plan.json.
---

# How it looks and moves

The plan schema says *what* is in the video. This says how it looks, and it is
the difference between a video that reads as filmed and one that reads as
generated.

Most of what follows was derived by taking frame-by-frame breakdowns of
reference launch videos — Linear, Gemini Canvas, and several AI SaaS product
films — and comparing them against what this pipeline actually produced. The
gaps were not subtle, and they were not about polish. They were about framing.

**One idea underneath all of it: choose from named things.** Every control here
is a closed set. That is not a limitation to work around — freeform motion at
generation time produces a different-looking video every run, and a video that
is different every run is indistinguishable from an unreliable one. Variety
comes from choosing well, not from inventing.

## The hero is a sequence of shots — read this first

**The single biggest reason a generated video reads as generated is holding one
framing for the length of the hero.**

Sixteen evenly-spaced samples of a reference launch film gave sixteen entirely
different compositions. None of them showed a whole application in a window for
thirty seconds. Pitchframe did exactly that for three videos in a row, and they
looked like the same video with the hue changed.

Cut the hero with `shots` — all from the **same continuous recording**, so one
take becomes many angles and the footage never restarts:

```json
"shots": [
  { "frames": 120, "framing": "bleed",     "shot": "push_in_reveal" },
  { "frames": 90,  "framing": "component", "crop": {"x":36,"y":0,"w":30,"h":10} },
  { "frames": 240, "framing": "bleed",     "shot": "locked_off", "zoom": 1 },
  { "frames": 150, "framing": "closeup",   "crop": {"x":16,"y":18,"w":36,"h":28} },
  { "frames": 240, "framing": "bleed",     "shot": "drift_back", "zoom": 1 }
]
```

### The rhythm

**wide → the action → punch in on the consequence → pull back.**

That is the shape the references use over and over, and it maps onto the beat
you already have: establish the app, cut tight to the control being used, cut
back wide as the result appears, then widen to show what it all became.

- **Cut every 1–3 seconds** (30–90 frames). A shot over ~120 frames needs a
  camera move to justify it.
- **Cuts are hard.** A dissolve between two crops of the same footage reads as
  a mistake, because the viewer sees the same pixels sliding.
- **Alternate wide and tight.** Two close-ups in a row and the viewer loses
  where they are.
- **Each shot gets its own camera and its own clock**, so a `push_in_reveal`
  resolves within its shot rather than inheriting a move mid-flight.
- **`zoom: 1` on most shots.** The lens punch is for the shot that lands on the
  consequence; on every shot it is noise.

A hero over about eight seconds on a single framing fails the critique.

## Drawn shots, not only filmed ones

**The reference films are mostly not screen recordings.** Their UI moments are
rebuilt as vector and animated a piece at a time — a menu, a field, a cluster
of action chips, floated at huge scale. Only Linear is largely real footage.
Pitchframe was the inverse of that ratio, and it is a bigger reason the output
looked flat than framing or colour were.

A shot can carry `render` instead of framing the footage:

```json
{ "frames": 90, "shot": "push_in_reveal",
  "render": { "archetype": "chips",
              "items": ["Rectangle", "Ellipse", "Arrow", "Draw"],
              "active": 0 } }
```

The recording keeps running underneath, so cutting to a drawn shot and back is
a cut, not a stop.

### The line that keeps this honest

| | Source | Why |
|---|---|---|
| **The hero moment** | **Real recording** | It is the proof. A drawing of a product proving something proves nothing. |
| **Everything around it** | **Drawn** | Supporting shots, component moments, transitions |

**Labels come from `.work/recon.json`, never from you.** Recon read them off
the live page. A rebuilt component carrying the product's real words is
truthful; one carrying invented words is a lie that renders beautifully — and
that single distinction is why this is allowed to sit beside the recorder
instead of replacing it.

If recon has no clean label for something, do not invent one. Use a filmed shot.

### Why drawn beats cropped

A crop is limited by the recording: at 30% of a 1920px take, a lifted toolbar
is 576 real pixels stretched to fill the frame, and it shows. Drawn, the same
shot is sharp at any size, each element animates on its own, and the
composition is yours to place — which is what makes negative space possible.

**Archetypes are a closed set**, like the camera shots. Freeform layout at
generation time is where inconsistency comes back.

- **`chips`** — a loose cluster of glass action pills, one lit. Scattered and
  overlapping, some running off the frame edge; a neat centred row reads as a
  component-library screenshot. Feed it real **control labels**.
- **`fan`** — cards splayed into depth, one legible at the front and the rest
  falling out of focus. The shot for **"there are many of these"** — documents,
  results, records, templates — *without listing them*, which would be a
  feature tour. Feed it real **headings**.

  **Four to six items.** Three does not read as depth; more than six and the
  back of the stack is mush. Depth is real `translateZ` inside the stage, so a
  camera move parallaxes the cards against each other for free — `orbit_hold`
  suits it well.

  The muted bars on each card are *texture, not data*. They say "there is
  content here" without claiming what it is. Inventing plausible-looking rows
  would be inventing the product's content, which is the same line as inventing
  a label.

## The frame — read this first

**The single clearest tell that a video was generated is a screenshot centred
in a rounded card with margin on all four sides.**

Not one reference video does it. Every one of them either runs the UI past the
edge of the frame or crops hard into a single element. The contained card reads
as "a screenshot someone put in a slide", and no amount of camera work rescues
it, because the composition itself is what's wrong.

Set `framing` on the interaction beat:

| `framing` | What it does | Use it |
|---|---|---|
| **`bleed`** | Oversizes the panel so edges leave frame | Content-dense products, where the middle of the screen carries the story |
| **`closeup`** | Fills the frame with `crop` | Tight on one region, still inside the app |
| **`component`** | **Lifts `crop` out of the app** onto the video's own surface | A single control, alone, at huge scale. What the references do most |
| `contained` | The old card-with-margin | Only when the viewer must see the whole app at once |

### Bleed deletes edge-anchored UI — check before using it

**Bleed crops several percent off every edge, and a toolbar living near an edge
is the first thing to go.** On a canvas app it removed the toolbar *and* the
side panel, leaving a white field with one shape in it — the product was
invisible and the shot said nothing. Reducing the oversize did not fix it;
nothing can, because bleeding *is* showing less than the whole app.

Decide by where the product's UI lives:

- **Chrome at the edges** — toolbars, sidebars, rails, tool palettes. Use
  `contained` or `chrome` for any shot meant to establish the app, then
  `closeup` to go tight. Canvas tools, editors and IDEs are all this shape.
- **Content in the middle** — dashboards, feeds, tables, documents. `bleed` is
  right, and the cropped edges were chrome you did not need.

The test: name what the viewer should read in the shot. If it is at the edge of
the screen, bleed will remove it.

### Window chrome

**`chrome` defaults to `none`.** It was briefly the default and silently
reverted the framing fix across three whole videos — chrome forces `contained`
geometry, which is the look the whole section above exists to avoid. Use it
deliberately, for a shot that is *about* the product being a real application.

Set `chrome: "macos"` — the title bar with the red/amber/green
lights, and a URL pill if you set `chrome_url`.

A recorded website with nothing around it is ambiguous: screenshot, mock, or
design? The traffic lights resolve it in one frame, and the viewer reads a real
application on a real machine — which is exactly the claim the hero moment is
making. Set `chrome_url` to the real domain; a real domain is evidence.

**Chrome and `bleed` are mutually exclusive**, and chrome wins. A window whose
edges have left the frame is not a window — it is a screenshot with a strip
along the top. So turning chrome on sizes the panel to fit. Pick a look:

- **chrome on** — you are looking at the app on a machine. Classic, and what
  most founders picture when they ask for a product video.
- **`bleed`, `chrome: "none"`** — you are *inside* the app. Harder, more
  modern, and what Linear does.

Chrome is forced off for `closeup`: the crop magnifies the footage, and the
chrome is not part of the footage.

### `component` — the one that changes everything

The reference films mostly do **not** show a browser window. They show a single
UI element — a menu, a field, a card, a toolbar — taken *out* of the app and
floated on a gradient with a soft shadow, filling most of the frame.

`framing: "component"` does that: the crop becomes an object on the video's own
surface, rounded and shadowed, with margin around it. No window, no
surrounding UI, no chrome.

**Crop to one control.** A component crop containing three unrelated things is
a screenshot again.

**Resolution is the real limit.** The recording is 1920px wide, so a crop is
that fraction of 1920 upscaled to fill the frame. A 30% crop is 576 source
pixels — visibly soft. Keep component and closeup crops **at or above ~25%
width**, and prefer wider crops of denser regions over tiny crops of small ones.

`closeup` and `component` both need a `crop` — `{x, y, w, h}` as percentages of
the footage.

- **Crop position is exact, including against an edge.** The container takes
  the crop's own aspect ratio and the footage is placed inside it, so a crop at
  y=0 works. (It did not always: a centred 16:9 slice used to run off the top
  of the image into empty panel.)
- **Crop to the element, not the quadrant.** An input, a button, a single row.
  Wider than about 45% is a zoom, not a close-up, and loses what makes it work.
- **A close-up is unreadable out of context.** Earn it: show the surroundings
  first, then punch in. Opening on one is disorienting.
- **The lens punch is automatically gentler on a close-up** (1.12× rather than
  1.3×), because you are already inside the subject.

## The surface — light and dark are a rhythm

Every beat takes `surface`: `dark` (default), `mesh`, or `light`.

A `mesh` is four soft radial fields in the product's own colour, drifting. The
references alternate constantly — near-black, then a large colour field, then
near-black again — and **the alternation is the pacing**. It does the work that
cuts and effects otherwise have to do, and it costs nothing to watch.

The rules:

- **At most two bright beats** (`mesh` or `light`) in a launch video.
- **Never two in a row.** Alternation is the whole effect; two together is just
  a bright section.
- **Never on the hero moment.** The product is the brightest thing on screen
  during the hero, and a lit background steals that.
- **The payoff is the best candidate.** A dark setup → dark hero → bright
  payoff is the most reliable shape there is.

Type recolours itself on a light surface automatically. You do not need to
compensate for it, and you should not try.

## Typography layout

`layout` on a typography beat: `centered` (default), `stacked`, or `ghosted`.

`stacked` puts each word on its own line with sizes, horizontal offsets and a
degree or two of rotation varying between them — designed rather than typeset.
It is what the reference videos use for a short declarative phrase, and it is
the difference between a title card and a composition.

**Three or four short words, nothing longer.** Above that a stack stops being
one object and becomes a list, and the eye has nowhere to start. If the line is
a real sentence the viewer has to read as a sentence, it is `centered`.

The variation is a fixed cycle, not random — the same plan renders the same
file every time, and a tuned rhythm reads better than noise anyway.

### `ghosted`

Each word carries copies of itself trailing behind, fading and softening —
motion frozen mid-travel. The trail is long while the word arrives and settles
to about half, so it persists rather than resolving away; a trail that vanishes
is just a slow entrance.

- **One short phrase with momentum.** On a long line it becomes a smear.
- **Not on the payoff.** The payoff is a claim the viewer completes; a phrase
  still visibly moving undercuts it. Use it on a setup.
- Pairs badly with `mesh` at full strength — ghosts over a bright field lose
  their edges. Prefer `dark`.

## The grade

On by default. Bloom plus a small tone curve over the finished frame: highlights
bleed into what surrounds them, contrast lifts slightly. It is most of what
"cinematic" actually means, and it costs one line.

Set `grade: false` on the plan only for a product whose UI is itself very
bright, where lifting the highlights costs legibility. Grain and vignette are
separate and always on — they also stop h264 banding across near-black
gradients.

## The reference films

Six launch films were broken down frame by frame; everything above is derived
from them. (Eight zips — Teamble and Elyxir each appear twice, re-exported.) Recorded here so the reasoning is checkable and so what was *not*
taken is visible as a choice rather than an oversight.

The frames themselves are not in this repo and must not be — they are stills
from other companies' commercial work. Technique is not ownable; footage is.

### Linear — "At your command"

2:1 letterbox, near-black throughout, extremely low key. Panels at 25–40° of
yaw, bleeding off every edge, with shallow depth of field leaving only a band
sharp. Text is rotated *into* the 3D scene at the same angle as the UI. Typing
happens in the real input, caret and all. The wordmark appears once, small and
quiet, at the very end.

**Taken:** bleed framing, extreme yaw (`raking_pass`), DOF.
**Not taken:** 2:1 (we ship 16:9 for social), text in 3D space.

### Gemini Canvas

Pure black. Panels edge-lit along their borders. Cuts hard between **extreme
close-ups of single controls** — one toolbar, one input, one button — then back
to wide. One frame is pure defocus, used as a transition. Ends on a line of
type plus a URL.

**Taken:** close-ups on single controls, the cut rhythm, the end card.
**Not taken:** defocus as a transition.

### Google Workspace

The one that changed the most. Sixteen samples, sixteen different shots —
and **most are not a browser window at all**. Single components are lifted out
of their apps and floated on gradients at huge scale: a menu, a voice picker, a
comment card, a search field. Frosted translucent surfaces. A stylised pointer,
not the OS cursor.

**Taken:** `framing: "component"`, cutting constantly, the custom cursor.
**Not taken:** the glass surfaces — mostly these are the *product's own* design
system, captured by recording it, not an effect the video applies.

### Teamble

Alternates hard between near-black and large bright gradient fields — that
alternation carries the pacing. UI cards in strong perspective with text
flanking them. Kinetic typography with per-word size and offset. An orbital
arrangement of avatars around a hub. Logo at the start *and* the end.

**Taken:** `surface` alternation, `layout: "stacked"`, the logo's position.
**Not taken:** orbital/diagram compositions, text flanking a panel.

### Gemini — "idea could move"

Flowing multi-colour aurora ribbons on black. Very minimal: often a single
input pill floating in the frame. One word highlighted with a solid box.

**Taken:** the `ambient` and `spectrum` mesh styles.
**Not taken:** ribbon/aurora geometry — our mesh is radial fields, not flowing.

### Elyxir — the most distinctive of the six

Worth studying hardest. Almost every frame is near-black with **one green light
source**, usually entering from an edge or from behind the subject rather than
sitting behind it as a centred field. Our `mesh` is a centred radial bloom;
this is a light coming *from somewhere*, and it is a large part of why the film
looks lit rather than coloured.

Its real signature is **negative space**. A progress pill a fifth of the frame
wide, centred in blackness. A leaf glyph, tiny, alone. A UI strip receding to
almost nothing. It repeatedly puts a small subject in a vast empty frame and
holds — the opposite instinct to filling the frame, and it reads as confidence.

Also, in rough order of how usable each is:

- **Glass pills in a loose cluster, cut off by the frame edge.** Four or five
  translucent action chips, overlapping, some running off the side. Not
  centred, not contained, not a grid.
- **Ghosted overlapping type** — the same phrase repeated behind itself at
  falling opacity, so one line reads as motion frozen.
- **An accent on part of a word**, not the whole word: the last two letters of
  "deeper" carry the colour.
- **Cards fanned into depth**, translucent, receding.
- **A radial constellation of product icons** on a lit sphere.
- **A cluster of photographs fanned behind a single word.**
- **A very quiet end card** — the wordmark low-contrast, almost dissolving.

**Taken:** confirmation that depth and layering carry more than colour does;
the low-key single-light-source approach behind `ambient`.
**Not taken, and each is a real gap:** negative-space composition, glass
clusters bleeding off frame, ghosted overlapping type, fragment accents, card
fans, icon constellations.

**Fragment accents are the cheapest of those to add** — `accent_word` currently
matches whole words only, so "deeper" cannot carry colour on just its last two
letters.

### What every one of them shares

Ranked by how much it matters, which is not the order anyone guesses:

1. **They cut constantly.** One to three seconds a shot. Not one of them holds
   a single framing through its hero.
2. **The product is rarely shown whole.** Cropped, lifted out, bleeding off
   frame — a complete app centred in a card is what none of them do.
3. **Restraint in motion.** One thing moves; the camera does the rest.
4. **Colour is a frame, not decoration.** A dark ground with one light source,
   or a bright field — never both fighting.
5. **The mark is small and brief.**
6. **They are unafraid of empty frames.** Elyxir is the clearest case, but all
   six hold shots where the subject occupies a small fraction of the picture.
   Filling the frame is the reflex to resist — a small subject in a large dark
   frame reads as confidence, and a subject crammed to the edges reads as a
   slide.

The unbuilt list above is the honest backlog: text in 3D space, defocus
transitions, orbital compositions, ghosted overlapping type. Any of them would
be a real addition; none has been built yet.

## What the references do that we deliberately do not

Recorded so nobody re-derives it, and so the omissions are visible as choices:

- **Extreme perspective (25–40° yaw).** Available as `raking_pass`, but the UI
  is unreadable at that angle. The references cut away from it within a second;
  a plan that holds it is misusing it.
- **Cinematic 2:1 letterbox.** Linear ships at 2:1. Pitchframe is 16:9 because
  that is what social platforms and landing pages want.
- **Defocus as a transition.** Not built; the cross-dissolve carries a paired
  scale instead.
- **Bright hero moments on white.** Deliberately not: the palette pipeline
  forces a dark genre so that products with light brands still read as launch
  films rather than as marketing sites.

## The camera

Beats sit on a real 3D stage: `perspective` plus `translate3d` and rotation, so
a push-in genuinely dollies. Near edges grow faster than far ones and layers at
different depths parallax on their own. That is the difference between the
camera moving and the picture getting bigger, and it is most of what separates
a product video from a slideshow of screenshots.

Set `shot` on a beat. Six choices, defined in `src/lib/camera.ts`:

| `shot` | What it does | Use it for |
|---|---|---|
| **`push_in_reveal`** | Starts back and off-axis, arrives square and forward | **The default.** Any beat that should resolve — hero moments especially |
| **`tilt_settle`** | Comes to rest still tilted | UI being *presented*. Never for a shot the viewer must read |
| **`orbit_hold`** | Slow lateral arc, never settles | A long hold that would otherwise die |
| **`drift_back`** | Starts close, pulls away to reveal context | The payoff — answering "and what does that mean" by widening |
| **`snap_zoom`** | Still, then punches in late | A single hard emphasis. The stillness is most of it |
| **`locked_off`** | Nothing | When the content is doing the work. Stillness is a choice |

Two rules that matter more than the choices:

- **A tilt costs legibility.** `tilt_settle` ends off-axis, so text on that
  screen is harder to read for the whole beat. Fine for an establishing shot,
  wrong for the moment the viewer is supposed to understand something.
- **At most one `snap_zoom` per video.** It is the loudest thing available. Two
  of them and neither lands.

The hero beat's `shot` is separate from its zoom. The shot is the camera
finding its subject across the whole beat; the zoom is the lens punching in on
the consequence of the click, and it fires on the frame the mouse actually went
down. Different clocks, deliberately.

## Depth

Inside a stage, layers at different `translateZ` parallax during any camera
move, for free and correctly. The accent glow behind a panel sits at z=-340 and
separates on its own.

You do not configure this per beat — it is built into the components. What it
means for you: **a camera move is worth more than an animated element.** Moving
the camera moves everything, correctly, in relation to everything else. Sliding
one element moves one element.

## Transitions

Every cut cross-dissolves with a paired scale automatically. `transition` on
the incoming beat adds an effect: `dissolve` (default), `sweep`, `flash`,
`none`.

**One or two per video, at most.** The hero moment is what is meant to be
memorable. A video that punctuates every cut has no emphasis left for the one
place it matters. If a plan has a `flash` on every beat, the plan is wrong.

The one reliable use: `flash` on the logo beat. A mark arriving on a hard cut
reads as a claim; the same mark dissolving in reads as a watermark.

## Sound

`scripts/gen-audio.mjs` scores the video from `plan.json`. You do not author
cues — they are derived, so re-timing a beat re-times the audio with no second
file to keep in sync.

What it places:

- **Logo beat** → a riser ending exactly on the cut, then an impact
- **Interaction beat** → a whoosh at the start, and a click **on the frame the
  mouse actually went down**, read back out of the recording track
- **CTA** → a softer impact
- **Other cuts** → a quiet whoosh
- **Under all of it** → a synthesized pad, ducked beneath every impact

Everything is generated with plain Node — no API key, no downloads, no licence
question. Drop an mp3 at `public/audio/music.mp3` and it replaces the pad.

Set `music: false` in the plan for cues without a bed. There is no way to ask
for silence, and that is intentional: a silent launch video is a broken one.

## The numbers

These are not preferences. They are what the components already do, and a plan
that fights them produces a worse video.

| | |
|---|---|
| Entrances | Blur 12px → 0 over 8 frames. Everything arrives slightly out of focus |
| Held shots | 2–3px of drift across the beat. Invisible per second, alive across ten |
| Cursor travel | Eased arc, decelerating. **Linear cursor movement is the clearest tell that a video was generated** |
| Click | Scale 1.0 → 0.86 → 1.0 over 6 frames — about how long a real click looks |
| Typography | Never under 45 frames. Below that it is a flash card |
| Camera settle | Most shots finish around 60–80% of the beat and hold |

**No springs, no bounces, no elastic easing.** Three curves exist in
`src/lib/motion.ts` and they are the whole vocabulary. Bounce reads as
template; the restraint is the look.

## What makes it look generated

Each of these has shipped in a real Pitchframe video and each one was the thing
that made it look wrong:

- **Motion on every element.** If three things are moving, none of them is the
  subject. One thing moves; the camera does the rest.
- **A transition effect on every cut.** Emphasis is a budget.
- **A camera move that never settles**, on a beat the viewer needs to read.
- **The hero beat cut short to fit another beat in.** The most common way a
  demo sneaks back in, and it always looks like hedging.
- **Two hard emphases** — a `snap_zoom` and a `flash` competing in the same
  ten seconds.
- **Footage stretched past ~1.6×** because the beat was sized before the
  recording existed. Size the beat to `frame_count`.

## Editing requests, translated

When the founder asks for a change, this is usually what they mean:

| They say | You change |
|---|---|
| "make it more cinematic" | `framing` to `bleed` first, then `shot` to `push_in_reveal`, and *remove* effects |
| "it looks like a screenshot" | `framing` — it is almost certainly `contained` |
| "it feels flat" | The beat has `locked_off` or no shot — give it a camera |
| "it's monotonous" | No surface variation — put a `mesh` or `light` on the payoff |
| "get closer" | `framing: "closeup"` with a `crop`, not a bigger zoom |
| "show it in a browser / on a mac" | `chrome: "macos"` — already the default |
| "the text is boring" | `layout: "stacked"`, if it is three or four short words |
| "too busy" | Drop transitions to `dissolve`; check for competing motion |
| "hold on that longer" | Lengthen the hero beat, re-space the rest, re-run gen-audio |
| "the zoom is on the wrong thing" | `zoom_target`, not the shot |
| "add music" | It is already there — check `music: false` and whether gen-audio ran |
