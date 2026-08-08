---
name: pitchframe-recon
description: Read a live website to learn what a product is and what can be done to it in a browser — identity, copy, ranked interactive elements with durable selectors, and obstacles like login walls. Required for URL mode; also run in codebase mode, because a selector verified live beats one read out of source.
---

# Reading a site

Pitchframe normally learns what a product is from its codebase. Given only a
URL there is no codebase, so it learns the same things by looking at the site.

Run it:

```bash
node pitchframe/scripts/recon.mjs https://example.com
```

Writes `pitchframe/.work/recon.json`. It never exits non-zero — a partial read
is a normal outcome.

## Run this in codebase mode too

Not just for URLs. The hero moment needs a real element to act on, and a
selector **verified in the live DOM a minute before the recorder runs** is
strictly more reliable than one inferred from source. Source tells you what the
component intends to render; the DOM tells you what is actually there, after
the framework, the feature flags and the A/B test.

Point it at the dev server once it is up.

## What comes back

```json
{
  "identity": { "site_name": "Acme", "h1": "Build your Enterprise CRM at AI Speed",
                "description": "The #1 Open Source CRM for modern teams…" },
  "headings": ["…"],
  "nav": ["Product", "Pricing", "Docs"],
  "obstacles": { "auth_wall": false, "consent_banner": false, "paywall": false },
  "logo": { "selector": "header svg", "kind": "svg" },
  "routes": ["/pricing", "/docs"],
  "candidates": [
    { "label": "Code", "selector": "button:has-text(\"Code\")", "score": 9,
      "why": ["opens a panel", "button", "in main content", "above the fold"],
      "at": { "x": 62.6, "y": 20.6 }, "below_fold": false }
  ]
}
```

`at` is a percentage of the viewport — **the same units the plan uses for
`zoom_target`**, so it copies straight across with no conversion.

## Reading the candidates

They are ranked, not chosen. The ranking knows what is *filmable*; it does not
know what the video is about. That is your job, against the thesis.

The scores mean something specific:

| Signal | Why it ranks |
|---|---|
| **"opens a panel"** | `aria-expanded` / `aria-haspopup`. **The strongest signal there is** — the element's whole purpose is revealing something, which is the definition of a visible state change, which is the definition of a hero moment |
| "accepts typing" | A field. Typing is inherently filmable and shows intent |
| "switches view" | A tab. Reliable state change, slightly weaker than a reveal |
| "in page chrome" | **Negative.** A nav link navigates away, which ends the shot rather than being it |
| "boilerplate" | **Negative.** Sign-in, cookies, social links |

A high score means "this will film well", never "this is the story". A
top-ranked button that has nothing to do with the thesis is the wrong shot.
Pick the highest-scoring candidate that **proves the claim** — and if the one
you want scores low, use it anyway and note why.

## Obstacles change the plan, not just the capture

- **`auth_wall`** — a password field on the landing page. The product is behind
  a login and the recorder will not get past it. Film the marketing surface, or
  in codebase mode use a local dev server with seeded state.
- **`consent_banner`** — recon dismisses it and re-scans automatically, because
  the first scan of a site with a banner is a scan of the banner. `capture.mjs`
  dismisses it again at record time.
- **`paywall`** — the good screens are gated. Plan around it.

## When nothing is drivable

`candidates` comes back empty on a static marketing page. **Say so.** Do not
promote a scroll to a hero moment — a video of someone scrolling a homepage is
a demo, and a weak one.

What to do instead, in order:

1. **Look at `routes`.** The interesting surface is often one click away — a
   `/playground`, `/demo`, `/docs` with a live example. Re-run recon against it.
2. **Fall back to the strongest honest shape**: typography carrying the thesis,
   a logo beat, one establishing `ui` shot of the site, a payoff, a CTA.
3. **Tell the founder in one line** at the end — that their site has no
   interactive surface to film, and that a launch video wants one. That is
   useful information about their site, not an apology.

## Feeding the rest of the pipeline

- **Positioning** — `identity`, `headings` and `nav` are the evidence in URL
  mode, standing in for README and `package.json`.
- **Plan** — the chosen candidate's `at` becomes `target_element.coordinates`,
  and usually `zoom_target` points at the consequence rather than the button.
- **Capture** — the candidate's `selector` goes straight into the `record`
  action. It was verified live, so it does not need guessing.
- **Logo** — `logo.selector` becomes an `element` capture at high DPI.
