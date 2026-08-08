import React, { useRef, useState } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { LogoBeatSpec } from "../lib/types";
import { EASE, EASE_OUT, entranceBlur, fadeIn, fadeOut, heldDrift, wordDelay } from "../lib/motion";
import { ACCENT, BACKGROUND, FONT_SANS, GLOW, SHADOW, TEXT, alpha } from "../theme";
import { surfaceColors } from "../lib/surface";
import { RotatingLogo3D } from "../three/RotatingLogo3D";
import { useGsapTimeline } from "../lib/useGsapTimeline";

/**
 * The brand mark landing.
 *
 * The reveal is layered rather than a single move, because a logo that simply
 * fades in reads as a watermark. Five things happen, overlapping:
 *
 *   - a bloom opens behind the mark, so the light arrives before the logo does
 *   - two rings expand out and dissipate, like something has just landed
 *   - the mark resolves out of blur and settles from slightly oversize
 *   - a highlight sweeps across it once
 *   - the wordmark's letters stagger up underneath
 *
 * Every part is on the house easing. There is no bounce: a mark that overshoots
 * and springs back reads as playful, and a launch reveal is not playful.
 */

const PLATE = 320;

export const LogoBeat: React.FC<{
  beat: LogoBeatSpec;
  durationInFrames: number;
}> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();
  // The mark itself keeps its plate logic; only the type follows the surface.
  const surface = surfaceColors(beat.surface);
  const [failed, setFailed] = useState(false);
  /**
   * A wide mark is a wordmark — it already spells the product name, so
   * printing the text wordmark under it prints the name twice. That is the
   * most common way a logo beat looks amateur, and it is measured from the
   * loaded image rather than declared in the plan so it is right by default
   * for a fetched mark and for one the founder dropped in by hand.
   */
  const [markIsWordmark, setMarkIsWordmark] = useState(false);

  const exit = fadeOut(frame, durationInFrames, 12);
  const drift = heldDrift(frame, durationInFrames, 3);

  /**
   * The reveal, as one GSAP timeline.
   *
   * Seven stages whose timings have to agree with each other: the light
   * arrives, the mark resolves out of blur six frames later, two rings expand
   * out of it on a stagger. Written as `interpolate` that was seven separate
   * calls with seven hand-kept frame windows, and re-timing the beat meant
   * editing all of them. A timeline states the relationships once.
   *
   * This is the case the GSAP decision rule is *for* — several properties on
   * overlapping schedules. `Zoom` and `FocusOverlay` are single tweens and
   * stay on `interpolate`, where they belong.
   */
  const bloomRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const ringARef = useRef<HTMLDivElement>(null);
  const ringBRef = useRef<HTMLDivElement>(null);

  useGsapTimeline(
    (tl) => {
      const F = (frames: number) => frames / 30;

      if (bloomRef.current) {
        tl.fromTo(
          bloomRef.current,
          { opacity: 0, scale: 0.86 },
          { opacity: 1, scale: 1, duration: F(22), ease: "power3.out" },
          0,
        );
      }

      if (markRef.current) {
        tl.fromTo(
          markRef.current,
          { opacity: 0, scale: 1.08, filter: "blur(12px)" },
          {
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
            duration: F(28),
            // expo.out: aggressive start, long settle — the mark arrives
            // decisively and then barely moves, which is what makes it land.
            ease: "expo.out",
          },
          F(6),
        );
      }

      // Rings expand out of the mark and dissipate, staggered.
      [ringARef.current, ringBRef.current].forEach((el, i) => {
        if (!el) return;
        tl.fromTo(
          el,
          { scale: 0.7, opacity: 0.4 },
          { scale: 2.6, opacity: 0, duration: F(40), ease: "power2.out" },
          F(10 + i * 12),
        );
      });
    },
    [beat.id],
  );

  // One highlight crossing the mark, after it has settled.
  const sweep = interpolate(frame, [30, 62], [-60, 160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const showWordmark = Boolean(beat.source) && !failed ? !markIsWordmark : true;
  const words = (showWordmark ? (beat.wordmark ?? "") : "").split(/\s+/).filter(Boolean);
  const usePlate = (beat.plate ?? "light") === "light";

  const mark = beat.source && !failed ? (
    <Img
      src={staticFile(`assets/${beat.source}`)}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth / Math.max(1, img.naturalHeight) > 2.4) {
          setMarkIsWordmark(true);
        }
      }}
      style={{
        // A wordmark needs the width; a square mark needs the breathing room.
        width: markIsWordmark
          ? PLATE * (usePlate ? 0.82 : 1.5)
          : usePlate
            ? PLATE * 0.62
            : PLATE * 0.9,
        objectFit: "contain",
        display: "block",
        /**
         * KNOWN ISSUE — a mark captured off a dark-themed product arrives with
         * that product's background baked in, and lands here inside a faintly
         * visible rectangle of very-slightly-wrong black.
         *
         * Two fixes were tried and neither worked. `omitBackground` plus
         * `* { background: transparent !important }` injected before the shot
         * still returned an opaque capture. `mixBlendMode: "screen"` here
         * changed nothing, because the entrance animation wrapping this image
         * creates a stacking context and the blend is isolated inside it.
         *
         * The real fix is upstream: capture the mark as SVG when the product
         * has one, or trim the captured PNG's constant border before writing
         * it. Do not reach for another blend mode — that path is closed.
         */
      }}
    />
  ) : (
    // No mark captured: set the wordmark's initial as the mark instead of
    // rendering an empty plate.
    <div
      style={{
        fontFamily: FONT_SANS,
        fontSize: 140,
        fontWeight: 800,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        // On the light plate the glyph takes the video background, so the pair
        // stays consistent whatever palette this product resolved to.
        color: usePlate ? BACKGROUND : TEXT,
      }}
    >
      {(beat.wordmark ?? "•").trim().charAt(0)}
    </div>
  );

  /**
   * The 3D treatment replaces the beat entirely rather than layering over it.
   * A flat mark and a lit slab of the same mark on screen together is two
   * logos, and the whole point of the beat is that there is one.
   */
  if (beat.three_d?.template === "rotating_logo") {
    return (
      <RotatingLogo3D
        logo={beat.source}
        turns={(beat.three_d.props?.turns as number | undefined) ?? 1}
      />
    );
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translateY(${drift}px)`,
      }}
    >
      {/* The bloom, arriving ahead of the mark. */}
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 620,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${GLOW}, transparent 70%)`,
          filter: "blur(90px)",
          opacity: 0,
        }}
        ref={bloomRef}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          {[ringARef, ringBRef].map((ref, i) => (
            <div
              key={i}
              ref={ref}
              style={{
                position: "absolute",
                width: PLATE,
                height: PLATE,
                borderRadius: usePlate ? 64 : "50%",
                // Full-strength colour; GSAP animates the element's own
                // opacity. Baking the fade into the border colour would mean
                // two things owning the same fade.
                border: `2px solid ${alpha(ACCENT, 1)}`,
                opacity: 0,
              }}
            />
          ))}

          <div
            ref={markRef}
            style={{
              opacity: 0,
              width: usePlate ? PLATE : undefined,
              height: usePlate ? PLATE : undefined,
              borderRadius: usePlate ? 56 : 0,
              background: usePlate ? TEXT : "transparent",
              display: "grid",
              placeItems: "center",
              position: "relative",
              overflow: "hidden",
              boxShadow: usePlate
                ? `0 40px 90px -24px ${SHADOW}, 0 0 60px ${alpha(ACCENT, 0.28)}`
                : `0 0 70px ${alpha(ACCENT, 0.3)}`,
            }}
          >
            {mark}
            {/* The highlight, once. */}
            <AbsoluteFill
              style={{
                background: `linear-gradient(105deg,
                  transparent ${sweep - 26}%,
                  ${alpha(usePlate ? ACCENT : TEXT, 0.28)} ${sweep}%,
                  transparent ${sweep + 26}%)`,
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {words.length ? (
          <div style={{ display: "flex", gap: 22, alignItems: "baseline" }}>
            {words.map((w, i) => {
              const delay = 26 + wordDelay(i, 4);
              const wipe = interpolate(frame, [delay, delay + 18], [100, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              });
              const rise = interpolate(frame, [delay, delay + 20], [26, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              });
              return (
                <span key={i} style={{ clipPath: `inset(${wipe}% 0% 0% 0%)` }}>
                  <span
                    style={{
                      display: "inline-block",
                      transform: `translateY(${rise}px)`,
                      opacity: fadeIn(frame, delay, 10) * exit,
                      fontFamily: FONT_SANS,
                      fontSize: 82,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: surface.text,
                    }}
                  >
                    {w}
                  </span>
                </span>
              );
            })}
          </div>
        ) : null}

        {beat.tagline ? (
          <div
            style={{
              opacity: fadeIn(frame, 44, 16) * exit,
              fontFamily: FONT_SANS,
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: "0.01em",
              color: surface.muted,
            }}
          >
            {beat.tagline}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
