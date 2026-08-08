import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ACCENT, TEXT, alpha } from "../theme";

/**
 * A light that travels around the edge of a panel.
 *
 * A rotating conic gradient paints the wrapper; a padding-width inset of
 * content sits on top; what stays visible is a hairline of moving colour. A
 * blurred copy behind does the blooming.
 *
 * The gradient is mostly transparent on purpose, so it reads as one highlight
 * travelling the edge rather than the whole border being lit. A fully-lit
 * border stops looking like a product video and starts looking like a gaming
 * peripheral.
 */
export const GlowBorder: React.FC<{
  radius: number;
  durationInFrames: number;
  width?: number;
  intensity?: number;
  turns?: number;
  children: React.ReactNode;
}> = ({ radius, durationInFrames, width = 2, intensity = 1, turns = 0.7, children }) => {
  const frame = useCurrentFrame();

  const angle = interpolate(frame, [0, durationInFrames], [0, 360 * turns], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bloom = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sweep = `conic-gradient(from ${angle}deg,
    ${alpha(ACCENT, 0)} 0deg,
    ${alpha(ACCENT, 0.9)} 26deg,
    ${alpha(TEXT, 0.55)} 48deg,
    ${alpha(ACCENT, 0)} 96deg,
    ${alpha(ACCENT, 0)} 190deg,
    ${alpha(ACCENT, 0.45)} 224deg,
    ${alpha(ACCENT, 0)} 280deg,
    ${alpha(ACCENT, 0)} 360deg)`;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: -14,
          borderRadius: radius + 14,
          background: sweep,
          filter: "blur(26px)",
          opacity: 0.55 * intensity * bloom,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", borderRadius: radius, padding: width, background: sweep }}>
        <div style={{ borderRadius: radius - width, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
};
