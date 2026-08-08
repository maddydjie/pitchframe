import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { CTABeatSpec } from "../lib/types";
import { EASE, driftUp, fadeIn, heldDrift } from "../lib/motion";
import { FONT_SERIF, alpha } from "../theme";
import { surfaceColors } from "../lib/surface";
import { ParticleField } from "../three/ParticleField";

/**
 * The close: a URL and nothing else.
 *
 * No button, no tagline, no "sign up free". The video already made the
 * argument; the card only says where to go. It holds to the last frame
 * rather than fading, so the URL is still up when the loop restarts.
 */

const urlSizeFor = (url: string): number => {
  const n = url.trim().length;
  if (n <= 14) return 108;
  if (n <= 22) return 92;
  if (n <= 30) return 74;
  if (n <= 40) return 58;
  return 48;
};

export const CTABeat: React.FC<{
  beat: CTABeatSpec;
  durationInFrames: number;
}> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { text, accent, glow } = surfaceColors(beat.surface);
  const urlSize = urlSizeFor(beat.url);
  const drift = heldDrift(frame, durationInFrames, 3);

  const rule = interpolate(frame, [4, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translateY(${drift}px)`,
      }}
    >
      {/* Underneath everything: a particle field is depth for the type to sit
          in front of, not a thing to look at. */}
      {beat.three_d?.template === "particle_field" ? (
        <ParticleField
          density={(beat.three_d.props?.density as "low" | "medium" | "high" | undefined) ?? "low"}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          width: 1500,
          height: 560,
          borderRadius: "50%",
          background: glow
            ? `radial-gradient(ellipse at center, ${glow}, transparent 72%)`
            : "none",
          filter: "blur(110px)",
          opacity: fadeIn(frame, 0, 24),
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <div
          style={{
            width: 140 * rule,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${alpha(text, 0.35)}, transparent)`,
          }}
        />

        <div
          style={{
            opacity: fadeIn(frame, 8, 18),
            transform: `translateY(${driftUp(frame, 8, 16, 20)}px)`,
            fontFamily: FONT_SERIF,
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: urlSize,
            letterSpacing: "-0.015em",
            lineHeight: 1.0,
            color: accent,
            textShadow: `0 0 ${urlSize * 0.6}px ${alpha(accent, glow ? 0.35 : 0.18)}`,
          }}
        >
          {beat.url}
        </div>
      </div>
    </AbsoluteFill>
  );
};
