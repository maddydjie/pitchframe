import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE, fadeIn, fadeOut } from "../lib/motion";
import {
  MESH_BRIGHT,
  MESH_DEEP,
  MESH_LIGHT_BASE,
  MESH_LIGHT_DEEP,
  MESH_LIGHT_MID,
  MESH_MID,
  alpha,
} from "../theme";

/**
 * The surface a beat sits on.
 *
 * The composition has one dark background for the whole video. That is the
 * single biggest thing separating it from the reference launch videos, which
 * all alternate: near-black, then a large soft colour field, then near-black
 * again. The alternation *is* the rhythm — it does the work that cuts and
 * effects otherwise have to do, and it costs nothing to watch.
 *
 * A mesh is four overdriven radial gradients on top of each other, heavily
 * blurred, drifting at different rates. Not a linear gradient: linear
 * gradients read as a CSS background, and the thing that makes a mesh look
 * designed is that its colour boundaries are curved and never quite repeat.
 *
 * Rendered *inside* a beat rather than globally, so consecutive beats
 * cross-dissolve their surfaces along with their content.
 */

export type SurfaceKind = "dark" | "mesh" | "light";

/** Four blobs. Each drifts on its own path so the field never looks tiled. */
const BLOBS = [
  { x: 22, y: 26, w: 78, h: 72, speed: 1.0, dx: 9, dy: -6 },
  { x: 78, y: 30, w: 66, h: 64, speed: 0.7, dx: -7, dy: 8 },
  { x: 38, y: 78, w: 84, h: 70, speed: 1.3, dx: 6, dy: -9 },
  { x: 82, y: 82, w: 58, h: 62, speed: 0.5, dx: -10, dy: -5 },
];

export const Surface: React.FC<{
  kind?: SurfaceKind;
  durationInFrames: number;
}> = ({ kind = "dark", durationInFrames }) => {
  const frame = useCurrentFrame();

  // `dark` is the absence of a surface — the composition's own background
  // shows through. Rendering a black rectangle over it would defeat the
  // cross-dissolve between beats.
  if (kind === "dark") return null;

  const light = kind === "light";
  const stops = light
    ? [MESH_LIGHT_MID, MESH_LIGHT_DEEP, MESH_LIGHT_MID, MESH_LIGHT_BASE]
    : [MESH_MID, MESH_BRIGHT, MESH_DEEP, MESH_MID];

  // Slow enough to be invisible frame to frame, fast enough that a four-second
  // beat is never a still image.
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const opacity = fadeIn(frame, 0, 18) * fadeOut(frame, durationInFrames, 12);

  return (
    <AbsoluteFill
      style={{
        // The base keeps the blobs from letting the dark background through
        // in the gaps, which would read as holes rather than as depth.
        background: light ? MESH_LIGHT_BASE : MESH_DEEP,
        opacity,
      }}
    >
      {BLOBS.map((blob, i) => (
        <AbsoluteFill
          key={i}
          style={{
            background: `radial-gradient(ellipse ${blob.w}% ${blob.h}% at ${
              blob.x + t * blob.dx * blob.speed
            }% ${blob.y + t * blob.dy * blob.speed}%, ${stops[i]}, transparent 62%)`,
          }}
        />
      ))}

      {/*
        The whole field blurred as one. Blurring each blob separately keeps
        their edges distinct and the result looks like four circles; blurring
        the composite is what fuses them into a single surface.
      */}
      <AbsoluteFill
        style={{
          backdropFilter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Falloff at the frame edge, so the field feels lit rather than filled. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 90% 80% at 50% 45%, transparent 45%, ${alpha(
            light ? MESH_LIGHT_DEEP : MESH_DEEP,
            light ? 0.35 : 0.55,
          )} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
