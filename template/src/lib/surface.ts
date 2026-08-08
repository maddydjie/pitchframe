import type { SurfaceKind } from "./types";
import {
  ACCENT,
  ACCENT_ON_LIGHT,
  GLOW,
  TEXT,
  TEXT_MUTED,
  TEXT_ON_LIGHT,
  alpha,
} from "../theme";

/**
 * The colours a beat draws with, given what it is sitting on.
 *
 * This exists as one function rather than a ternary in each scene because the
 * first light surface shipped white display type on pale lavender at 1.57:1 —
 * fine on a mock, invisible in the video. That failure is not a one-off: it
 * recurs in every component that gains a light context and forgets, and a
 * ternary repeated in five files is five chances to forget.
 *
 * A scene that accepts `surface` must read its colours from here. That rule is
 * checkable — `grep -rn "surfaceColors" src/scenes` should list every scene
 * that renders text.
 */
export type SurfaceColors = {
  onLight: boolean;
  text: string;
  accent: string;
  muted: string;
  /**
   * The ambient lift behind type. Null on light, because a glow on a bright
   * field is a smudge — and the field is already doing the lifting.
   */
  glow: string | null;
};

export const surfaceColors = (surface?: SurfaceKind): SurfaceColors => {
  // `mesh` is a mid-tone field built from the accent, and white still clears
  // 4.5:1 on it. Only `light` inverts.
  const onLight = surface === "light";

  return onLight
    ? {
        onLight,
        text: TEXT_ON_LIGHT,
        accent: ACCENT_ON_LIGHT,
        muted: alpha(TEXT_ON_LIGHT, 0.66),
        glow: null,
      }
    : {
        onLight,
        text: TEXT,
        accent: ACCENT,
        muted: TEXT_MUTED,
        glow: GLOW,
      };
};
