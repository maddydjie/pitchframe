---
name: pitchframe-capture
description: Capture real screenshots of the product's UI from its dev server (or a public URL) for the UI beats of a Pitchframe video, with fallbacks when the server won't start or a route is broken. Used by Pitchframe step 6.
---

# UI capture

Real UI, sharp text, correct brand. This is what makes a Pitchframe video look like
the product exists rather than like it was imagined.

This step is the flakiest in the pipeline — dev servers fail, routes need auth, builds
break. It is therefore also the step with the most fallbacks, and **it must never
stop the run.** A video with mock surfaces still ships. A pipeline that halts here
does not.

## The hero moment is recorded, not screenshotted

**Always try `record` first.** Playwright drives the real browser while every
painted frame is captured, so the hero beat plays footage of the product
actually moving — its own easing, its own hover states, its own spinner. A
screenshot pair cross-dissolved is a slideshow, and it looks like one.

```json
{
  "name": "fork",
  "path": "https://example.com/product",
  "record": {
    "maxSeconds": 12,
    "actions": [
      { "type": "click", "selector": "button:has-text('Code')", "duration": 850 },
      { "type": "hover", "selector": "[data-testid='clone-url']", "holdMs": 1400 }
    ]
  }
}
```

That writes `public/assets/fork/0001.jpg…` plus `public/assets/fork.track.json`,
and the plan references it as `"recording": "fork"`.

### Recording actions

`move`, `click`, `type`, `hover`, `drag`, `scroll`, `press`, `wait`, `waitFor`.
Each takes `selector` or `at: {x, y}` (percentages of the viewport).

- **The cursor is recorded, not drawn.** A screencast contains no pointer at
  all, so the recorder logs coordinates and the composition draws the cursor as
  a layer — sharp at any zoom, with the click ripple on the exact frame of the
  press. You do not specify cursor positions anywhere.
- **`click` glides in on an eased arc, pauses, then presses.** Everything about
  the movement is handled; give it a target and a `duration`.
- **`type` types character by character with jitter**, after clicking the field.
- **`scroll` is stepped, not jumped.** `window.scrollTo` paints once and the
  result is a cut, not a scroll.
- **Keep it to two or three actions.** You are recording one moment. A
  six-action script is a demo being smuggled in through the capture layer.

### Two things that fail the recording, on purpose

- **Under 8 distinct frames** — the actions changed nothing visible, which
  means the selector was wrong or the change happens off-screen. Fix the
  selector; do not accept footage of a product that appears not to respond.
- **A `waitFor` that times out** — the screen you came for never arrived, and
  recording the wait is worse than failing.

### Read `frame_count` back and size the beat to it

`capture-result.json` reports how many frames the recording produced. **Update
the hero beat's length to match**, then re-space the beats after it. The
composition stretches footage to fit whatever length the beat has, and past
about 1.6× the speed change stops reading as pacing and starts reading as
wrong.

### Setup vs. recorded actions

`actions` at the top level of the shot run **before** the shutter — logging in,
navigating, seeding state. `record.actions` are **the take**. Nobody wants to
watch a login; get the app to the starting state first.

## The fallback: a before and an after

When a site cannot be driven — auth walls, hostile consent flows, selectors
that will not hold still — capture a pair instead:

```json
{
  "name": "fork.png",
  "path": "https://example.com/product",
  "waitMs": 3000,
  "interaction": { "type": "click", "selector": "button:has-text('Code')", "settleMs": 1400 }
}
```

That writes `fork_before.png` and `fork_after.png` for `before_screenshot` and
`after_screenshot`, and the beat falls back to the synthetic cursor
choreography. **This path is a degradation, never a target.** The capture fails
the shot if the two frames come out identical, for the same reason as above.

**Take selectors from `.work/recon.json`, not from source.** Recon verified
them against the live DOM, which is what the recorder will meet. Its `at`
coordinates are already percentages of the viewport, so they copy straight into
`target_element.coordinates` and `zoom_target` with no conversion.

Where recon has no candidate — a route it never visited, an element behind a
setup action — fall back to reading the components. Never to guessing: a
selector that 10% misses centres the hero shot on empty chrome.

Everything below applies to plain shots, recordings and interaction pairs.

## Decide the shots

The plan says which beats need screens. The interaction beat is the one that
matters — get the hero pair before anything else, because a launch video
without it has no spine. Use `hero_moment` from the brief and the route list in
`.work/product.json`.

Prefer, in order:
1. A route that shows the thesis *happening* (a result, a filled field, a diff).
2. A route dense enough to read as a real product (dashboard, list, detail view).
3. The landing page hero — always capturable, weakest proof.

Avoid: empty states, login screens, 404s, anything behind a paywall, and settings
pages with nothing filled in. An empty table is worse than a mock.

Two practical notes:
- **Dynamic routes need a real id.** `/calls/[id]` is not a URL. Find a seed script,
  a fixture, or a demo id in the repo. If there isn't one, capture the list route
  instead of guessing an id that 404s.
- **Name files after what they show**, not after the beat number:
  `crm_writeback.png`, not `ui_beat_2.png`. The founder will edit these by name later.

## Write the capture manifest

Write `pitchframe/.work/capture.json`:

```json
{
  "baseUrl": null,
  "devCommand": null,
  "port": null,
  "shots": [
    {
      "name": "call_transcript.png",
      "path": "/calls/demo",
      "waitMs": 1200,
      "scrollY": 0,
      "hide": [".cookie-banner", "[data-testid=devtools]"]
    },
    { "name": "crm_writeback.png", "path": "/settings/crm", "waitMs": 1500 }
  ]
}
```

Leave `baseUrl`, `devCommand` and `port` as `null` to let the script detect them —
it reads `package.json` scripts and framework defaults. Set them explicitly only when
detection would be wrong (a monorepo where the app is not at the root, a non-standard
port, a deployed URL you want to use instead of localhost).

`hide` takes CSS selectors that get `display:none` before the shot — cookie banners,
dev toolbars, Next.js error overlays. Use it liberally; a cookie banner in a launch
video is the most amateur thing in the frame.

### Driving the UI to a state

Plenty of products keep their best screen behind an interaction — a chat app is a
blank box until someone types, a dashboard is empty until a project is selected. If
the `hero_moment` is one of those, a URL alone will never reach it. Add `actions`,
which run before the shot:

```json
{
  "name": "security_scan.png",
  "path": "/",
  "actions": [
    { "type": "fill", "selector": "textarea", "text": "build a login form" },
    { "type": "press", "key": "Enter" },
    { "type": "waitFor", "selector": "[data-panel=workbench]", "timeout": 45000 },
    { "type": "click", "selector": "button:has-text('Security')" },
    { "type": "wait", "ms": 2500 }
  ]
}
```

Available: `fill`, `type`, `click`, `hover`, `press`, `scroll`, `wait`, `waitFor`.
All are best-effort except `waitFor` — a `waitFor` that times out fails the shot,
which is correct, because it means the screen you wanted never appeared and you would
otherwise be photographing a loading spinner.

Find selectors by reading the components, not by guessing. And keep action chains
short: every step is another thing that can drift when the founder ships next week.

## Run it

```bash
node pitchframe/scripts/capture.mjs
```

The script boots the dev server if nothing is already serving, waits for the port,
captures each shot at 1920×1080 with a 2× device pixel ratio, and shuts the server
down. It writes `pitchframe/.work/capture-result.json` with a per-shot status and
never exits non-zero for a partial capture.

Read that result file. It is the ground truth about which shots exist — do not assume
a shot succeeded because you asked for it.

## Fallback ladder

Take the first rung that works, log it, and move on. Never ask the founder.

1. **Local dev server** — the wedge. Real UI, real data, real brand.
2. **A deployed URL** — from the README, `package.json` `homepage`, `metadata.url`, or
   an OG tag. Real UI, possibly a marketing site rather than the app. Set it as
   `baseUrl` and re-run.
3. **Landing page only** — if some routes fail but the root renders, capture the
   landing page and reuse it across UI beats *with different shots and scroll
   positions* so it doesn't read as a repeated frame.
4. **Mock surfaces** — set `screenshot` to `null` on the affected beats. The
   composition renders an abstracted product surface in the brand color. Honest, and
   it still looks composed.

Log every rung you took and why. If you ended up on rung 3 or 4, say so in the final
message to the founder — one line, no apology, and name the fix
(`start your dev server and re-run for real screenshots`).

## After capture

- Confirm each file exists in `pitchframe/public/assets/` and is over ~10KB. A 2KB
  PNG is a blank page — treat it as a failed shot and fall back.
- Update `plan.json` so every `screenshot` field names a file that actually exists,
  or is `null`. A plan pointing at a missing file renders the mock anyway, but the
  founder's edits will be confusing if the plan lies.
- Never edit, recolor, or composite the screenshots. The composition applies the tilt,
  the focus pull and the glow at render time; a pre-treated screenshot gets treated
  twice and looks wrong.
