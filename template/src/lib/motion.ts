import { Easing, interpolate } from "remotion";

/**
 * The genre rules, as code.
 *
 * Everything here is deliberately conservative. The launch-video look comes
 * from restraint: few curves, small distances, long holds. Springs, bounces
 * and elastic curves are banned — they read as "template", not "film".
 */

/**
 * How fast everything arrives, as a multiplier on every duration and delay
 * below.
 *
 * The first videos were slow, and the cause was not any single number — it was
 * every number at once. A 14-frame fade, a 16-frame drift, a 3-frame word
 * stagger and an 8-frame blur are each defensible, and together they mean a
 * line of type takes most of a second to finish arriving. On a beat cut to a
 * four-second spoken line, that is a card that assembles slowly and then sits
 * there.
 *
 * Applying the scale *inside* each helper rather than to its default is the
 * whole point: most call sites pass explicit durations, so scaling defaults
 * alone would have changed almost nothing. One constant moves the entire
 * motion language, and the relative rhythm between elements is preserved
 * because everything is scaled by the same amount.
 *
 * Lower is faster. Below about 0.45 entrances start to read as pops rather
 * than moves, which loses the photographed feel the blur exists to create.
 */
export const PACE = 0.6;

/** Scale a frame count by the pace, never below two frames. */
const paced = (frames: number) => Math.max(2, Math.round(frames * PACE));

/** Scale a delay by the pace. Delays may legitimately be zero. */
const pacedDelay = (frames: number) => Math.round(frames * PACE);

/** The house curve. Slow out, long settle. */
export const EASE = Easing.bezier(0.33, 0.0, 0.15, 1.0);

/**
 * Ease-out for anything that decelerates into place — cursor travel, camera
 * moves. Linear cursor movement is the single clearest tell that a video was
 * generated rather than recorded.
 */
export const EASE_OUT = Easing.bezier(0.16, 0.84, 0.24, 1.0);

/** Exits leave faster than entrances arrive, so holds feel longer. */
export const EASE_EXIT = Easing.bezier(0.4, 0.0, 0.6, 1.0);

export const fadeIn = (frame: number, delay = 0, duration = 14) =>
  interpolate(frame, [pacedDelay(delay), pacedDelay(delay) + paced(duration)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

export const fadeOut = (frame: number, total: number, duration = 10) =>
  interpolate(frame, [total - paced(duration), total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_EXIT,
  });

/** Fade in with a slight upward drift. 12–16px; more reads as a slide. */
export const driftUp = (frame: number, delay = 0, distance = 14, duration = 16) =>
  interpolate(frame, [pacedDelay(delay), pacedDelay(delay) + paced(duration)], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

/**
 * Entrance motion blur: 12px resolving to 0 over 8 frames.
 *
 * Everything that arrives, arrives slightly out of focus. It is the cheapest
 * way to make a cut feel photographed rather than composited.
 */
export const entranceBlur = (frame: number, delay = 0, from = 12, duration = 8) =>
  interpolate(frame, [pacedDelay(delay), pacedDelay(delay) + paced(duration)], [from, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

/**
 * The drift that keeps a held beat alive.
 *
 * Two to three pixels of vertical travel across the whole beat, eased both
 * ends. Invisible frame to frame, and the difference between a shot that
 * breathes and a still image someone left on screen.
 */
export const heldDrift = (frame: number, total: number, distance = 3) =>
  interpolate(frame, [0, total], [distance / 2, -distance / 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

/**
 * The click: 1.0 → 0.85 → 1.0 over six frames.
 *
 * Six frames is a fifth of a second — about how long a real click looks. Any
 * slower and it reads as a squash-and-stretch cartoon.
 */
export const clickPulse = (frame: number, at: number) => {
  const t = frame - at;
  if (t < 0 || t > 6) return 1;
  return interpolate(t, [0, 3, 6], [1, 0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
};

/** Per-word entrance offset. Keeps a phrase feeling written, not pasted. */
export const wordDelay = (index: number, stagger = 3) => index * stagger * PACE;

/** Draws a line or stroke in, 0 → 1. */
export const drawIn = (frame: number, delay = 0, duration = 18) =>
  interpolate(frame, [pacedDelay(delay), pacedDelay(delay) + paced(duration)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

/**
 * The 45-frame minimum for readable text is enforced where it can be acted on
 * — in the plan schema and the critique pass. There is nothing the renderer
 * can do about a beat that is already too short, so it does not pretend to.
 */
