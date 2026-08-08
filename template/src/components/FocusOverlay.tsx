import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { BACKGROUND, alpha } from "../theme";

/**
 * A focus pull: everything except the point of interest darkens.
 *
 * This is how the video says "look here" without drawing an arrow. It is the
 * grown-up version of an annotation — the same instruction, delivered by the
 * lighting rather than by a label.
 *
 * `opacity` tops out at 0.3. Past that it stops reading as a lens and starts
 * reading as a spotlight gel.
 */
export const FocusOverlay: React.FC<{
  /** Percentages of the frame — normally the cursor's current position. */
  x: number;
  y: number;
  /** 0 → 1, how far the pull has come. */
  amount: number;
  /** Radius of the clear centre, as a percentage of frame width. */
  radius?: number;
}> = ({ x, y, amount, radius = 26 }) => {
  const opacity = interpolate(amount, [0, 1], [0, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity <= 0.002) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        /**
         * `ellipse W% H%`, not `circle N%`.
         *
         * A percentage radius is invalid on `circle` — the whole gradient is
         * then dropped and the overlay silently paints nothing. Since the
         * frame is 16:9, the height percentage is scaled to keep the clear
         * area visually round.
         */
        background: `radial-gradient(ellipse ${radius}% ${radius * 1.78}% at ${x}% ${y}%,
          ${alpha(BACKGROUND, 0)} 0%,
          ${alpha(BACKGROUND, 0)} 55%,
          ${alpha(BACKGROUND, 1)} 130%)`,
        opacity,
      }}
    />
  );
};
