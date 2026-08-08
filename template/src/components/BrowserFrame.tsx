import React from "react";
import {
  BORDER,
  BORDER_STRONG,
  FONT_SANS,
  SHADOW,
  SURFACE,
  SURFACE_ALT,
  TEXT_FAINT,
  WINDOW_CLOSE,
  WINDOW_MAX,
  WINDOW_MIN,
  alpha,
} from "../theme";

/**
 * The macOS window chrome.
 *
 * A recorded website with no chrome around it is ambiguous — it could be a
 * screenshot, a mock, a design. The traffic lights resolve that instantly:
 * the viewer reads it as a real application on a real machine, which is the
 * whole claim the hero moment is making. It costs 44 pixels of height and buys
 * the single most legible "this exists" signal available.
 *
 * Deliberately not a full browser: no tab strip, no back/forward, no bookmarks.
 * Those date a video and pull the eye to furniture that isn't the product. The
 * URL pill is the one exception, because a real domain is evidence.
 */

/** Proportional to the window so chrome doesn't shrink to nothing at scale. */
const barHeightFor = (width: number) => Math.round(width * 0.026);

export const BrowserFrame: React.FC<{
  width: number;
  height: number;
  /** Shown in the pill. Omit it and the bar is just the lights. */
  url?: string | null;
  /** Corner radius. Matched to the window, not the content. */
  radius?: number;
  /** Off when the window bleeds past the frame and has no visible edge. */
  shadow?: boolean;
  children: React.ReactNode;
}> = ({ width, height, url, radius = 16, shadow = true, children }) => {
  const bar = barHeightFor(width);
  const dot = Math.round(bar * 0.27);
  const gap = Math.round(dot * 0.72);

  return (
    <div
      style={{
        width,
        height: height + bar,
        borderRadius: radius,
        overflow: "hidden",
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        boxShadow: shadow ? `0 70px 160px -34px ${SHADOW}` : "none",
        position: "relative",
      }}
    >
      <div
        style={{
          height: bar,
          background: SURFACE_ALT,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: Math.round(bar * 0.5),
          gap,
          position: "relative",
          // The highlight along the top edge is what makes the bar read as a
          // raised surface rather than a printed strip.
          boxShadow: `inset 0 1px 0 ${BORDER_STRONG}`,
        }}
      >
        {[WINDOW_CLOSE, WINDOW_MIN, WINDOW_MAX].map((color) => (
          <div
            key={color}
            style={{
              width: dot,
              height: dot,
              borderRadius: "50%",
              background: color,
              // A hairline of the light's own colour, darkened. Flat circles
              // read as stickers; real ones have an edge.
              boxShadow: `inset 0 0 0 1px ${alpha(color, 0.55)}`,
            }}
          />
        ))}

        {url ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              maxWidth: "46%",
              height: Math.round(bar * 0.56),
              lineHeight: `${Math.round(bar * 0.56)}px`,
              padding: `0 ${Math.round(bar * 0.5)}px`,
              borderRadius: 999,
              background: alpha(SURFACE, 0.9),
              border: `1px solid ${BORDER}`,
              fontFamily: FONT_SANS,
              fontSize: Math.round(bar * 0.32),
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: TEXT_FAINT,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {url}
          </div>
        ) : null}
      </div>

      <div style={{ width, height, position: "relative", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
