import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ACCENT, BACKGROUND, TEXT, alpha } from "../theme";

const GRAIN_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * The one background every beat sits on.
 *
 * A single accent-tinted gradient running corner to corner: the brand colour
 * at about a tenth of its strength in one corner, falling to the background
 * in the opposite one. That is the whole composition — a dark frame with one
 * source of light in it, which is what makes the product the brightest thing
 * on screen.
 *
 * Grain and vignette exist for a technical reason as much as an aesthetic
 * one: h264 bands badly across large near-black gradients, and noise breaks
 * the bands up.
 */
export const Background: React.FC<{ corner?: "tl" | "tr" | "bl" | "br" }> = ({
  corner = "tl",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // A few percent of drift over the whole video. Imperceptible per second,
  // alive across a minute.
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  const anchor = {
    tl: { x: 18, y: 14 },
    tr: { x: 82, y: 14 },
    bl: { x: 18, y: 86 },
    br: { x: 82, y: 86 },
  }[corner];

  const gx = anchor.x + t * 5;
  const gy = anchor.y + t * 3;

  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 95% 85% at ${gx}% ${gy}%, ${alpha(ACCENT, 0.1)}, ${alpha(BACKGROUND, 0)} 72%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 85% 75% at 50% 50%, transparent 40%, ${alpha(BACKGROUND, 0.55)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_TILE,
          backgroundRepeat: "repeat",
          backgroundPosition: `${(Math.floor(frame / 2) * 37) % 200}px ${(Math.floor(frame / 2) * 61) % 200}px`,
          opacity: 0.055,
          mixBlendMode: "overlay",
        }}
      />
      <AbsoluteFill style={{ background: alpha(TEXT, 0), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
