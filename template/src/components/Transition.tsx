import React, { useRef } from "react";
import { AbsoluteFill } from "remotion";
import type { TransitionKind } from "../lib/types";
import { useGsapTimeline } from "../lib/useGsapTimeline";
import { ACCENT, TEXT, alpha } from "../theme";

/**
 * Emphasis at the cut. **The GSAP reference implementation** — read this
 * before writing any other GSAP-driven component.
 *
 * Every beat already cross-dissolves into the next with a paired scale — that
 * is the house transition and it is handled in the composition, not here.
 * These are optional effects layered on top, so a cut still works if the
 * effect is removed. An effect that carries the cut becomes a thing the
 * viewer watches instead of the product.
 *
 * In a launch video these should be rare. The hero moment is the thing that
 * is supposed to be memorable.
 *
 * ---
 *
 * Why this one uses GSAP and, say, `Zoom` does not: a sweep is three
 * properties (position, opacity in, opacity out) on overlapping schedules
 * inside eighteen frames. Written as `interpolate` that is three calls whose
 * timings have to be kept in agreement by hand; written as a timeline it is
 * one sequence with positions relative to each other. A single-property tween
 * gains nothing from GSAP and costs a library — that is the whole decision
 * rule, and it is in `pitchframe-gsap`.
 */

export const TRANSITION_LEN = 18;

/** At 30fps. The components are frame-authored; GSAP works in seconds. */
const SECONDS = TRANSITION_LEN / 30;

export const Transition: React.FC<{ kind: TransitionKind }> = ({ kind }) => {
  const sweepRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  useGsapTimeline(
    (tl) => {
      if (kind === "sweep" && sweepRef.current) {
        tl.fromTo(
          sweepRef.current,
          { xPercent: -130, opacity: 0 },
          { xPercent: 430, opacity: 0.85, duration: SECONDS, ease: "power2.inOut" },
          0,
        )
          // Fades run *against* the travel rather than after it, which is what
          // stops the band appearing from nothing at the frame edge.
          .to(sweepRef.current, { opacity: 0.85, duration: SECONDS * 0.16 }, 0)
          .to(sweepRef.current, { opacity: 0, duration: SECONDS * 0.28 }, SECONDS * 0.72);
      }

      if (kind === "flash" && flashRef.current) {
        // Fast attack, slow decay — a symmetric flash reads as a mistake.
        tl.fromTo(
          flashRef.current,
          { opacity: 0 },
          { opacity: 1, duration: SECONDS * 0.3, ease: "power3.out" },
          0,
        ).to(
          flashRef.current,
          { opacity: 0, duration: SECONDS * 0.7, ease: "power2.inOut" },
          SECONDS * 0.3,
        );
      }
    },
    [kind],
  );

  if (kind === "sweep") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
        <div
          ref={sweepRef}
          style={{
            position: "absolute",
            top: "-25%",
            left: 0,
            width: "26%",
            height: "150%",
            // The skew is static and lives in CSS. GSAP only owns what it
            // animates; anything it does not animate should not be in its
            // hands, or the two fight over the same transform string.
            transform: "skewX(-14deg)",
            background: `linear-gradient(90deg,
              ${alpha(ACCENT, 0)} 0%,
              ${alpha(ACCENT, 0.5)} 42%,
              ${alpha(TEXT, 0.72)} 52%,
              ${alpha(ACCENT, 0.5)} 62%,
              ${alpha(ACCENT, 0)} 100%)`,
            filter: "blur(22px)",
            opacity: 0,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (kind === "flash") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <AbsoluteFill
          ref={flashRef}
          style={{
            background: `radial-gradient(ellipse 90% 70% at 50% 50%, ${alpha(ACCENT, 0.34)}, transparent 72%)`,
            opacity: 0,
          }}
        />
      </AbsoluteFill>
    );
  }

  return null;
};
