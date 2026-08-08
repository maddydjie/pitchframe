import type { Framing, HeroShot, InteractionBeatSpec } from "./types";

/**
 * The hero beat's arithmetic, as pure functions.
 *
 * Extracted out of `InteractionBeat` because that component had grown to 665
 * lines and this maths was buried in the middle of it. The depth-of-field bug
 * that blurred an entire video lived there for three renders precisely because
 * the file was too large to hold in your head. Numbers you can compute without
 * mounting a component are numbers you can check.
 *
 * Nothing here reads React or Remotion. Given a beat, a length and a frame,
 * every value below is determined.
 */

const FRAME_W = 1920;
const FRAME_H = 1080;

/** The whole app in a card, with margin. */
const CONTAINED_W = 1660;
/**
 * How far the panel oversizes the frame.
 *
 * 2360 cropped 9.3% off every edge, which on a canvas app deleted the toolbar
 * and the side panel outright — the shot became an empty field and the product
 * was invisible. Edge-anchored UI is exactly what bleed removes first.
 */
const BLEED_W = 2120;
/** Narrower than `contained`: the title bar adds ~43px and still has to fit. */
const WINDOW_W = 1620;
/**
 * A lifted component is an object on the video's surface, not a window onto an
 * app, so it needs margin around it or it stops reading as an object.
 */
const COMPONENT_W = 1360;

export type ResolvedShot = HeroShot & { start: number; length: number };

/**
 * The shot sequence, with absolute frame boundaries.
 *
 * A beat without `shots` becomes a single shot spanning the whole beat — the
 * older, shorter form, kept because a one-shot hero is a legitimate thing to
 * write. **`shots` wins over the beat-level fields whenever it is present**,
 * and this function is the only place that rule exists.
 *
 * The last shot absorbs any remainder, so the sequence covers the beat exactly
 * however the plan's arithmetic came out.
 */
export const resolveShots = (
  beat: InteractionBeatSpec,
  durationInFrames: number,
): ResolvedShot[] => {
  const source: HeroShot[] =
    beat.shots && beat.shots.length > 0
      ? beat.shots
      : [
          {
            frames: durationInFrames,
            framing: beat.framing,
            crop: beat.crop,
            shot: beat.shot,
            zoom: beat.zoom,
            chrome: beat.chrome,
          },
        ];

  let cursor = 0;
  return source.map((s, i) => {
    const start = cursor;
    const length = i === source.length - 1 ? durationInFrames - start : s.frames;
    cursor += length;
    return { ...s, start, length: Math.max(1, length) };
  });
};

/** Which shot is on screen, and how far into it we are. */
export const shotAt = (shots: ResolvedShot[], frame: number) => {
  const active =
    shots.find((s) => frame >= s.start && frame < s.start + s.length) ?? shots[0];
  // Frame within the *current shot*, which drives that shot's camera. The
  // footage clock stays on the beat, so cutting never restarts the take.
  return { active, shotFrame: frame - active.start };
};

export type Geometry = {
  /** The visible container. */
  w: number;
  h: number;
  /** True when the footage simply fills the container. */
  fit: boolean;
  /** Set when cropping: the full footage, scaled and offset inside `w`×`h`. */
  innerW?: number;
  innerH?: number;
  left?: number;
  top?: number;
};

export type Framed = {
  framing: Framing;
  /** After chrome and missing-crop fallbacks are applied. */
  effective: Framing;
  crop: NonNullable<HeroShot["crop"]> | null;
  chrome: boolean;
  lifted: boolean;
  geometry: Geometry;
  /** How hard the lens punches. 1 disables. */
  zoomPeak: number;
  /**
   * Depth-of-field peak, **derived from the zoom**.
   *
   * This used to be a fixed 4px independent of the zoom, so disabling the
   * punch left the blur running — and because the sharp spot is a small
   * ellipse at `zoom_target`, a shot aimed at a toolbar blurred the entire
   * rest of the application for most of the hero. A lens that does not move
   * has no falloff.
   */
  dofPeak: number;
};

/** Everything about how one shot fills the frame. */
export const frameShot = (shot: ResolvedShot): Framed => {
  const framing: Framing = shot.framing ?? "bleed";
  const wantsCrop = framing === "closeup" || framing === "component";
  const crop = wantsCrop ? (shot.crop ?? null) : null;
  // A crop-based framing with no crop has nothing to crop to; bleed is a
  // better failure than filling the frame with an arbitrary region.
  const requested: Framing = wantsCrop && !crop ? "bleed" : framing;

  /**
   * Chrome and `bleed` cannot coexist — a window with no visible edges is a
   * screenshot with a strip along the top — so chrome forces `contained`
   * geometry. Off by default: making it the default silently reverted the
   * framing work across three whole videos before anyone noticed.
   */
  const chrome = (shot.chrome ?? "none") === "macos" && !crop;
  const effective: Framing = chrome ? "contained" : requested;
  const lifted = effective === "component";

  const zoomPeak = shot.zoom ?? (crop ? 1.12 : 1.3);

  return {
    framing,
    effective,
    crop,
    chrome,
    lifted,
    zoomPeak,
    dofPeak: Math.max(0, (zoomPeak - 1) * 13),
    geometry: geometryFor(effective, crop, chrome, lifted),
  };
};

/**
 * An explicit container plus a placed image, rather than a scaled panel nudged
 * by percentages.
 *
 * The percentage-offset approach worked for framings that fill the frame and
 * broke for everything else: a `component` crop at the top edge of the footage
 * showed a 16:9 slice *centred* on it, which ran off the top of the image into
 * empty panel. Sizing the container to the crop's own aspect and placing the
 * footage inside is exact at any crop position, including against an edge.
 */
const geometryFor = (
  effective: Framing,
  crop: Framed["crop"],
  chrome: boolean,
  lifted: boolean,
): Geometry => {
  if (chrome) return { w: WINDOW_W, h: Math.round((WINDOW_W * 9) / 16), fit: true };
  if (effective === "contained") {
    return { w: CONTAINED_W, h: Math.round((CONTAINED_W * 9) / 16), fit: true };
  }
  if (!crop) return { w: BLEED_W, h: Math.round((BLEED_W * 9) / 16), fit: true };

  // The crop's true pixel aspect, since the footage itself is 16:9.
  const aspect = (crop.w * 16) / (crop.h * 9);
  // A lifted component is an object with margin; a closeup fills the frame.
  const containerW = lifted ? Math.min(COMPONENT_W, FRAME_H * 0.82 * aspect) : FRAME_W;
  const containerH = containerW / aspect;

  // Scale the footage so the crop's width spans the container, then slide it
  // so the crop's origin lands at the container's origin.
  const innerW = containerW / (crop.w / 100);
  const innerH = (innerW * 9) / 16;
  return {
    w: Math.round(containerW),
    h: Math.round(containerH),
    fit: false,
    innerW: Math.round(innerW),
    innerH: Math.round(innerH),
    left: Math.round(-(crop.x / 100) * innerW),
    top: Math.round(-(crop.y / 100) * innerH),
  };
};

export { FRAME_W, FRAME_H };
