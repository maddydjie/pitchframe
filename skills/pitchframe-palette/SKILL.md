---
name: pitchframe-palette
description: Extract a product's colours from its codebase or deployed site as strict JSON and generate src/theme.ts from them. Colours are data, never description. Used by Pitchframe step 2.
---

# Palette

The video has to look like it came from this company. That is carried almost
entirely by one thing: the accent colour.

**The palette is data, not description.** Your output is hex. Not "a warm
indigo", not "their brand blue" — `#4a38f5`. A description cannot be rendered,
and every downstream step that has to interpret prose is a step that can
interpret it differently.

## Two commands

```bash
node pitchframe/scripts/extract-palette.mjs      # → palette.json
node pitchframe/scripts/apply-palette.mjs        # → src/theme.ts
```

Run both. The first finds the colours; the second bakes them into the only file
in the composition where a colour is written down. **Skipping the second is why
two products' videos come out looking identical** — if that happens, this is
the first thing to check.

## The extraction ladder

`extract-palette.mjs` tries three sources in strict priority order and stops at
the first that yields a brand colour. That order is not arbitrary:

**1. `tailwind.config.{ts,js,mjs,cjs}` → `theme.extend.colors`** — authoritative.
A Tailwind config is a *declaration* of what the brand is. It reads `primary`,
`brand`, `accent`, `secondary`, handling both `primary: '#fff'` and
`primary: { DEFAULT: …, 500: … }` scales. It does not execute the config —
running arbitrary code from a repo you are making a video about is a bad trade
for a few hex values.

**2. Global CSS custom properties** — declared, one step less authoritative.
Checks the usual locations (`app/globals.css`, `src/index.css`, …) for
`--primary`, `--accent`, `--brand`, `--color-primary`, `--background`,
`--foreground`. Handles hex, `rgb()`, `hsl()`, and the bare `222 47% 11%`
triplet shadcn writes into `:root`.

**3. Playwright on the deployed URL** — observed, weakest.
Loads the site and reads computed styles: `body` background, the largest
heading's colour, and the primary CTA — the biggest filled, saturated,
button-like element above the fold. The accent is the most-used saturated
colour weighted by painted area.

The URL comes from `--url`, or `package.json` `homepage`. For a product you
only have a URL for, pass it explicitly:

```bash
node pitchframe/scripts/extract-palette.mjs --url https://example.com
```

## Output

```json
{
  "background": "#0a0a0f",
  "text": "#ffffff",
  "primary": "#4a38f5",
  "accent": "#4a38f5",
  "logo_color": null
}
```

Five keys, all hex or null. No prose, no extra fields, no commentary.

`apply-palette.mjs` then writes `src/theme.ts` with those values as literals,
plus the derived tokens the components need — `SURFACE`, `SURFACE_ALT`,
`BORDER`, `TEXT_MUTED`, `SHADOW`, `GLOW`. Deriving them from the palette rather
than hardcoding greys is what makes a product with a violet brand and one with
a green brand come out looking like different videos rather than the same video
with one colour swapped.

## Choosing the look

The accent says which company. The **style** says what kind of film. Set it in
`palette.json` as `"style"`, or pass `--style=<name>` to the generator.

Every stop in every style is derived from the brand accent by rotating hue or
moving saturation — so two products in the same style still look like different
companies. You are choosing a frame, never inventing colour.

| Style | What it is | Reach for it when |
|---|---|---|
| **`signature`** | Near-black, one accent | **The default.** Right whenever nothing below is clearly righter |
| `ambient` | Dark, analogous hues ±22° — reads as coloured light | The product is calm, spatial, or creative; or its UI is bright and needs a dark ground |
| `pastel` | Light ground, dark ink, soft mesh | The product is playful or consumer, **and its UI is dark** |
| `mono` | Black and white, no hue | The product is a developer tool, or the brand has no usable colour |
| `spectrum` | Wide hue spread, loud | A launch that wants to feel like an event. Rarely right twice |

### The rule that decides it more often than personality

**Pick the style against the product's UI, not just its brand.** The frame
exists to make the product the brightest, most separated thing on screen.

- A **light UI** — a white canvas, a light dashboard — needs a **dark** frame.
  `signature` or `ambient`. A pastel frame around a white app leaves the
  product nothing to sit against and the hero beat goes flat.
- A **dark UI** can take `pastel`, and the contrast is striking.

A hand-drawn whiteboard app is the worked example: playful, sketchy, obviously
a "pastel" personality — and a pure white canvas. It still gets `ambient`.
Personality lost to legibility, which is the right way round.

### Two more limits

- **One style per video.** It is the frame, not a beat property.
- **`spectrum` fights typography.** It is a lot of colour to read over; if the
  video leans on its copy, use `ambient` instead.

## What the generator fixes for you

- **A dark brand colour is lightened, not discarded.** Walked toward the text
  colour until it clears 4.5:1 on the background. A lightened brand still
  identifies the brand; an illegible one identifies nothing.
- **A light background is forced dark.** The genre is dark. The hue is kept.
- **No brand colour found → neutral.** `HAS_ACCENT` goes false and the video is
  white-on-near-black. **A wrong brand colour is worse than no brand colour**:
  neutral reads as deliberate, wrong reads as a template somebody forgot to
  configure.

All three are printed when the script runs. Put them in the run log.

## Reading the result before you trust it

Two checks, both cheap:

- **Is the top candidate actually a brand colour?** From a live site the most
  frequent saturated colour is often `#0000ee` — the browser's default
  unstyled-link blue. A declared CSS variable beats a frequency count every
  time, which is why the ladder is ordered the way it is.
- **Would the founder recognise this as their colour?** If you had to reason
  three steps to justify it, you are guessing. Prefer neutral.

## Fonts

`palette.json` carries colours only. Fonts are an optional `fonts` field
(`{ "sans": "Inter", "serif": "Instrument Serif" }`) that the generator reads if
present and otherwise defaults. Only name fonts that exist on Google Fonts — a
self-hosted or licensed face cannot be loaded at render time, so name the
closest Google equivalent and log the substitution.

## Never

- Put a colour in `plan.json`. The plan says which word is accented; the theme
  says what the accent is.
- Put a colour literal in a component. If you need a shade the theme doesn't
  expose, add a derived token to the generator so every future video gets it.
- Hand-edit `theme.ts`. It is generated, and the next run overwrites it.
