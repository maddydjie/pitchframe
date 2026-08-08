import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE, entranceBlur, fadeIn } from "../lib/motion";
import { surfaceColors } from "../lib/surface";
import type { SurfaceKind } from "../lib/types";
import { BORDER_STRONG, FONT_SANS, SHADOW, alpha } from "../theme";

/**
 * A lattice of tiles that lights up in a diagonal wave.
 *
 * `chips` says "here is what it can do" and `fan` says "there are many of
 * these". Neither says *a system*: something with parts that relate to each
 * other, that gets swept, covered, checked. That shape turns up constantly —
 * a scanner passing over files, a platform with modules, coverage across a
 * surface — and drawing it as a moving field reads as machinery working, which
 * a screenshot of a list never does.
 *
 * The wave is diagonal rather than left-to-right because a straight sweep
 * reads as a loading bar. A diagonal reads as something propagating.
 *
 * **Labels must be real**, like every drawn archetype — they come from recon,
 * which read them off the live product. Tiles beyond the supplied labels stay
 * blank, which is honest: the lattice is a texture, not a claim that there are
 * exactly twenty-four of anything.
 */

const COLS = 6;

/**
 * Rows follow the labels rather than being fixed.
 *
 * A fixed 6×4 lattice given twelve real labels drew two entirely empty rows,
 * which reads as a half-loaded page rather than as texture. One spare row is
 * texture; two is a mistake.
 */
const rowsFor = (count: number) =>
  Math.max(2, Math.min(4, Math.ceil(count / COLS) + (count % COLS === 0 ? 1 : 0)));

/** Frames between one diagonal and the next. Scaled by PACE inside fadeIn. */
const WAVE_STEP = 4;

export const VectorGrid: React.FC<{
  /** Real strings, read off the product by recon. Never invented. */
  items: string[];
  /** Which tile is held lit after the wave passes. */
  active?: number;
  surface?: SurfaceKind;
}> = ({ items, active = 0, surface }) => {
  const frame = useCurrentFrame();
  const { text, accent, onLight } = surfaceColors(surface);

  const rows = rowsFor(items.length);
  const tiles = COLS * rows;
  const labelled = items.slice(0, tiles);

  return (
    <AbsoluteFill
      style={{
        // Stage collapses AbsoluteFill to a point, so drawn content needs an
        // explicit box. Same trap the other archetypes hit.
        width: 1920,
        height: 1080,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 232px)`,
          gridTemplateRows: `repeat(${rows}, 132px)`,
          gap: 20,
        }}
      >
        {Array.from({ length: tiles }, (_, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);

          // Diagonal index: tiles on the same anti-diagonal arrive together.
          const delay = (col + row) * WAVE_STEP;

          const appear = fadeIn(frame, delay, 12);
          const blur = entranceBlur(frame, delay, 8, 10);
          const rise = interpolate(frame, [delay, delay + 18], [18, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          });

          /**
           * The pulse the wave leaves behind: each tile brightens as the wave
           * reaches it and settles back a beat later. Without the settle every
           * tile stays lit and the field goes flat the moment the wave ends.
           */
          const pulse = interpolate(
            frame,
            [delay, delay + 10, delay + 30],
            [0, 1, 0.12],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
          );

          const label = labelled[i];
          const isActive = i === active && label !== undefined;
          const lit = isActive ? 1 : pulse;

          return (
            <div
              key={i}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-end",
                padding: 20,
                borderRadius: 18,
                opacity: appear,
                transform: `translateY(${rise}px)`,
                filter: blur > 0.2 ? `blur(${blur}px)` : "none",
                background: alpha(text, onLight ? 0.05 + lit * 0.07 : 0.03 + lit * 0.06),
                border: `1px solid ${
                  lit > 0.5 ? alpha(accent, 0.2 + lit * 0.55) : BORDER_STRONG
                }`,
                boxShadow:
                  lit > 0.5
                    ? `0 0 ${Math.round(20 + lit * 40)}px -14px ${alpha(accent, lit)}`
                    : `0 18px 50px -40px ${SHADOW}`,
                willChange: "transform, opacity",
              }}
            >
              {label ? (
                <span
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 24,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.15,
                    color: alpha(text, isActive ? 1 : 0.55 + lit * 0.35),
                    // A long control label must not reflow the lattice.
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
