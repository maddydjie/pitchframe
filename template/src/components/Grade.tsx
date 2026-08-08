import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * The grade — the last layer over everything.
 *
 * What separates a rendered composition from something that looks photographed
 * is mostly not motion. It is that a lens and a sensor do things to an image
 * that a compositor does not: bright areas bleed into their surroundings,
 * contrast is not linear, and colour is never quite neutral.
 *
 * All three are approximated here with `backdrop-filter`, which reads whatever
 * has already been drawn. That constraint is why this is a stack of full-frame
 * layers rather than a per-element effect — a grade applies to the picture,
 * not to the things in it, and applying it per element is both wrong and
 * dramatically more expensive.
 *
 * Grain and vignette are deliberately *not* here — they live in `Background`,
 * because they also solve a technical problem (h264 banding across large
 * near-black gradients) and have to be present even when the grade is off.
 */

export const Grade: React.FC<{
  /** 0 disables the layer entirely rather than rendering a no-op filter. */
  bloom?: number;
  contrast?: number;
}> = ({ bloom = 0, contrast = 1.05 }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {/*
      Bloom, **off by default.**

      It helps a dark frame and actively hurts a bright one: screening a
      blurred bright copy over a white canvas cannot lift the white any
      further, so all it does is halo the dark strokes and soften the whole
      picture. On a white-canvas product it read as the UI being out of focus.
      Pass a value explicitly for a dark-heavy video.

      A blurred, brightened copy of the frame screened back over itself,
      so highlights spread into what surrounds them and dark areas are barely
      touched — `screen` is near-identity against black. This is why it lifts a
      glowing button or a white headline without fogging the whole picture.
    */}
    {bloom > 0.01 ? (
      <AbsoluteFill
        style={{
          backdropFilter: "blur(26px) brightness(1.5) saturate(1.15)",
          mixBlendMode: "screen",
          opacity: bloom,
        }}
      />
    ) : null}

    {/*
      The tone curve, such as it is. A small contrast and saturation lift
      applied after the bloom, so it acts on the bloomed image the way a grade
      sits after the lens rather than before it.

      Kept small on purpose: past about 1.08 the near-blacks crush, and this
      genre lives in the near-blacks.
    */}
    {contrast > 1.001 ? (
      <AbsoluteFill
        style={{
          backdropFilter: `contrast(${contrast}) saturate(1.06)`,
        }}
      />
    ) : null}
  </AbsoluteFill>
);
