import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { TypographyBeatSpec } from "../lib/types";
import {
  EASE,
  EASE_EXIT,
  entranceBlur,
  fadeIn,
  fadeOut,
  heldDrift,
  wordDelay,
} from "../lib/motion";
import { FONT_SANS, FONT_SERIF, TEXT, alpha } from "../theme";
import { surfaceColors } from "../lib/surface";

/**
 * Setup and payoff. Never narration.
 *
 * In a launch video typography does two jobs: frame why the hero moment
 * matters before it happens, and let the viewer complete the thought after.
 * If a typography beat is describing what the product does, it is a caption
 * track and it belongs in a demo.
 *
 * Display weight is 800 with tight tracking and a 1.0 line height — launch
 * typography is a statement, and statements are set heavy.
 */

const fontSizeFor = (text: string): number => {
  const n = text.trim().length;
  if (n <= 8) return 210;
  if (n <= 14) return 180;
  if (n <= 22) return 152;
  if (n <= 34) return 124;
  if (n <= 48) return 100;
  return 84;
};

/**
 * Per-word variation for the stacked layout.
 *
 * Indexed rather than random, for two reasons. Re-rendering the same plan has
 * to produce the same file, so `Math.random()` is out. And a hand-tuned cycle
 * beats noise anyway: the sizes rise, dip and rise again, which gives the
 * stack a shape instead of a jitter. Offsets are percentages of the line box.
 */
/**
 * The ghost trail.
 *
 * Copies of a word left behind it, offset along the direction it arrived from
 * and fading. It reads as motion frozen mid-travel — the word is still moving,
 * caught. The reference films use it for a single phrase carrying momentum.
 *
 * Three echoes: two is a printing error, four is a smear. They keep a residual
 * offset after the word settles rather than converging to nothing, because a
 * trail that vanishes is just a slow entrance.
 */
const ECHOES = 2;
/**
 * Horizontal only, and further than looks right on paper.
 *
 * The first attempt used a diagonal 26/14px offset with 1.6px of blur per
 * copy, against display type at 150px+. That reads as a drop shadow, not a
 * trail — the copies have to be far enough apart to be legible *as copies*.
 * Diagonal also fights the baseline; lateral displacement reads as travel.
 */
const ECHO_X = -46;
const ECHO_Y = 0;
const ECHO_BLUR = 0.9;
/** How much of the trail survives the settle. */
const ECHO_REST = 0.5;

const STACK_RHYTHM = [
  { size: 1.0, shift: -14, rotate: -1.2 },
  { size: 0.74, shift: 4, rotate: 0.8 },
  { size: 1.12, shift: 16, rotate: -0.6 },
  { size: 0.86, shift: -6, rotate: 1.0 },
  { size: 1.04, shift: 10, rotate: -0.9 },
];

/**
 * A word, possibly split so part of it carries the accent.
 *
 * Whole-word accenting could not express what the reference films do: colour
 * on the last two letters of "deeper", so the word turns as it is read. The
 * parts of one word render inside a single span with no gap, so they stay one
 * word visually while being two colours.
 */
type Part = { text: string; accent: boolean };
type Token = { parts: Part[] };

const tokenize = (text: string, accentWord?: string | null): Token[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const plain = (word: string): Token => ({ parts: [{ text: word, accent: false }] });
  if (!accentWord) return words.map(plain);

  const accentWords = accentWord.split(/\s+/).filter(Boolean);
  const strip = (w: string) => w.replace(/[.,!?;:]+$/, "");

  // Whole-word run first — the common case, and it must win over a fragment
  // match so "one" in "one place" does not colour the "one" inside "money".
  for (let i = 0; i <= words.length - accentWords.length; i++) {
    if (accentWords.every((aw, j) => strip(words[i + j]) === strip(aw))) {
      return words.map((word, idx) =>
        idx >= i && idx < i + accentWords.length
          ? { parts: [{ text: word, accent: true }] }
          : plain(word),
      );
    }
  }

  // Fragment: the accent is part of a single word.
  if (accentWords.length === 1) {
    const needle = accentWords[0];
    const hit = words.findIndex((w) => w.includes(needle));
    if (hit >= 0) {
      const word = words[hit];
      const at = word.indexOf(needle);
      const parts = [
        { text: word.slice(0, at), accent: false },
        { text: needle, accent: true },
        { text: word.slice(at + needle.length), accent: false },
      ].filter((part) => part.text.length > 0);
      return words.map((w, idx) => (idx === hit ? { parts } : plain(w)));
    }
  }

  return words.map(plain);
};

export const TypographyBeat: React.FC<{
  beat: TypographyBeatSpec;
  durationInFrames: number;
}> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();

  // A light surface inverts the type. See lib/surface.ts for why this is a
  // shared helper rather than a ternary in each scene.
  const { onLight, text: textColor, accent: accentColor, glow } = surfaceColors(
    beat.surface,
  );

  const stacked = beat.layout === "stacked";
  const ghosted = beat.layout === "ghosted";
  const tokens = tokenize(beat.text, beat.accent_word);
  const baseSize = fontSizeFor(beat.text);
  const useAccentStyle = beat.accent_style !== "none" && beat.accent_style !== null;
  const boldSans = beat.accent_style === "bold_sans";
  const hasAccent = tokens.some((t) => t.parts.some((part) => part.accent));

  const exitFade = fadeOut(frame, durationInFrames, 11);
  const exitScale = interpolate(
    frame,
    [durationInFrames - 11, durationInFrames],
    [1, 0.985],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXIT },
  );

  // The beat never sits perfectly still.
  const drift = heldDrift(frame, durationInFrames, 3);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 210px",
        transform: `translateY(${-26 + drift}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1500,
          height: 520,
          borderRadius: "50%",
          // No lift behind type on a light surface: a glow on a bright field
          // is a smudge, and the mesh is already doing the lifting.
          background: glow
            ? `radial-gradient(ellipse at center, ${hasAccent ? glow : alpha(TEXT, 0.06)}, transparent 70%)`
            : "none",
          filter: "blur(70px)",
          opacity: fadeIn(frame, 0, 22) * exitFade,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: stacked ? "column" : "row",
          flexWrap: stacked ? "nowrap" : "wrap",
          justifyContent: "center",
          alignItems: stacked ? "center" : "baseline",
          // A stack sets its own line spacing per word; a line needs a word gap.
          gap: stacked ? 0 : `0 ${Math.round(baseSize * 0.24)}px`,
          maxWidth: 1500,
          textAlign: "center",
          opacity: exitFade,
          transform: `scale(${exitScale})`,
          willChange: "transform, opacity",
        }}
      >
        {tokens.map((token, i) => {
          const delay = wordDelay(i, stacked ? 5 : 3);
          const wholeWordAccent =
            token.parts.length === 1 && token.parts[0].accent;
          // A fragment stays in the sans: switching one syllable to an italic
          // serif inside a word reads as a font-loading failure, not a choice.
          const isSerifAccent = wholeWordAccent && useAccentStyle && !boldSans;
          const rhythm = STACK_RHYTHM[i % STACK_RHYTHM.length];
          const size = stacked
            ? baseSize * rhythm.size
            : isSerifAccent
              ? baseSize * 1.08
              : baseSize;

          // Wiped in from the baseline up. clip-path rather than an overflow
          // mask: an inset is exact whatever the font's metrics do.
          const wipe = interpolate(frame, [delay, delay + 20], [100, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          });
          const rise = interpolate(frame, [delay, delay + 22], [size * 0.28, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          });
          const appear = fadeIn(frame, delay, 7);
          const blur = entranceBlur(frame, delay, 12, 8);

          // Trail length: full while the word travels, settling to a residual.
          const trail = ghosted
            ? interpolate(frame, [delay, delay + 30], [1, ECHO_REST], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              })
            : 0;

          return (
            <span
              key={`${beat.id}-${i}`}
              style={{
                display: "inline-block",
                clipPath: `inset(${wipe}% 0% 0% 0%)`,
                ...(stacked
                  ? {
                      transform: `translateX(${rhythm.shift}%) rotate(${rhythm.rotate}deg)`,
                      // Negative leading. Display type at 1.0 line-height still
                      // leaves a visible gutter between stacked words, and the
                      // stack only reads as one object when they nearly touch.
                      marginTop: i === 0 ? 0 : -size * 0.16,
                    }
                  : {}),
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  position: "relative",
                  transform: `translateY(${rise}px)`,
                  opacity: appear,
                  filter: blur > 0.2 ? `blur(${blur}px)` : "none",
                  color: textColor,
                  fontFamily: isSerifAccent ? FONT_SERIF : FONT_SANS,
                  fontStyle: isSerifAccent ? "italic" : "normal",
                  // Display weight. 800 minimum for the sans; the serif accent
                  // carries its contrast through italics instead.
                  fontWeight: isSerifAccent ? 400 : 800,
                  fontSize: size,
                  letterSpacing: isSerifAccent ? "-0.01em" : "-0.02em",
                  lineHeight: 1.0,
                  textShadow: token.parts.some((part) => part.accent)
                    ? `0 0 ${baseSize * 0.5}px ${alpha(accentColor, onLight ? 0.16 : 0.3)}`
                    : "none",
                  willChange: "transform, opacity",
                }}
              >
                {ghosted && !isSerifAccent
                  ? Array.from({ length: ECHOES }, (_, e) => {
                      const k = e + 1;
                      return (
                        <span
                          key={`echo-${e}`}
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            whiteSpace: "nowrap",
                            transform: `translate(${ECHO_X * k * trail}px, ${ECHO_Y * k * trail}px)`,
                            // Each copy further back is fainter and softer, so
                            // the trail recedes rather than repeating.
                            opacity: (0.26 / k) * appear,
                            filter: `blur(${k * ECHO_BLUR}px)`,
                            color: textColor,
                            pointerEvents: "none",
                          }}
                        >
                          {token.parts.map((part) => part.text).join("")}
                        </span>
                      );
                    })
                  : null}

                {token.parts.map((part, j) => (
                  <span
                    key={j}
                    style={{
                      position: "relative",
                      color: part.accent ? accentColor : textColor,
                    }}
                  >
                    {part.text}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
