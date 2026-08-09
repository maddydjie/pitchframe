/**
 * Deterministic checks on a scene plan.
 *
 * Every gotcha in CLAUDE.md is described as a bug that "rendered without error
 * and only showed up in the output". Most of them never needed a rendered
 * frame to catch — they needed two numbers compared. This file is that
 * comparison, kept pure so it is testable without mounting Remotion.
 *
 * A finding carries a `target` because a check that only says "something is
 * wrong" costs a full re-reason; one that names the field costs an edit.
 */

/** @typedef {{check: string, severity: "fail"|"warn", message: string, target: string}} Finding */

export const heroBeats = (plan) => plan.beats.filter((b) => b.type === "interaction");

export const checkContiguity = (plan) => {
  const out = [];
  let prev = 0;
  plan.beats.forEach((b, i) => {
    const [from, to] = b.frames;
    if (from !== prev) {
      out.push({
        check: "contiguity",
        severity: "fail",
        message: `beat ${b.id} (${b.type}) starts at ${from}, but the previous ended at ${prev}`,
        target: `beats[${i}].frames`,
      });
    }
    prev = to;
  });
  if (plan.beats.length && prev !== plan.total_frames) {
    const i = plan.beats.length - 1;
    out.push({
      check: "contiguity",
      severity: "fail",
      message: `the last beat ends at ${prev}, but total_frames is ${plan.total_frames}`,
      target: `beats[${i}].frames`,
    });
  }
  return out;
};

/**
 * One hero moment means one *recording*, not one beat.
 *
 * A hero take spans several spoken lines, and one line is one beat, so several
 * interaction beats legitimately share a recording and are given consecutive
 * `segment` slices by plan-from-script.mjs. Counting beats instead of
 * recordings would fail every real plan — the shipped reference plan has five.
 */
export const checkOneHeroRecording = (plan) => {
  const names = [...new Set(heroBeats(plan).map((b) => b.recording).filter(Boolean))];
  if (names.length <= 1) return [];
  return [
    {
      check: "one_hero",
      severity: "fail",
      message: `${names.length} hero recordings (${names.join(", ")}) — two hero moments means neither gets proven`,
      target: "beats[].recording",
    },
  ];
};

/** Below 30% the hero is a feature the video mentions, not the spine it is built on. */
export const checkHeroShare = (plan) => {
  const frames = heroBeats(plan).reduce((a, b) => a + (b.frames[1] - b.frames[0]), 0);
  const share = plan.total_frames ? frames / plan.total_frames : 0;
  if (share >= 0.3) return [];
  return [
    {
      check: "hero_share",
      severity: "fail",
      message: `the hero is ${Math.round(share * 100)}% of the runtime; below 30% it reads as a feature, not a spine`,
      target: "beats[].frames",
    },
  ];
};

/**
 * The payoff is a typography beat *after* the hero.
 *
 * Without one the hero is a screenshot rather than a claim: the viewer is shown
 * a thing happening and never told what it meant. The CTA does not count — a
 * URL is an instruction, not a completion.
 */
export const checkPayoff = (plan) => {
  const hero = heroBeats(plan);
  if (!hero.length) return [];
  const heroEnd = Math.max(...hero.map((b) => b.frames[1]));
  const payoff = plan.beats.some((b) => b.type === "typography" && b.frames[0] >= heroEnd);
  if (payoff) return [];
  return [
    {
      check: "payoff",
      severity: "fail",
      message:
        "no typography beat after the hero — without a payoff the hero is a screenshot, not a claim",
      target: "beats",
    },
  ];
};

/* ------------------------------------------------------------- contrast */

/**
 * Contrast is arithmetic on the theme, not a property of the render.
 *
 * `surfaceColors()` in src/lib/surface.ts already decides which token a beat
 * draws with given what it sits on. That decision is reproducible here without
 * mounting anything, which is why this belongs in the static half: the first
 * light beat shipped white display type on pale lavender at 1.57:1, and every
 * component that gains a light context can repeat it.
 *
 * Rec. 709 coefficients and the sRGB transfer curve, per WCAG 2.1.
 */
const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export const relativeLuminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Beat types that render type. An interaction beat draws footage, not words. */
const TEXT_BEATS = new Set(["typography", "logo", "cta", "ui"]);

/**
 * The worst stop of the field the beat sits on, not its nicest one.
 *
 * A light surface is a *gradient*, and type crossing it meets every stop on
 * the way. Checking the lightest one is how a beat passes a review and still
 * loses its last word into the dark corner of the mesh — so the darkest light
 * stop is the honest backdrop for dark type.
 *
 * `mesh` is a mid-tone field built from the accent and white still clears
 * 4.5:1 on it, so only `light` inverts — the same rule surfaceColors() encodes.
 */
const backdropFor = (surface, theme) =>
  surface === "light" ? theme.MESH_LIGHT_DEEP ?? "#c2c2c2" : theme.BACKGROUND;

/**
 * 4.5:1 for body, 3:1 for the accent word.
 *
 * The accent is always display type — the WCAG large-text threshold is the
 * right one and using 4.5 there would fail correct videos.
 */
const BODY_MIN = 4.5;
const DISPLAY_MIN = 3;

export const checkContrast = (plan, theme) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (!TEXT_BEATS.has(b.type)) return;
    const onLight = b.surface === "light";
    const backdrop = backdropFor(b.surface, theme);

    const pairs = [
      { role: "text", colour: onLight ? theme.TEXT_ON_LIGHT : theme.TEXT, min: BODY_MIN },
    ];
    if (b.accent_word) {
      pairs.push({
        role: "accent",
        colour: onLight ? theme.ACCENT_ON_LIGHT : theme.ACCENT,
        min: DISPLAY_MIN,
      });
    }

    for (const { role, colour, min } of pairs) {
      const ratio = contrastRatio(colour, backdrop);
      if (ratio === null || ratio >= min) continue;
      out.push({
        check: "contrast",
        severity: "fail",
        message: `beat ${b.id} (${b.type}, surface ${b.surface ?? "dark"}) draws its ${role} ${colour} on ${backdrop} at ${ratio.toFixed(2)}:1 — below ${min}:1 it is invisible in the video`,
        target: `beats[${i}].surface`,
      });
    }
  });
  return out;
};

/* ------------------------------------------------------- contradictions */

/**
 * Every shot in a hero, whether written as `shots` or as the one-shot
 * shorthand on the beat itself.
 *
 * `resolveShots()` in lib/heroShots.ts owns the precedence rule at render
 * time; this mirrors only the enumeration, never the precedence, because
 * re-implementing precedence in two places is how the two drift apart.
 */
const shotsOf = (beat, beatIndex) =>
  Array.isArray(beat.shots) && beat.shots.length
    ? beat.shots.map((s, j) => ({ spec: s, path: `beats[${beatIndex}].shots[${j}]` }))
    : [{ spec: beat, path: `beats[${beatIndex}]` }];

/**
 * Chrome and `bleed` are mutually exclusive, and the pair is where a default
 * silently reverted a fix: `chrome` defaulted to `macos`, chrome forces
 * `contained` geometry, and so the framing work landed and was undone in the
 * same session across three videos while the skill still said `bleed` was the
 * default. A window whose edges have left the frame is not a window.
 */
export const checkChromeFraming = (plan) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (b.type !== "interaction") return;
    for (const { spec, path } of shotsOf(b, i)) {
      if (spec.framing === "bleed" && spec.chrome === "macos") {
        out.push({
          check: "chrome_framing",
          severity: "fail",
          message: `${path} asks for bleed and macos chrome — chrome forces contained geometry, so the bleed is silently discarded`,
          target: `${path}.chrome`,
        });
      }
    }
  });
  return out;
};

/**
 * A lens that does not move has no falloff.
 *
 * `zoomBlur` once ramped to a fixed 4px independent of `zoomPeak`, so setting
 * `zoom: 1` to disable the punch left the blur running — and because the sharp
 * spot is a small ellipse at the click target, a shot aimed at a toolbar
 * blurred the whole rest of the app for most of the hero.
 */
export const checkZoomBlurCoupling = (plan) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (b.type !== "interaction") return;
    for (const { spec, path } of shotsOf(b, i)) {
      if (spec.zoom === 1 && Number(spec.zoom_blur) > 0) {
        out.push({
          check: "zoom_blur",
          severity: "fail",
          message: `${path} disables the zoom but keeps ${spec.zoom_blur}px of blur — a lens that does not move has no falloff, so the product just looks out of focus`,
          target: `${path}.zoom_blur`,
        });
      }
    }
  });
  return out;
};

/**
 * theme.ts is the only place a colour is written down. Anywhere else and two
 * products' videos start looking identical, which is the pipeline being broken
 * in the way that is hardest to notice.
 */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[0-9]/;

export const checkColourLiterals = (files) =>
  Object.entries(files)
    .filter(([rel]) => !rel.endsWith("theme.ts"))
    .filter(([, src]) => COLOUR.test(src))
    .map(([rel]) => ({
      check: "colour_literal",
      severity: "fail",
      message: `${rel} contains a colour literal — every colour must resolve through theme.ts or two products get the same video`,
      target: rel,
    }));
