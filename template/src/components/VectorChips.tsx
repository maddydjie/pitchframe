import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE, entranceBlur, fadeIn } from "../lib/motion";
import { surfaceColors } from "../lib/surface";
import type { SurfaceKind } from "../lib/types";
import { BORDER_STRONG, FONT_SANS, SHADOW, alpha } from "../theme";

/**
 * Action chips, drawn rather than photographed.
 *
 * The reference launch films are mostly **not** screen recordings. Their UI
 * moments are rebuilt as vector — a menu, a field, a cluster of action pills —
 * floated at huge scale and animated a piece at a time. A screenshot cannot do
 * that: its dropdown cannot slide out on its own, and cropping into it just
 * magnifies pixels. A toolbar lifted from a screenshot was 576 real pixels
 * stretched to 1360, and it showed.
 *
 * Drawn, it is sharp at any size, every chip animates independently, and the
 * composition is ours to place.
 *
 * **The labels must be real.** They come from recon, which read them off the
 * live page. A rebuilt component carrying the product's actual words is
 * truthful; one carrying invented words is a lie that renders beautifully, and
 * that distinction is the whole reason this is allowed to exist alongside the
 * recorder.
 */

/**
 * Where each chip sits, as a percentage of the frame.
 *
 * Hand-placed rather than laid out on a grid, and deliberately loose — the
 * reference clusters are scattered, overlapping, and some run off the frame
 * edge. A neat centred row reads as a component library screenshot.
 * Index-driven so the same plan always renders identically.
 */
const CLUSTER = [
  { x: 26, y: 34, scale: 1.0, delay: 0 },
  { x: 62, y: 27, scale: 0.92, delay: 5 },
  { x: 38, y: 52, scale: 1.08, delay: 10 },
  { x: 71, y: 48, scale: 0.88, delay: 15 },
  { x: 30, y: 69, scale: 0.96, delay: 20 },
  { x: 66, y: 71, scale: 1.02, delay: 25 },
];

export const VectorChips: React.FC<{
  /** Real labels, read off the product by recon. Never invented. */
  items: string[];
  /** Which chip is lit. */
  active?: number;
  surface?: SurfaceKind;
}> = ({ items, active = 0, surface }) => {
  const frame = useCurrentFrame();
  const { text, accent, onLight } = surfaceColors(surface);
  const shown = items.slice(0, CLUSTER.length);

  return (
    <AbsoluteFill>
      {shown.map((label, i) => {
        const at = CLUSTER[i];
        const isActive = i === active;

        const appear = fadeIn(frame, at.delay, 16);
        const rise = interpolate(frame, [at.delay, at.delay + 22], [26, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        });
        const blur = entranceBlur(frame, at.delay, 14, 10);
        // The lit chip settles a touch larger, arriving last so the eye lands
        // on it after the cluster has assembled.
        const lift = isActive
          ? interpolate(frame, [at.delay + 10, at.delay + 34], [1, 1.06], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            })
          : 1;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${at.x}%`,
              top: `${at.y}%`,
              transform: `translate(-50%, calc(-50% + ${rise}px)) scale(${at.scale * lift})`,
              opacity: appear,
              filter: blur > 0.2 ? `blur(${blur}px)` : "none",
              willChange: "transform, opacity",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "26px 44px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                fontFamily: FONT_SANS,
                fontSize: 40,
                fontWeight: 500,
                letterSpacing: "-0.015em",
                color: text,
                // Glass. `backdrop-filter` reads whatever is behind, so a chip
                // over the mesh picks up its colour instead of sitting on it as
                // a flat plate — which is what makes it look like a surface
                // rather than a shape.
                backdropFilter: "blur(26px) saturate(1.4)",
                background: alpha(text, onLight ? 0.1 : 0.07),
                border: `1px solid ${isActive ? alpha(accent, 0.75) : BORDER_STRONG}`,
                boxShadow: isActive
                  ? `0 30px 80px -30px ${SHADOW}, 0 0 60px -12px ${alpha(accent, 0.55)}`
                  : `0 26px 70px -34px ${SHADOW}`,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: isActive ? accent : alpha(text, 0.35),
                  boxShadow: isActive ? `0 0 24px ${alpha(accent, 0.9)}` : "none",
                }}
              />
              {label}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
