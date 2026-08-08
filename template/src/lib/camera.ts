import { interpolate, Easing } from "remotion";
import { EASE, EASE_OUT } from "./motion";

/**
 * The camera.
 *
 * Every shot in the video is one of a handful of named moves, and the agent
 * picks a name rather than inventing numbers. That constraint is the whole
 * point: freeform camera math at generation time produces a different-looking
 * video every run, and "different every run" is indistinguishable from
 * "unreliable". A catalogue gives variety within a house style.
 *
 * These are real 3D poses, not scale-and-translate dressed up as depth. The
 * stage sets `perspective` and the pose sets `translate3d` + `rotate3d`, so a
 * push-in genuinely dollies: near edges grow faster than far ones, and any
 * layer at a different `translateZ` parallaxes for free. That difference —
 * between the image getting bigger and the camera moving — is most of what
 * separates a product video from a slideshow of screenshots.
 */

export type CameraPose = {
  /** Translation in px. */
  x: number;
  y: number;
  /** Toward the viewer. Positive is closer, and therefore larger. */
  z: number;
  /** Degrees. */
  rotX: number;
  rotY: number;
  rotZ: number;
};

export type Shot = {
  from: CameraPose;
  to: CameraPose;
  /**
   * The window within the beat the move occupies, normalised 0–1. A move that
   * runs the full length of its beat never settles, and a shot that never
   * settles gives the viewer nowhere to look. Most shots finish around 60–80%
   * and hold, which is what makes the hold feel earned rather than stalled.
   */
  over: [number, number];
  /**
   * Distance from the viewer to the z=0 plane. Lower is a wider lens: more
   * dramatic convergence, more distortion at the edges. 2200 is roughly a
   * 50mm equivalent on this frame size and is the house default.
   */
  perspective: number;
  easing: (t: number) => number;
};

const pose = (p: Partial<CameraPose>): CameraPose => ({
  x: 0,
  y: 0,
  z: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  ...p,
});

export const SHOTS = {
  /**
   * The default. Starts back and off-axis, arrives square and forward.
   *
   * Works for almost everything because it resolves: the frame is unsettled
   * when the beat opens and settled by the time it matters, which is the same
   * grammar as a camera finding its subject.
   */
  push_in_reveal: {
    // Restrained on purpose. rotX 7 / rotY 13 was the first attempt and the
    // panel read as a sheet of paper in flight rather than a screen being
    // approached — combined pitch and yaw compounds much faster than either
    // looks like it will. The hero beat has to stay legible from its first
    // frame, so the depth here comes mostly from z.
    from: pose({ z: -520, rotX: 4, rotY: -9 }),
    to: pose({}),
    over: [0, 0.42],
    perspective: 2200,
    easing: EASE,
  },

  /**
   * Comes to rest still tilted — the product-shot look, an object on a desk
   * rather than a window. Use when the UI is being presented rather than used;
   * a persistent tilt costs legibility, so never for a shot the viewer has to
   * read.
   */
  tilt_settle: {
    from: pose({ z: -380, rotX: 10, rotY: -25 }),
    to: pose({ z: -90, rotX: 4, rotY: -13 }),
    over: [0, 0.55],
    perspective: 1900,
    easing: EASE,
  },

  /**
   * A slow lateral arc across the whole beat, passing through square in the
   * middle. Never settles, deliberately — this is the shot for a long hold
   * that would otherwise die, and the parallax on layered elements is the
   * point of it.
   */
  orbit_hold: {
    from: pose({ z: -170, rotY: 11, rotX: 3 }),
    to: pose({ z: -170, rotY: -11, rotX: 3 }),
    over: [0, 1],
    perspective: 2000,
    easing: Easing.inOut(Easing.ease),
  },

  /**
   * Opens outward: starts close, pulls away to reveal context. The payoff
   * shot — it answers "and what does that mean" by widening.
   */
  drift_back: {
    from: pose({ z: 210, rotX: -2 }),
    to: pose({ z: -150, rotX: 0 }),
    over: [0, 1],
    perspective: 2400,
    easing: EASE_OUT,
  },

  /**
   * Sits still, then punches in late. Everything depends on the delay — the
   * stillness beforehand is what makes the push land, so this shot is mostly
   * the pause.
   */
  snap_zoom: {
    from: pose({}),
    to: pose({ z: 320 }),
    over: [0.38, 0.66],
    perspective: 2200,
    easing: EASE,
  },

  /**
   * Hard off-axis, held close, drifting only slightly.
   *
   * The reference launch videos run 25–40° of yaw on their product shots —
   * far past what reads as "a tilted screenshot" and into a plane genuinely
   * receding in space. It only works with `bleed` or `closeup` framing: at
   * this angle a contained card looks like it fell over, whereas a panel
   * running off both edges reads as a surface the camera is flying along.
   *
   * The UI is not readable here. That is the trade — use it for texture, and
   * cut to something square before the viewer has to read anything.
   */
  raking_pass: {
    from: pose({ z: -120, rotX: 6, rotY: 34, x: 180 }),
    to: pose({ z: 40, rotX: 3, rotY: 22, x: -120 }),
    over: [0, 1],
    // A tighter perspective exaggerates the convergence. At 34° of yaw with a
    // long lens the plane would look merely skewed rather than receding.
    perspective: 1400,
    easing: Easing.inOut(Easing.ease),
  },

  /**
   * Starts inside the subject and pulls back just enough to reveal what it
   * was. The reverse of the usual reveal, and it works because the viewer
   * spends the first second not knowing what they are looking at.
   */
  pull_focus: {
    from: pose({ z: 420, rotY: -6 }),
    to: pose({ z: -60, rotY: 0 }),
    over: [0, 0.48],
    perspective: 1800,
    easing: EASE_OUT,
  },

  /**
   * No move at all.
   *
   * Worth having a name for, because stillness is a choice and the alternative
   * is a shot that drifts because every shot drifts. When the content is doing
   * the work, let it.
   */
  locked_off: {
    from: pose({}),
    to: pose({}),
    over: [0, 1],
    perspective: 2200,
    easing: EASE,
  },
} as const satisfies Record<string, Shot>;

export type ShotName = keyof typeof SHOTS;

export const isShotName = (name: unknown): name is ShotName =>
  typeof name === "string" && name in SHOTS;

/** Where the camera is on a given frame of a beat. */
export const poseAt = (
  shot: Shot,
  frame: number,
  durationInFrames: number,
): CameraPose => {
  const start = shot.over[0] * durationInFrames;
  const end = Math.max(start + 1, shot.over[1] * durationInFrames);
  const at = (a: number, b: number) =>
    interpolate(frame, [start, end], [a, b], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: shot.easing,
    });

  return {
    x: at(shot.from.x, shot.to.x),
    y: at(shot.from.y, shot.to.y),
    z: at(shot.from.z, shot.to.z),
    rotX: at(shot.from.rotX, shot.to.rotX),
    rotY: at(shot.from.rotY, shot.to.rotY),
    rotZ: at(shot.from.rotZ, shot.to.rotZ),
  };
};

/**
 * Rotation before translation.
 *
 * CSS applies transforms right to left, so this rotates the object about its
 * own centre and *then* moves it. The other order swings the object around the
 * origin like a boom arm — occasionally what you want, never what you want by
 * accident.
 */
export const transformOf = (p: CameraPose): string =>
  `translate3d(${p.x}px, ${p.y}px, ${p.z}px) ` +
  `rotateX(${p.rotX}deg) rotateY(${p.rotY}deg) rotateZ(${p.rotZ}deg)`;

/**
 * How fast the camera is moving, 0–1, sampled by differencing the pose.
 *
 * Effects that should only fire while the camera is actually moving — motion
 * blur, edge fringing — read this instead of guessing from frame numbers, so
 * they stay correct when a shot is re-timed.
 */
export const cameraSpeed = (
  shot: Shot,
  frame: number,
  durationInFrames: number,
): number => {
  const a = poseAt(shot, Math.max(0, frame - 1), durationInFrames);
  const b = poseAt(shot, frame + 1, durationInFrames);
  // Degrees weighted up: 1° of rotation moves the far edge of a 1660px panel
  // about 15px, so treating them as comparable units understates rotation.
  const linear = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const angular = (Math.abs(b.rotX - a.rotX) + Math.abs(b.rotY - a.rotY)) * 15;
  return Math.min(1, (linear + angular) / 40);
};
