import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { ShotName } from "../lib/camera";
import { entranceBlur, fadeIn, fadeOut } from "../lib/motion";
import { ACCENT, BORDER, BORDER_STRONG, SHADOW, SURFACE, TEXT, alpha } from "../theme";
import { MockApp } from "./MockApp";
import { GlowBorder } from "./GlowBorder";
import { Stage, Depth } from "./Stage";

/**
 * A product screen treated like footage.
 *
 * Used by plain UI beats — establishing frames and environment shots. The hero
 * moment does not come through here; it has its own beat with its own timing,
 * because a hero shot is choreographed around a recorded click and a generic
 * panel has nothing to choreograph against.
 *
 * The camera comes from the shared catalogue rather than a local table. There
 * used to be two camera systems in this repo — one here, one in the hero beat
 * — and they drifted apart, which is how you end up with a video whose shots
 * do not look like they were filmed by the same person.
 */

/**
 * How far behind the panel the accent glow sits.
 *
 * Far enough to separate visibly during a move, near enough that it never
 * looks detached from the thing it is lighting. This is the payoff for having
 * a real 3D stage: the parallax is free and correct at any camera angle.
 */
const GLOW_DEPTH = -340;

export const Panel: React.FC<{
  screenshot?: string | null;
  shot?: ShotName;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ screenshot, shot = "tilt_settle", durationInFrames, width, height }) => {
  const frame = useCurrentFrame();
  const [imageFailed, setImageFailed] = useState(false);

  const opacity = fadeIn(frame, 0, 16) * fadeOut(frame, durationInFrames, 10);
  const blur = entranceBlur(frame, 0, 12, 8);

  // A single band of light crossing the glass. One pass per beat, never
  // repeating — a looping sweep reads as a CSS effect rather than a reflection.
  const sweep = interpolate(frame, [0, durationInFrames], [-10, 110], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showMock = !screenshot || imageFailed;

  return (
    // `filter` outside the stage: it flattens 3D on whatever element carries
    // it, so an entrance blur applied inside would kill the camera.
    <div
      style={{
        position: "relative",
        opacity,
        filter: blur > 0.15 ? `blur(${blur}px)` : "none",
      }}
    >
      <Stage shot={shot} durationInFrames={durationInFrames}>
        <Depth z={GLOW_DEPTH}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: width * 0.92,
              height: height * 0.8,
              marginLeft: -(width * 0.92) / 2,
              marginTop: -(height * 0.8) / 2,
              borderRadius: "50%",
              background: `radial-gradient(ellipse at center, ${alpha(ACCENT, 0.22)}, transparent 70%)`,
              filter: "blur(90px)",
            }}
          />
        </Depth>

        <div
          style={{
            boxShadow: `0 60px 140px -30px ${SHADOW}`,
            borderRadius: 18,
          }}
        >
          <GlowBorder radius={18} durationInFrames={durationInFrames} width={2}>
            <div
              style={{
                width,
                height,
                position: "relative",
                background: SURFACE,
                boxShadow: `inset 0 1px 0 ${BORDER_STRONG}`,
              }}
            >
              {showMock ? (
                <MockApp />
              ) : (
                <Img
                  src={staticFile(`assets/${screenshot}`)}
                  onError={() => setImageFailed(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    display: "block",
                  }}
                />
              )}

              <AbsoluteFill
                style={{
                  background: `linear-gradient(115deg,
                    transparent ${sweep - 30}%,
                    ${alpha(TEXT, 0.055)} ${sweep}%,
                    transparent ${sweep + 32}%)`,
                  pointerEvents: "none",
                }}
              />
              <AbsoluteFill
                style={{
                  background: `radial-gradient(ellipse 82% 82% at 50% 45%, transparent 34%, ${alpha(SHADOW, 0.3)} 100%)`,
                  pointerEvents: "none",
                  border: `1px solid ${BORDER}`,
                }}
              />
            </div>
          </GlowBorder>
        </div>
      </Stage>
    </div>
  );
};
