import React from "react";

/**
 * The cinematic zoom. This is the wow moment.
 *
 * Scales its children about a focal point while the background blurs, so the
 * frame appears to push in on the thing that just happened rather than
 * enlarging a picture of it. Transform-origin is the focal point, which is
 * what keeps the target still while everything else expands past the frame.
 *
 * Kept as a wrapper rather than baked into a beat so the same move is
 * available anywhere — and so the numbers live in one place.
 */
export const Zoom: React.FC<{
  /** Focal point as percentages of the child's box. */
  x: number;
  y: number;
  /** Current scale. 1.0 is unzoomed; 1.3 is a strong push. */
  scale: number;
  /** Blur applied under the zoom, in px. Ramp 0 → 2-4 as the zoom lands. */
  blur?: number;
  children: React.ReactNode;
}> = ({ x, y, scale, blur = 0, children }) => (
  <div
    style={{
      transform: `scale(${scale})`,
      transformOrigin: `${x}% ${y}%`,
      filter: blur > 0.05 ? `blur(${blur}px)` : "none",
      willChange: "transform, filter",
    }}
  >
    {children}
  </div>
);
