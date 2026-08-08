import { useJsonAsset } from "./asset";

/**
 * The recording manifest, written by scripts/lib/recorder.mjs.
 *
 * Loaded at runtime rather than inlined into plan.json, because `cursor` is
 * one entry per frame — a few hundred points that the agent neither writes nor
 * reads. Keeping it out of the plan keeps the plan reviewable by a human.
 */
export type RecordingManifest = {
  name: string;
  fps: number;
  frame_count: number;
  width: number;
  height: number;
  duration_seconds: number;
  distinct_frames: number;
  /** Percentages of the footage, one per frame. Null before the first sample. */
  cursor: ({ x: number; y: number } | null)[];
  /** Mouse-down and mouse-up, at footage frame indices. */
  events: { type: "down" | "up"; frame: number }[];
};

export type RecordingState =
  | { status: "loading" }
  | { status: "ready"; manifest: RecordingManifest }
  | { status: "missing" };

/**
 * Loads a recording manifest.
 *
 * The three states are kept distinct rather than collapsed to
 * `manifest | null`, because "still loading" and "there is no recording" call
 * for different renders: the fallback stills must not mount during the load,
 * or a recorded beat requests before/after screenshots it never captured and
 * 404s on every frame.
 */
export const useRecording = (name: string | null | undefined): RecordingState => {
  const state = useJsonAsset<RecordingManifest>(
    name ? `assets/${name}.track.json` : null,
  );

  // A capture that failed is a normal outcome — the beat draws the
  // before/after stills instead, and the video still ships.
  return state.status === "ready"
    ? { status: "ready", manifest: state.value }
    : state;
};

/**
 * Maps a frame of the beat onto a frame of the footage, stretching the
 * recording to fill whatever length the plan gave the beat.
 *
 * Fitting rather than playing at native rate is the safer default: a recording
 * that runs past the end of its beat loses the state change it exists to
 * prove, which is the one thing the hero moment cannot survive losing. The
 * cost is a speed change, and within roughly 0.6× to 1.6× that reads as
 * deliberate pacing rather than as wrong. Outside it, size the beat to the
 * recording — capture-result.json reports `frame_count` for exactly this.
 */
export const footageFrame = (
  local: number,
  beatFrames: number,
  frameCount: number,
  /** Fractions of the recording this beat covers. Defaults to all of it. */
  segment: [number, number] = [0, 1],
): number => {
  if (frameCount <= 1 || beatFrames <= 1) return 0;
  const t = Math.min(1, Math.max(0, local / (beatFrames - 1)));
  const [from, to] = segment;
  // Map the beat's progress onto its slice, so successive beats continue the
  // take rather than restarting it.
  const within = from + t * (to - from);
  return Math.min(frameCount - 1, Math.max(0, Math.round(within * (frameCount - 1))));
};

/** Zero-padded to four digits, matching what the recorder writes. */
export const footageSrc = (name: string, index: number): string =>
  `assets/${name}/${String(index + 1).padStart(4, "0")}.jpg`;
