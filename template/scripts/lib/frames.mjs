/**
 * Measurements on rendered frames, and where to take them.
 *
 * Pure and pixel-format agnostic: everything below takes a Uint8Array of 8-bit
 * luminance. Decoding is somebody else's problem, which keeps this file
 * testable with a 4×4 array instead of a render.
 */

import { heroBeats } from "./checks.mjs";

/**
 * Where to look.
 *
 * Derived from the plan rather than sampled uniformly, because a launch video
 * is mostly holds: uniform sampling spends its budget on frames where nothing
 * is moving and therefore nothing can be wrong. The interesting frames are the
 * ones where the plan itself says something changes.
 */
export const samplePositions = (plan) => {
  const seen = new Map();
  const add = (frame, why) => {
    const f = Math.max(0, Math.min(plan.total_frames - 1, Math.round(frame)));
    if (!seen.has(f)) seen.set(f, { frame: f, why });
  };

  for (const b of plan.beats) {
    const [from, to] = b.frames;
    add((from + to) / 2, `${b.type} beat ${b.id} midpoint`);
    // Both sides of the cut: a transition that fails fails asymmetrically.
    if (from > 0) {
      add(from - 1, `before the cut into beat ${b.id}`);
      add(from + 1, `after the cut into beat ${b.id}`);
    }
  }

  const hero = heroBeats(plan);
  if (hero.length) {
    const from = Math.min(...hero.map((b) => b.frames[0]));
    const to = Math.max(...hero.map((b) => b.frames[1]));
    // The pair that proves the state change. Identical frames here mean the
    // product appeared to do nothing, which is worse than having no hero.
    add(from + (to - from) * 0.2, "hero: before the action");
    add(from + (to - from) * 0.8, "hero: after the action");
  }

  return [...seen.values()].sort((a, b) => a.frame - b.frame);
};

export const luminanceStats = (gray, w, h) => {
  const n = w * h;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (gray[i] - mean) ** 2;
  return { mean, variance: acc / n };
};

/**
 * Laplacian energy — a stand-in for "how much detail is here".
 *
 * Compared centre-against-periphery it detects the depth-of-field bug that
 * survived three renders: the subject blurrier than its own surroundings,
 * because the sharp ellipse was aimed at the click target while the shot was
 * framed on something else.
 */
export const laplacianEnergy = (gray, w, h, region) => {
  const x0 = Math.max(1, region.x);
  const y0 = Math.max(1, region.y);
  const x1 = Math.min(w - 1, region.x + region.w);
  const y1 = Math.min(h - 1, region.y + region.h);
  let acc = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      acc += lap * lap;
      n++;
    }
  }
  return n ? acc / n : 0;
};

export const frameDelta = (a, b) => {
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i]);
  return acc / a.length;
};
