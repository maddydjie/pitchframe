import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import type { RecordingManifest } from "../lib/recording";
import { footageFrame, footageSrc } from "../lib/recording";
import { EASE } from "../lib/motion";
import { Cursor } from "./Cursor";

/**
 * Plays recorded footage, with the cursor drawn back on top.
 *
 * The cursor is a layer rather than part of the picture because a CDP
 * screencast does not capture the pointer at all. That constraint turned out
 * to be an advantage: drawing it here means it stays vector-sharp through the
 * hero zoom, its look is themed rather than whatever the OS uses, and the
 * click ripple can be timed to the exact frame the mouse went down instead of
 * being guessed from the video.
 */

/** How long the ring takes to expand out of a click, in footage frames. */
const RIPPLE_LEN = 26;

/** 1.0 → 0.86 → 1.0. Matches clickPulse; kept local because it runs on the
 *  footage clock, not the beat clock. */
const pressScale = (since: number) => {
  if (since < 0 || since > 6) return 1;
  return interpolate(since, [0, 3, 6], [1, 0.86, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

export const Screencast: React.FC<{
  manifest: RecordingManifest;
  /** Frame within the beat. */
  local: number;
  /** Length of the beat, so the footage can be fitted to it. */
  beatFrames: number;
  showCursor?: boolean;
  segment?: [number, number];
}> = ({ manifest, local, beatFrames, showCursor = true, segment }) => {
  const index = footageFrame(local, beatFrames, manifest.frame_count, segment ?? [0, 1]);
  const point = manifest.cursor[index] ?? null;

  // The most recent press at or before now. Scanning backwards is fine — a
  // recording has a handful of events, not a stream.
  let lastDown = -1;
  for (const event of manifest.events) {
    if (event.type === "down" && event.frame <= index) lastDown = event.frame;
  }
  const since = lastDown < 0 ? Infinity : index - lastDown;
  const ripple =
    since === Infinity
      ? 0
      : interpolate(since, [0, RIPPLE_LEN], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        });

  return (
    <AbsoluteFill>
      <Img
        src={staticFile(footageSrc(manifest.name, index))}
        style={{
          width: "100%",
          height: "100%",
          // `fill`, not `cover`: the recorder shoots 16:9 and the panel is
          // 16:9, so there is nothing to crop — and cropping would silently
          // shift the footage under a cursor track that is expressed in
          // percentages of the *uncropped* frame.
          objectFit: "fill",
          display: "block",
        }}
      />

      {showCursor && point ? (
        <Cursor
          x={point.x}
          y={point.y}
          scale={pressScale(since)}
          ripple={ripple > 0 && ripple < 1 ? ripple : 0}
        />
      ) : null}
    </AbsoluteFill>
  );
};
