import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, entranceBlur, fadeIn } from "../lib/motion";
import { surfaceColors } from "../lib/surface";
import type { SurfaceKind } from "../lib/types";
import { BORDER, BORDER_STRONG, FONT_SANS, SHADOW, alpha } from "../theme";

/**
 * A fan of cards receding into depth.
 *
 * The shot for "there are many of these" — documents, results, records,
 * templates — without listing them, which would be a feature tour. One card is
 * legible at the front and the rest fall away, so the viewer reads *quantity*
 * from the depth rather than from a count.
 *
 * Depth is real: each card sits at its own `translateZ` inside the stage's
 * perspective, so a camera move parallaxes them against each other for free.
 * Faking it with scale would need re-tuning for every shot and would still be
 * wrong, because the correct amount depends on the perspective distance.
 *
 * **Titles come from recon** — real headings, read off the live page. The
 * muted bars under them are deliberately abstract: texture that reads as
 * content without asserting any. Inventing plausible-looking rows would be
 * inventing data, which is the line this whole layer must not cross.
 */

/**
 * Fan geometry.
 *
 * The first attempt offset each card by 54px against a 900px card — a 6%
 * displacement, which is not a fan, it is a stack with a printing error. The
 * titles landed on top of each other and it read as a bug.
 *
 * A fan needs lateral displacement on the order of a *quarter* of the card,
 * and rotation that progresses so the cards splay rather than sit parallel.
 */
const CARD_W = 560;
const CARD_H = 400;
const STEP_X = 156;
const STEP_Y = -30;
const DEPTH_STEP = 130;
/** Yaw of the front card, opening toward the back of the stack. */
const YAW_FRONT = -20;
const YAW_STEP = 5;

export const VectorFan: React.FC<{
  /** Real strings, taken from `.work/recon.json`. Never invented. */
  items: string[];
  surface?: SurfaceKind;
}> = ({ items, surface }) => {
  const frame = useCurrentFrame();
  const { text, accent, onLight } = surfaceColors(surface);
  const cards = items.slice(0, 6);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        // Sized well under the frame on purpose. The reference films are
        // unafraid of empty frames, and a fan that fills the picture reads as
        // a slide; one that sits in space reads as an object.
        width: CARD_W,
        height: CARD_H,
        // Centre the *spread*, not the front card, or the fan drifts right as
        // cards are added.
        marginLeft: -CARD_W / 2 - ((cards.length - 1) * STEP_X) / 2,
        marginTop: -CARD_H / 2 - ((cards.length - 1) * STEP_Y) / 2,
        transformStyle: "preserve-3d",
      }}
    >
      {/* A pool of light behind the stack, so the cards have something to sit
          against. Without it a translucent card on near-black is a smudge. */}
      <div
        style={{
          position: "absolute",
          left: "-40%",
          top: "-30%",
          width: "200%",
          height: "170%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${alpha(accent, 0.3)}, transparent 68%)`,
          filter: "blur(90px)",
          transform: "translateZ(-420px)",
        }}
      />

      {/* Back to front, so the near cards paint over the far ones. */}
      {cards
        .map((label, i) => ({ label, i }))
        .reverse()
        .map(({ label, i }) => {
          const delay = (cards.length - 1 - i) * 4;
          const appear = fadeIn(frame, delay, 18);
          const blurIn = entranceBlur(frame, delay, 16, 12);

          // The stack assembles from flat, spreading into depth as it settles.
          const spread = interpolate(frame, [delay, delay + 30], [0.35, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          });

          const z = -i * DEPTH_STEP * spread;
          const x = i * STEP_X * spread;
          const y = i * STEP_Y * spread;
          const tilt = YAW_FRONT + i * YAW_STEP;

          // Depth of field: only the front card is sharp. The falloff is what
          // makes the stack read as photographed rather than stacked.
          const dof = Math.min(7, i * 1.9);
          const fade = Math.max(0.34, 1 - i * 0.13);
          const isFront = i === 0;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: 0,
                transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${tilt}deg)`,
                opacity: appear * fade,
                filter: blurIn + dof > 0.2 ? `blur(${blurIn + dof}px)` : "none",
                willChange: "transform, opacity",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 26,
                  padding: "38px 42px",
                  boxSizing: "border-box",
                  // Glass, so the mesh behind tints each card differently by
                  // depth instead of every card being the same flat plate.
                  backdropFilter: "blur(20px) saturate(1.3)",
                  // Was 0.055 on a near-black frame, which read as a smudge
                  // rather than as cards. Glass still, but lit enough to have
                  // edges of its own.
                  background: alpha(text, onLight ? 0.12 : 0.13),
                  border: `1px solid ${isFront ? alpha(accent, 0.55) : BORDER}`,
                  boxShadow: isFront
                    ? `0 60px 130px -50px ${SHADOW}, 0 0 90px -30px ${alpha(accent, 0.4)}`
                    : `0 50px 110px -60px ${SHADOW}`,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 36,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                    color: text,
                    marginBottom: 28,
                  }}
                >
                  {label}
                </div>

                {/* Texture, not data. Abstract bars say "there is content here"
                    without claiming what it is — inventing plausible rows
                    would be inventing the product's content. */}
                {[0.82, 0.64, 0.44].map((w, r) => (
                  <div
                    key={r}
                    style={{
                      width: `${w * 100}%`,
                      height: 12,
                      borderRadius: 6,
                      marginBottom: 16,
                      background: alpha(text, 0.13),
                      border: `1px solid ${BORDER_STRONG}`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
};
