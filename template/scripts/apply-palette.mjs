#!/usr/bin/env node
/**
 * Writes src/theme.ts from palette.json.
 *
 * theme.ts is a generated file with literal hex values baked in. That is the
 * point: there is exactly one place in the composition where a colour is
 * written down, it is inspectable, and regenerating it is how a video changes
 * brand. No component may contain a colour literal.
 *
 * Derived tokens (surfaces, borders, muted text) are computed here rather than
 * in the components, so a product with a light brand and a product with a dark
 * one both get a coherent set instead of the same hardcoded greys.
 *
 * Usage: node pitchframe/scripts/apply-palette.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");

const parseHex = (hex) => {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** Linear blend, `amount` of `b` into `a`. */
const mix = (a, b, amount) => {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
};

/** Walks a colour toward white. Used to build the light end of a mesh. */
const lift = (hex, amount) => mix(hex, "#ffffff", amount);

const luminance = (hex) => {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const rgba = (hex, a) => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * A brand colour has to survive being set as 100px type on the background.
 * Rather than discarding a dark brand colour, walk it toward the text colour
 * until it clears 4.5:1 — a lightened brand still identifies the brand, an
 * illegible one identifies nothing.
 */
const ensureLegible = (color, background, text) => {
  if (!color) return { color, adjusted: false, steps: 0 };
  let out = color;
  let steps = 0;
  while (contrast(out, background) < 4.5 && steps < 20) {
    out = mix(out, text, 0.08);
    steps++;
  }
  return { color: out, adjusted: steps > 0, steps };
};

/**
 * The same idea for a light surface: walk a colour toward black until it
 * clears `min` against the *darkest* stop of the mesh it sits on.
 *
 * A fixed mix ratio is what failed. `ACCENT_ON_LIGHT` was `mix(ACCENT, black,
 * 0.42)` regardless of what the accent was, and for a mid-tone accent that
 * lands at 1.89:1 on `MESH_LIGHT_DEEP` — invisible, and the identical failure
 * the comment above `TEXT_ON_LIGHT` describes being fixed for text and not for
 * the accent beside it. A ratio cannot know how bright the colour it is given
 * happens to be; only measuring can.
 *
 * The darkest stop rather than the lightest because type crossing a gradient
 * meets every stop on the way, and the one it can disappear into is the one
 * that decides.
 */
const darkenUntil = (color, backdrop, min) => {
  if (!color) return { color, adjusted: false, steps: 0 };
  let out = color;
  let steps = 0;
  while (contrast(out, backdrop) < min && steps < 24) {
    out = mix(out, "#000000", 0.06);
    steps++;
  }
  return { color: out, adjusted: steps > 0, steps };
};


/* --------------------------------------------------------------- hue math */

const rgbToHsl = (hex) => {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, sat, l];
};

const hslToHex = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  );
};

/** Rotates hue, optionally re-targeting saturation and lightness. */
const shift = (hex, deg, sat = null, light = null) => {
  const [h, s, l] = rgbToHsl(hex);
  return hslToHex(h + deg, sat ?? s, light ?? l);
};

const desaturate = (hex, amount) => {
  const [h, s, l] = rgbToHsl(hex);
  return hslToHex(h, s * (1 - amount), l);
};

/**
 * The look.
 *
 * Everything up to here derives *one* palette from the brand: a near-black
 * frame with a single accent. That is a good default and a bad monoculture —
 * every product came out looking like the same video with the hue changed.
 *
 * A style decides the frame the product sits in: how dark, how many hues, how
 * saturated. It never invents colour out of nothing — every stop is derived
 * from the brand accent by rotating hue or moving saturation, so two products'
 * videos in the same style still look like different companies.
 *
 * Each returns the tokens that differ; everything else falls through to the
 * signature behaviour.
 */
const STYLES = {
  /** Near-black, one accent. The house default. */
  signature: (a, base) => ({
    bg: null,
    mesh: [mix(base, a, 0.28), mix(base, a, 0.62), lift(a, 0.3)],
    lightMesh: [lift(a, 0.9), lift(a, 0.62), lift(a, 0.34)],
    glowAlpha: 0.16,
  }),

  /**
   * Dark, but lit by several near hues instead of one. Analogous rotations of
   * ±22° read as a coloured light source rather than as separate colours,
   * which is what makes it ambient rather than busy.
   */
  ambient: (a, base) => ({
    bg: null,
    mesh: [
      mix(base, shift(a, -22, 0.5), 0.3),
      mix(base, shift(a, 18, 0.55), 0.55),
      lift(shift(a, 34, 0.45), 0.34),
    ],
    lightMesh: [lift(shift(a, -18), 0.88), lift(shift(a, 14), 0.6), lift(shift(a, 30), 0.36)],
    glowAlpha: 0.2,
  }),

  /**
   * Soft and light. The one style that inverts the frame, so the text tokens
   * invert with it — a pastel look with white type is unreadable, and that is
   * exactly the bug the light-surface work already caught once.
   */
  pastel: (a, base) => ({
    bg: hslToHex(rgbToHsl(a)[0], 0.34, 0.955),
    text: hslToHex(rgbToHsl(a)[0], 0.5, 0.16),
    mesh: [
      hslToHex(rgbToHsl(a)[0] - 26, 0.62, 0.86),
      hslToHex(rgbToHsl(a)[0] + 22, 0.66, 0.84),
      hslToHex(rgbToHsl(a)[0] + 48, 0.6, 0.88),
    ],
    lightMesh: [
      hslToHex(rgbToHsl(a)[0], 0.5, 0.96),
      hslToHex(rgbToHsl(a)[0] + 24, 0.6, 0.9),
      hslToHex(rgbToHsl(a)[0] - 20, 0.58, 0.86),
    ],
    glowAlpha: 0.12,
  }),

  /** No hue at all. The product's own colour is the only colour on screen. */
  mono: (a, base) => ({
    bg: "#0a0a0a",
    accent: "#f2f2f2",
    mesh: [mix(base, "#ffffff", 0.22), mix(base, "#ffffff", 0.4), "#d8d8d8"],
    lightMesh: ["#f4f4f4", "#dcdcdc", "#c2c2c2"],
    glowAlpha: 0.1,
  }),

  /**
   * Wide hue spread — the brand plus rotations far enough apart to read as
   * separate colours. Loud on purpose, and wrong for anything that has to be
   * read over the top of it.
   */
  spectrum: (a, base) => ({
    bg: null,
    mesh: [
      mix(base, shift(a, -70, 0.78), 0.42),
      mix(base, shift(a, 62, 0.8), 0.6),
      lift(shift(a, 150, 0.72), 0.28),
    ],
    lightMesh: [lift(shift(a, -70), 0.84), lift(shift(a, 60), 0.55), lift(shift(a, 150), 0.5)],
    glowAlpha: 0.22,
  }),
};

const palettePath = path.join(PITCHFRAME_DIR, "palette.json");
if (!fs.existsSync(palettePath)) {
  process.stderr.write("no palette.json — run extract-palette.mjs first\n");
  process.exit(1);
}

const p = JSON.parse(fs.readFileSync(palettePath, "utf8"));

const BACKGROUND = p.background ?? "#0a0a0f";
const rawText = p.text ?? "#ffffff";

/**
 * The look, from --style, then palette.json, then the default.
 *
 * An unknown name falls back rather than failing: a typo in a style should
 * cost the video its look, not its render.
 */
const requested =
  process.argv.find((a) => a.startsWith("--style="))?.split("=")[1] ?? p.style ?? "signature";
const STYLE_NAME = STYLES[requested] ? requested : "signature";

// A light brand background is not the genre — unless the style says it is.
const bgLum = luminance(BACKGROUND);
const DARK_BASE = bgLum > 0.18 ? mix(BACKGROUND, "#000000", 0.94) : BACKGROUND;

// Resolved twice: once with a provisional accent to learn the frame colour,
// then again once the accent has been made legible against that frame.
const provisional = p.accent ?? p.primary ?? "#808080";
const LOOK = STYLES[STYLE_NAME](provisional, DARK_BASE);
const SURFACE_BASE = LOOK.bg ?? DARK_BASE;

/**
 * Text has to be legible on the *video's* background, not the site's.
 *
 * A light-themed product declares near-black text. Once the background is
 * forced dark, that text is invisible — and worse, every colour derived by
 * walking "toward the text colour" then walks toward black, so the accent gets
 * darker instead of lighter and the correction runs backwards. Flip the text
 * first; everything downstream depends on it pointing the right way.
 */
const readableInk = luminance(SURFACE_BASE) > 0.45 ? "#141414" : "#ffffff";
const textFlipped = contrast(rawText, SURFACE_BASE) < 4.5;
// `readableInk`, not always white: a pastel frame is light, and forcing white
// there reproduces the 1.5:1 failure the light surfaces already caused once.
const TEXT = LOOK.text ?? (textFlipped ? readableInk : rawText);

const rawAccent = p.accent ?? p.primary ?? null;
const accentFix = ensureLegible(rawAccent, SURFACE_BASE, TEXT);
const primaryFix = ensureLegible(p.primary ?? rawAccent, SURFACE_BASE, TEXT);

const ACCENT = LOOK.accent ?? accentFix.color ?? TEXT;
const PRIMARY = primaryFix.color ?? ACCENT;
const HAS_ACCENT = Boolean(rawAccent);

/**
 * Re-resolved against the *final* accent.
 *
 * The first pass only needed a frame colour. Building the mesh from the raw
 * brand value would put stops on screen that the accent was corrected away
 * from — the video's key colour and its background would disagree.
 */
const FINAL = STYLES[STYLE_NAME](ACCENT, SURFACE_BASE);
const MESH = FINAL.mesh;
const LIGHT_MESH = FINAL.lightMesh;

/*
 * The light-surface pair, measured against the darkest mesh stop rather than
 * mixed by a fixed ratio. The 0.78 and 0.42 they started as were a guess that
 * happened to hold for text and did not for the accent — 1.89:1 on a mid-tone
 * brand colour, invisible in the video and undetectable in the code.
 */
const LIGHT_BACKDROP = LIGHT_MESH[2];
const onLightText = darkenUntil(mix(ACCENT, "#000000", 0.78), LIGHT_BACKDROP, 4.5);
// 3:1 is the WCAG large-text threshold, and the accent is always display type.
const onLightAccent = darkenUntil(mix(ACCENT, "#000000", 0.42), LIGHT_BACKDROP, 3);
const TEXT_ON_LIGHT_FINAL = onLightText.color;
const ACCENT_ON_LIGHT_FINAL = onLightAccent.color;

const fonts = p.fonts ?? {};
const SANS = fonts.sans ?? "Inter";
const SERIF = fonts.serif ?? "Instrument Serif";

const lines = `/**
 * GENERATED FILE — written by pitchframe/scripts/apply-palette.mjs.
 *
 * Every colour the composition renders resolves here, as a literal. Do not
 * hand-edit: change palette.json and re-run the script, or the next generate
 * will overwrite whatever you wrote.
 *
 * Source palette: ${JSON.stringify({ background: p.background, text: p.text, primary: p.primary, accent: p.accent, logo_color: p.logo_color })}
 */

/** Deep near-black the whole video sits on. */
export const BACKGROUND = ${JSON.stringify(SURFACE_BASE)};

/** Body and display text. */
export const TEXT = ${JSON.stringify(TEXT)};

/** The product's primary brand colour — CTAs, key marks. */
export const PRIMARY = ${JSON.stringify(PRIMARY)};

/** The accent used for payoff words, glows and annotations. */
export const ACCENT = ${JSON.stringify(ACCENT)};

/** False when extraction found no brand colour and the video stays neutral. */
export const HAS_ACCENT = ${HAS_ACCENT};

/** The logo's own colour when the mark declared one. */
export const LOGO = ${JSON.stringify(p.logo_color ?? null)};

/** Panel and card fill — the surface a screenshot sits on. */
export const SURFACE = ${JSON.stringify(mix(SURFACE_BASE, TEXT, 0.05))};
export const SURFACE_ALT = ${JSON.stringify(mix(SURFACE_BASE, TEXT, 0.09))};

export const BORDER = ${JSON.stringify(rgba(TEXT, 0.1))};
export const BORDER_STRONG = ${JSON.stringify(rgba(TEXT, 0.16))};

export const TEXT_MUTED = ${JSON.stringify(rgba(TEXT, 0.66))};
export const TEXT_FAINT = ${JSON.stringify(rgba(TEXT, 0.42))};

/** Shadow tuned to the background rather than assuming black. */
export const SHADOW = ${JSON.stringify(rgba(mix(SURFACE_BASE, "#000000", 0.6), 0.85))};

/** The ambient glow behind type and panels. */
export const GLOW = ${JSON.stringify(rgba(ACCENT, HAS_ACCENT ? (LOOK.glowAlpha ?? 0.16) : 0.08))};

/** The look this theme was generated in. Read by nothing; here to be seen. */
export const STYLE = ${JSON.stringify(STYLE_NAME)};

/**
 * Mesh stops — the colours a gradient-mesh surface is built from.
 *
 * Reference launch videos alternate between near-black and a large soft
 * colour field, and that alternation is most of what gives them rhythm. The
 * field has to be the product's own colour or the video stops belonging to
 * the product, so the stops are derived here rather than picked in a
 * component.
 *
 * MESH_DEEP / MESH_MID / MESH_BRIGHT walk from the background toward the
 * accent and past it toward white. MESH_LIGHT_* are the same idea inverted,
 * for the bright beats.
 */
export const MESH_DEEP = ${JSON.stringify(MESH[0])};
export const MESH_MID = ${JSON.stringify(MESH[1])};
export const MESH_BRIGHT = ${JSON.stringify(MESH[2])};

export const MESH_LIGHT_BASE = ${JSON.stringify(LIGHT_MESH[0])};
export const MESH_LIGHT_MID = ${JSON.stringify(LIGHT_MESH[1])};
export const MESH_LIGHT_DEEP = ${JSON.stringify(LIGHT_MESH[2])};

/**
 * Text on a light surface. Not the same as inverting TEXT: a bright mesh is
 * mid-tone, not white, so pure black is too harsh and the product's own dark
 * neutral reads better.
 *
 * These exist because adding light surfaces without them produced white type
 * on pale lavender at about 1.6:1 — the same class of bug as the light-theme
 * text flip above, and just as invisible until you look at a frame. Any
 * component that can appear on a light surface must switch to these.
 *
 * Both are darkened until they *measure* clear of MESH_LIGHT_DEEP — 4.5:1 for
 * the text, 3:1 for the accent, which is always display type. They used to be
 * fixed mixes, and the accent's landed at 1.89:1 for a mid-tone brand colour:
 * the very failure the paragraph above describes, reintroduced one line below
 * it, because a ratio cannot know how bright the colour it is handed is.
 */
export const TEXT_ON_LIGHT = ${JSON.stringify(TEXT_ON_LIGHT_FINAL)};
export const ACCENT_ON_LIGHT = ${JSON.stringify(ACCENT_ON_LIGHT_FINAL)};

/**
 * The window traffic lights — and these are deliberately NOT derived.
 *
 * Every other colour in this file comes from the product, because a video that
 * reuses another company's palette stops being that product's video. These
 * three are the exception: red/amber/green in the top-left corner is a
 * recognised OS affordance, and the recognition *is* the effect. Tinted to the
 * brand they stop reading as a window and become three arbitrary dots.
 *
 * They live here rather than in the component so the "no colour literals in
 * components" rule stays absolute and greppable — an exception in the theme is
 * visible, an exception in a component is the start of a second palette.
 */
export const WINDOW_CLOSE = "#ff5f57";
export const WINDOW_MIN = "#febc2e";
export const WINDOW_MAX = "#28c840";

export const FONT_SANS = ${JSON.stringify(`"${SANS}", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`)};
export const FONT_SERIF = ${JSON.stringify(`"${SERIF}", "Times New Roman", Georgia, serif`)};

export const FONT_REQUESTS = [
  { family: ${JSON.stringify(SANS)}, weights: "400;500;600;700;800;900" },
  { family: ${JSON.stringify(SERIF)}, weights: "400" },
];

/** Converts any theme hex to rgba() so glows can be tinted without a library. */
export const alpha = (hex: string, a: number): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return \`rgba(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255}, \${a})\`;
};
`;

const out = path.join(PITCHFRAME_DIR, "src", "theme.ts");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines);

const note = [];
if (accentFix.adjusted) {
  note.push(`accent ${rawAccent} lightened to ${ACCENT} for 4.5:1 on ${SURFACE_BASE}`);
}
if (bgLum > 0.18) {
  note.push(`light background ${p.background} darkened to ${SURFACE_BASE} — the genre is dark`);
}
if (textFlipped) {
  note.push(`text ${rawText} was unreadable on ${SURFACE_BASE} — flipped to ${TEXT}`);
}
if (!HAS_ACCENT) note.push("no brand colour found — video stays neutral");

process.stdout.write(
  `theme.ts written\n  background ${SURFACE_BASE}\n  text       ${TEXT}\n  primary    ${PRIMARY}\n  accent     ${ACCENT}\n` +
    note.map((n) => `  note: ${n}\n`).join(""),
);
