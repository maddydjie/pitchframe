import React from "react";
import { ACCENT, BACKGROUND, TEXT, alpha } from "../theme";

/**
 * The synthetic cursor.
 *
 * Position and pulse are computed by whoever owns the interaction timeline —
 * this component only draws. That split matters: the cursor's path is part of
 * the beat's choreography, not a property of the arrow.
 *
 * A real cursor decelerates into its target and never travels in a straight
 * line at constant speed. Linear cursor movement is the clearest possible tell
 * that a video was generated, which is why the easing lives in the caller and
 * is always `EASE_OUT`.
 */
export const Cursor: React.FC<{
  /** Percentages of the containing frame. */
  x: number;
  y: number;
  opacity?: number;
  /** 1.0 at rest; the click pulse drives this to 0.85 and back. */
  scale?: number;
  /** 0 → 1, drives the ring that expands out of the click. */
  ripple?: number;
}> = ({ x, y, opacity = 1, scale = 1, ripple = 0 }) => {
  const ringScale = 0.4 + ripple * 2.8;
  const ringOpacity = (1 - ripple) * 0.5;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {ripple > 0 && ripple < 1 ? (
        <div
          style={{
            position: "absolute",
            left: -34,
            top: -34,
            width: 68,
            height: 68,
            borderRadius: "50%",
            border: `2px solid ${alpha(ACCENT, ringOpacity)}`,
            transform: `scale(${ringScale})`,
          }}
        />
      ) : null}

      <svg width="40" height="40" viewBox="0 0 24 24" style={{ display: "block" }}>
        <defs>
          <filter id="cursor-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={ACCENT} floodOpacity="0.8" />
          </filter>
        </defs>
        <path
          d="M5 2.5 L18.5 12.2 L12.2 13 L15.4 20 L12.6 21.2 L9.4 14.2 L5 18.4 Z"
          fill={TEXT}
          stroke={alpha(BACKGROUND, 0.55)}
          strokeWidth="0.8"
          filter="url(#cursor-glow)"
        />
      </svg>
    </div>
  );
};
