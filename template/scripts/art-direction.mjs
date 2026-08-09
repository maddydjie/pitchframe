#!/usr/bin/env node
/**
 * Art direction — decides what this video *looks* like, before anything is
 * written or shot.
 *
 * The complaint that produced this file: every video came out the same. Pale
 * frame, logo, one application in a window, some type. That was never a
 * renderer limitation — the composition already supports five palette styles,
 * three surfaces, three type layouts, four framings, eight camera moves, two
 * drawn archetypes and a 3D treatment. The combinatorial space is enormous and
 * the Director kept landing on the same point in it, because nothing ever
 * asked it not to, and "be varied" is not an instruction a model can check
 * itself against.
 *
 * So the look is chosen *here*, mechanically, and the Director is handed the
 * result as a constraint rather than a suggestion. Two rules make it work:
 *
 *   1. **Derived from the product.** A light-UI product and a dark-UI product
 *      get different frames for a legibility reason, not a random one. The
 *      same product always gets the same direction — reruns are reproducible.
 *   2. **Never a repeat of a previous run.** Past directions are read out of
 *      every `direction.json` under `runs/`. If this product's first-choice
 *      look was already used, it rotates. This is the part that fixes the
 *      complaint: sameness is now a state the script can detect.
 *
 *   node scripts/art-direction.mjs
 *
 * Writes .work/direction.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runsDir } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");
const RUNS_DIR = runsDir(PITCHFRAME_DIR);

const log = (msg) => process.stdout.write(`  ${msg}\n`);
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

/* ------------------------------------------------------------ the options */

/**
 * Every axis below is a real, rendered field. Nothing here is aspirational —
 * an option the composition ignores would produce a direction that reads as
 * varied and renders identically, which is the failure this file exists to
 * fix, wearing a different hat.
 */

/** Palette styles, from `apply-palette.mjs`. */
const STYLES = ["signature", "ambient", "pastel", "mono", "spectrum"];

/** Type layouts, from `TypographyBeat`. */
const LAYOUTS = ["centered", "stacked", "ghosted"];

/** From `AccentStyle`. `none` is included so not every video accents a word. */
const ACCENTS = ["italic_serif", "bold_sans", "none"];

/** From `TransitionKind`. `dissolve` is the house style and stays commonest. */
const TRANSITIONS = ["dissolve", "flash", "sweep"];

/**
 * How the hero cuts. Each is an ordered sequence of framings, and the order is
 * the grammar: establish, go in, come out. `component` lifts a crop out of the
 * app onto the video's own surface, which is what the reference films do most
 * and what Pitchframe did least.
 */
const HERO_PROGRESSIONS = [
  ["contained", "closeup", "component"],
  ["bleed", "component", "closeup"],
  ["component", "closeup", "bleed"],
  ["closeup", "bleed", "component"],
  ["bleed", "closeup", "contained"],
];

/**
 * Drawn archetypes, from `VectorRender`.
 *
 * There is deliberately no all-footage option. The reference films are mostly
 * drawn, not filmed, and Pitchframe was the exact inverse — the one run that
 * rolled an empty list produced a video that was a screen recording with
 * captions, which is the look this whole layer exists to escape. The hero
 * moment stays real footage regardless; these are the shots around it.
 */
const DRAWN = [
  ["chips"],
  ["fan"],
  ["grid"],
  ["chips", "grid"],
  ["fan", "grid"],
  ["chips", "fan"],
];

/** Which beat, if any, gets the 3D treatment. */
const THREE_D = ["logo", "cta", "typography", null];

/* ------------------------------------------------------------- the inputs */

const palette = readJson(path.join(PITCHFRAME_DIR, "palette.json"), {});
const recon = readJson(path.join(WORK_DIR, "recon.json"), {});

/**
 * The tracks actually on disk, so the direction can never name one that is not
 * there.
 *
 * Music used to be the Director's to remember, and a Director that forgot left
 * the video scored with a synthesized pad while real tracks sat unused. Which
 * track is still an editorial choice; *whether there is one* is not.
 */
const MUSIC_DIR = path.join(PITCHFRAME_DIR, "public", "audio", "music");
const TRACKS = fs.existsSync(MUSIC_DIR)
  ? fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort()
  : [];

const product =
  recon?.identity?.site_name ??
  recon?.identity?.title?.split(/[|·—-]/)[0]?.trim() ??
  "product";

/**
 * A stable number derived from the product's name and brand colour.
 *
 * Stable so a rerun of the same product reproduces the same video rather than
 * a new one — which matters for the judge loop, where only the rewritten lines
 * should change. FNV-1a because it is four lines and has no dependencies.
 */
const hashOf = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const seedFor = (name, pal = {}) =>
  hashOf(`${name}|${pal.primary ?? ""}|${pal.accent ?? ""}`);

const seed = seedFor(product, palette);
const pick = (list, salt) => list[(seed + salt) % list.length];

/* ------------------------------------------------- the one derived choice */

/**
 * Whether the product's own UI is light or dark decides the frame around it,
 * and this is the single axis that is *not* free to vary.
 *
 * The video exists to make the product the brightest, most separated thing on
 * screen. A pale frame around a white app leaves it nothing to sit against and
 * the hero beat goes flat — so a light product gets a dark frame regardless of
 * how well pastel would suit its brand. Personality lost to legibility.
 */
const luminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  // Rec. 601 is close enough to decide light-vs-dark and needs no gamma work.
  return (
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  );
};

const uiLum = luminance(recon?.identity?.theme_color ?? palette.background);
const lightUI = uiLum !== null && uiLum > 0.6;

/** Styles that produce a dark enough frame to sit a white app against. */
const DARK_FRAME = ["signature", "ambient", "mono", "spectrum"];

/* ------------------------------------------------------- previous look-up */

const history = [];
if (fs.existsSync(RUNS_DIR)) {
  for (const dir of fs.readdirSync(RUNS_DIR)) {
    const d = readJson(path.join(RUNS_DIR, dir, "direction.json"));
    if (d?.signature) history.push({ dir, signature: d.signature, product: d.product });
  }
}
const used = new Set(history.map((h) => h.signature));

/**
 * The signature is the part of the direction a viewer would notice repeating.
 *
 * Deliberately not the whole object: two videos may share a 3D treatment
 * without looking like the same video, but two sharing style *and* hero
 * grammar *and* type layout will. Getting this set wrong in either direction
 * is what makes variety checks useless — too broad and everything collides,
 * too narrow and nothing does.
 */
export const signatureOf = (d) =>
  [d.style, d.structure, d.type_layout, d.framing, d.hero_progression.join(">")].join("/");

/**
 * The establishing framing, before the hero starts cutting.
 *
 * `bleed` is weighted twice because it is the opinionated default: a
 * screenshot centred in a rounded card with margin on all four sides reads as
 * a slide, and a rotation that reached `contained` as often as `bleed` would
 * make the most literal look one video in four.
 */
const FRAMINGS = ["bleed", "bleed", "component", "closeup", "contained"];

/**
 * `chrome` and `framing` are one decision, not two.
 *
 * They were two, and the pair is where a default silently reverted a fix:
 * chrome defaulted to `macos`, chrome forces `contained` geometry, and so the
 * framing work landed and was undone in the same session across three videos
 * while the skill still said `bleed` was the default. A window whose edges
 * have left the frame is not a window — so the framing decides and the chrome
 * follows it, and the contradiction becomes unrepresentable.
 */
const CHROME_FOR = {
  bleed: "none",
  closeup: "none",
  component: "none",
  contained: "macos",
};

export const buildDirection = ({ product, lightUI, rotation, tracks = [], palette = {} }) => {
  const seed = seedFor(product, palette);
  const pick = (list, salt) => list[(seed + salt) % list.length];
  const styles = lightUI ? DARK_FRAME : STYLES;

  const direction = {
    product,
    style: pick(styles, rotation * 7),
    structure: pick(["thesis", "thesis", "mosaic"], rotation * 3),
    type_layout: pick(LAYOUTS, rotation * 5),
    accent_style: pick(ACCENTS, rotation * 11),
    transition: pick(TRANSITIONS, rotation * 13),
    framing: pick(FRAMINGS, rotation * 29),
    hero_progression: pick(HERO_PROGRESSIONS, rotation * 2),
    drawn: pick(DRAWN, rotation * 17),
    three_d: pick(THREE_D, rotation * 19),
    music: tracks.length ? pick(tracks, rotation * 23) : null,
  };
  direction.chrome = CHROME_FOR[direction.framing];
  direction.signature = signatureOf(direction);
  return direction;
};

const build = (rotation) =>
  buildDirection({ product, lightUI, rotation, tracks: TRACKS, palette });

/**
 * Rotate until the look is one no previous run used.
 *
 * Bounded, and the bound is not a formality: once every combination has been
 * used the honest thing is to say so and reuse the least recent, rather than
 * loop forever or invent an axis nobody rendered.
 */
const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  let direction = null;
  let rotation = 0;
  for (; rotation < 60; rotation++) {
    const candidate = build(rotation);
    if (!used.has(candidate.signature)) {
      direction = candidate;
      break;
    }
  }
  if (!direction) {
    direction = build(0);
    log(`every look in the matrix has been used — repeating "${direction.signature}"`);
  }

  direction.rotation = rotation;
  direction.light_ui = lightUI;
  direction.previous_runs = history.length;

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(WORK_DIR, "direction.json"),
    JSON.stringify(direction, null, 2),
  );

  /* ---------------------------------------------------------------- report */

  log(`product      ${product}${lightUI ? " (light UI → dark frame)" : ""}`);
  log(`style        ${direction.style}`);
  log(`structure    ${direction.structure}`);
  log(`type         ${direction.type_layout}, accent ${direction.accent_style}`);
  log(`framing      ${direction.framing}, chrome ${direction.chrome}`);
  log(`hero         ${direction.hero_progression.join(" → ")}`);
  log(`drawn        ${direction.drawn.length ? direction.drawn.join(", ") : "none (all footage)"}`);
  log(`3D           ${direction.three_d ?? "none"}`);
  log(`music        ${direction.music ?? "none on disk — synthesized bed"}`);
  log(`signature    ${direction.signature}`);
  if (history.length) {
    log(
      rotation > 0
        ? `rotated ${rotation}× past ${history.length} previous run(s) to avoid a repeat`
        : `${history.length} previous run(s), no collision`,
    );
  }
}
