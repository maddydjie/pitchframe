import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { InteractionBeatSpec } from "../lib/types";
import { EASE, EASE_OUT, clickPulse, entranceBlur, fadeIn, fadeOut } from "../lib/motion";
import { useRecording } from "../lib/recording";
import { FRAME_H, FRAME_W, frameShot, resolveShots, shotAt } from "../lib/heroShots";
import {
  ACCENT,
  BORDER,
  FONT_SANS,
  SHADOW,
  SURFACE,
  TEXT,
  TEXT_MUTED,
  alpha,
} from "../theme";
import { Cursor } from "../components/Cursor";
import { FocusOverlay } from "../components/FocusOverlay";
import { BrowserFrame } from "../components/BrowserFrame";
import { Screencast } from "../components/Screencast";
import { Stage } from "../components/Stage";
import { VectorChips } from "../components/VectorChips";
import { VectorFan } from "../components/VectorFan";
import { VectorGrid } from "../components/VectorGrid";
import { Zoom } from "../components/Zoom";
import { MockApp } from "../components/MockApp";

/**
 * THE HERO MOMENT.
 *
 * One action, on real UI, framed like a shot rather than a screen recording.
 * This beat gets the most frames in the video because it is the thing people
 * remember; every other beat is setup or payoff around it.
 *
 * There are two sources, and they are not equal.
 *
 * **Footage** (`beat.recording`) is the real one: Chrome driven by Playwright,
 * every painted frame captured, the cursor path recorded alongside. The
 * product's own easing and hover states come through, which is the difference
 * between a video of a product and a video of screenshots of a product.
 *
 * **Before/after stills** are the fallback for sites that cannot be driven —
 * auth walls, hostile CMPs, flaky selectors. A dissolve between two stills is
 * a slideshow, so this path is a graceful degradation, never a target.
 *
 * The camera is the same either way: a slow push that starts wide and closes
 * as the action approaches, then a hard zoom onto the consequence. With
 * footage the zoom is timed to the frame the mouse actually went down; with
 * stills it falls back to the synthetic choreography below.
 *
 *   0–20    wide. Slightly pulled back, target off-centre.
 *   20–40   cursor fades in, ~200px out from the target.
 *   40–90   cursor travels a bezier arc; camera eases in and pans toward it.
 *   60–90   focus pull dims everything but the target.
 *   90–96   click: cursor scale pulse, ripple ring.
 *   96–120  cinematic zoom to 1.3 on the zoom target, background blurs.
 *   120–180 the state change — cross-dissolve to the after-screenshot.
 *   180–210 zoom releases back to 1.0.
 *   210–240 hold, then hand off to the next beat.
 *
 * The timings scale if a plan gives the beat a different length, so a 6s or
 * 10s hero still hits the same shape.
 */

const REFERENCE_LEN = 240;

/**
 * Three framings, and the default is not the safe one.
 *
 * `contained` is a 1660×934 card centred in a 1920×1080 frame — margin on all
 * four sides, rounded corners, a visible border. It is what this beat used to
 * do unconditionally, and it is the look of a screenshot pasted into a slide.
 *
 * `bleed` oversizes the panel so its edges leave the frame. Nothing else
 * changes, and it is the single largest improvement available here: the
 * viewer stops seeing a picture of an app and starts seeing the app.
 *
 * `closeup` throws away everything except the element the moment is about.
 */
/**
 * How far the panel oversizes the frame.
 *
 * 2360 cropped **9.3% off every edge**, which on a canvas app deleted the
 * toolbar and the side panel outright — the shot became an empty white field
 * with a shape in it, and the product was invisible. Edge-anchored UI is
 * exactly what bleed removes first.
 *
 * 2120 crops ~4.7% a side: still past the frame, still no visible card, but a
 * toolbar sitting a few percent from the edge survives.
 */
const BLEED_W = 2120;

/**
 * The windowed size. Slightly narrower than `contained` because the title bar
 * adds ~43px of height, and the window still has to sit inside 1080 with
 * enough margin for its shadow to read.
 */

/**
 * A lifted component fills less than the frame.
 *
 * `closeup` crops in situ and fills the whole 1920 — the app still surrounds
 * it. A `component` has been taken *out* of the app and floated on the video's
 * own surface, so it needs margin around it or it stops reading as an object
 * on a background and goes back to reading as a crop.
 */

/**
 * The panel's outer shell.
 *
 * Three looks share one child tree, so the footage, cursor and depth-of-field
 * layers below never have to know which one they are inside.
 */
const Frame: React.FC<{
  chrome: boolean;
  contained: boolean;
  /** Lifted out of the app and floated on the video's own surface. */
  lifted?: boolean;
  width: number;
  height: number;
  url?: string | null;
  children: React.ReactNode;
}> = ({ chrome, contained, lifted, width, height, url, children }) =>
  chrome ? (
    <BrowserFrame width={width} height={height} url={url}>
      {children}
    </BrowserFrame>
  ) : (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        background: SURFACE,
        // Card treatment only when the card's edges are actually on screen. A
        // radius, a border and a drop shadow on a panel that bleeds past the
        // frame cost render time and draw nothing.
        ...(contained
          ? {
              borderRadius: 20,
              border: `1px solid ${BORDER}`,
              boxShadow: `0 70px 160px -34px ${SHADOW}`,
            }
          : {}),
        // A lifted component is an object sitting on the video's surface, not
        // a window onto an app. Deeper radius and a much longer shadow: the
        // shadow is what sells it as floating rather than pasted.
        ...(lifted
          ? {
              borderRadius: 28,
              border: `1px solid ${BORDER}`,
              boxShadow: `0 120px 220px -60px ${SHADOW}, 0 40px 90px -40px ${SHADOW}`,
            }
          : {}),
      }}
    >
      {children}
    </div>
  );

/** Where the cursor starts: roughly 200px out, biased toward frame centre. */
const approachFrom = (target: { x: number; y: number }) => ({
  x: target.x + (target.x > 50 ? -11 : 11),
  y: target.y + (target.y > 50 ? -9 : 9),
});

export const InteractionBeat: React.FC<{
  beat: InteractionBeatSpec;
  durationInFrames: number;
}> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();
  const [beforeFailed, setBeforeFailed] = useState(false);
  const [afterFailed, setAfterFailed] = useState(false);

  const recording = useRecording(beat.recording);
  const manifest = recording.status === "ready" ? recording.manifest : null;

  // Phase boundaries scale with the beat so the shape survives a re-time.
  const k = durationInFrames / REFERENCE_LEN;
  const P = (f: number) => f * k;

  /**
   * A beat whose shots are all drawn has nothing to point at.
   *
   * `target_element` describes where the synthetic cursor travels and where
   * the lens punches in — both meaningless for a vector archetype, which is
   * not a photograph of anything. Requiring it anyway crashed the render with
   * `Cannot read properties of undefined`, thirty lines from the actual cause.
   * Centre is the honest default: no target, no travel.
   */
  const target = beat.target_element?.coordinates ?? { x: 50, y: 50 };
  const zoomAt = beat.zoom_target ?? target;
  const start = approachFrom(target);
  const drag = beat.drag_target ?? null;

  /* --------------------------------------------------------- framing */

  // All of the arithmetic lives in lib/heroShots.ts as pure functions —
  // numbers you can check without mounting a component.
  const shots = resolveShots(beat, durationInFrames);
  const { active, shotFrame } = shotAt(shots, frame);
  const { effective, crop, chrome, lifted, geometry: geom, zoomPeak, dofPeak } =
    frameShot(active);

  const panelW = geom.w;
  const panelH = geom.h;

  /**
   * When the camera reacts.
   *
   * With footage this is derived from the recording rather than assumed: the
   * first mouse-down in the track, mapped back through the same fit the
   * playback uses. A zoom that fires on the frame the user actually clicked
   * feels like coverage of an event; one that fires on a fixed frame number
   * drifts off it the moment the recording is a different length.
   */
  const CLICK_AT = (() => {
    if (!manifest || manifest.frame_count < 2) return P(90);
    const down = manifest.events.find((e) => e.type === "down");
    if (!down) return P(90);
    return (down.frame / (manifest.frame_count - 1)) * (durationInFrames - 1);
  })();

  /* ---------------------------------------------------------- camera */

  // The dolly is the named shot, on `<Stage>`. What stays here is the part a
  // catalogue cannot know: where the action is. The frame is offset toward the
  // target at the top of the beat and eases to centre as the click approaches,
  // so the composition resolves onto the thing about to happen.

  // Phase 6: the push. Phase 8: the release. Offsets from the click, so both
  // sources drive the same move from whatever their own timing turns out to be.
  const zoomScale = interpolate(
    frame,
    [CLICK_AT + P(6), CLICK_AT + P(30), CLICK_AT + P(90), CLICK_AT + P(120)],
    [1, zoomPeak, zoomPeak, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
  // Falloff is derived from the zoom — see `dofPeak` in lib/heroShots.ts.
  const zoomBlur = interpolate(
    frame,
    [CLICK_AT + P(6), CLICK_AT + P(30), CLICK_AT + P(90), CLICK_AT + P(120)],
    [0, dofPeak, dofPeak * 0.75, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );

  // The pan: the frame drifts toward the target as the camera closes in.
  const panX = interpolate(frame, [0, CLICK_AT], [(50 - target.x) * 0.18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const panY = interpolate(frame, [0, CLICK_AT], [(50 - target.y) * 0.14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  /* ------------------------------------------- synthetic choreography */

  // Everything below drives the stills fallback only. With footage, the real
  // cursor comes from the track and the real state change is in the pixels.

  const cursorOpacity =
    fadeIn(frame, P(20), P(14)) * (1 - fadeIn(frame, P(196), P(14)));

  // Travel on an eased arc — the sideways component lags the vertical, which
  // is what makes a straight line curve.
  const travel = interpolate(frame, [P(40), P(90)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const arc = Math.sin(travel * Math.PI) * 2.4;

  // A drag keeps moving after the press; a click stops.
  const dragProgress = drag
    ? interpolate(frame, [P(100), P(160)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE,
      })
    : 0;

  const pressX = start.x + (target.x - start.x) * travel;
  const pressY = start.y + (target.y - start.y) * travel - arc;
  const cursorX = drag ? pressX + (drag.x - target.x) * dragProgress : pressX;
  const cursorY = drag ? pressY + (drag.y - target.y) * dragProgress : pressY;

  const cursorScale = clickPulse(frame, P(90));
  const ripple = interpolate(frame, [P(90), P(90) + P(26)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const focusAmount = interpolate(
    frame,
    [P(60), P(90), P(150), P(185)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );

  // Phase 7. The after-state arrives during the zoom, so the viewer sees the
  // change happen up close rather than being shown a second screenshot.
  const afterMix = interpolate(frame, [P(120), P(150)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  // Typing reveals a character at a time across the same window.
  const typed = beat.type_content
    ? beat.type_content.slice(
        0,
        Math.round(
          interpolate(frame, [P(96), P(150)], [0, beat.type_content.length], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
        ),
      )
    : "";

  /**
   * A drawn shot replaces the footage for its duration. The recording clock is
   * untouched, so cutting away to vector and back lands on the frame the take
   * had reached — the same as cutting between two camera angles.
   */
  const drawn = active.render ?? null;

  const beatOpacity = fadeIn(frame, 0, 14) * fadeOut(frame, durationInFrames, 12);
  const blur = entranceBlur(frame, 0, 12, 8);

  const screen = (
    src: string | null | undefined,
    failed: boolean,
    onFail: () => void,
  ) =>
    !src || failed ? (
      <MockApp />
    ) : (
      <Img
        src={staticFile(`assets/${src}`)}
        onError={onFail}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          display: "block",
        }}
      />
    );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: beatOpacity,
      }}
    >
      {drawn ? (
        <Stage
          shot={active.shot ?? "locked_off"}
          durationInFrames={active.length}
          frame={shotFrame}
          drift={false}
        >
          {/* Explicit box, because `Stage`'s inner element is sized by its
              transform and has no width of its own — a percentage position
              inside it resolves against zero and every chip lands on the same
              point. */}
          <div style={{ width: FRAME_W, height: FRAME_H, position: "relative" }}>
            {drawn.archetype === "fan" ? (
              <VectorFan items={drawn.items} surface={beat.surface} />
            ) : drawn.archetype === "grid" ? (
              <VectorGrid
                items={drawn.items}
                active={drawn.active}
                surface={beat.surface}
              />
            ) : (
              <VectorChips
                items={drawn.items}
                active={drawn.active}
                surface={beat.surface}
              />
            )}
          </div>
        </Stage>
      ) : null}

      {/* The entrance blur sits outside the stage: `filter` collapses 3D on
          whatever element carries it, so putting it inside would silently
          flatten the camera for the first eight frames of every hero beat. */}
      <div
        style={{
          display: drawn ? "none" : undefined,
          filter: blur > 0.15 ? `blur(${blur}px)` : "none",
          willChange: "filter",
        }}
      >
        <Stage
          shot={active.shot ?? "push_in_reveal"}
          durationInFrames={active.length}
          frame={shotFrame}
        >
          <div
            style={{
              transform: `translate(${panX}%, ${panY}%)`,
            }}
          >
            {/* blur={0}: the push must leave the subject sharp. The softening is a
                depth-of-field overlay inside the panel, so what falls away is
                everything *around* the target rather than the target itself. */}
            <Zoom x={zoomAt.x} y={zoomAt.y} scale={zoomScale} blur={0}>
              <Frame
                chrome={chrome}
                contained={effective === "contained"}
                lifted={lifted}
                width={panelW}
                height={panelH}
                url={beat.chrome_url}
              >
            {manifest ? (
              /* Placed, not stretched. When the framing crops, this wrapper is
                 the *whole footage* scaled and slid so the crop lands in the
                 container — which also keeps the cursor track correct, since
                 its coordinates are percentages of the full frame. */
              <div
                style={
                  geom.fit
                    ? { position: "absolute", inset: 0 }
                    : {
                        position: "absolute",
                        width: geom.innerW,
                        height: geom.innerH,
                        left: geom.left,
                        top: geom.top,
                      }
                }
              >
                <Screencast
                  manifest={manifest}
                  local={frame}
                  beatFrames={durationInFrames}
                  showCursor={beat.interaction_type !== "hover"}
                  segment={beat.segment ?? undefined}
                />
              </div>
            ) : recording.status === "loading" ? (
              // Nothing until we know which source we have. Mounting the
              // fallback here would request before/after screenshots that a
              // recorded beat never captured — 404s on every frame, and a
              // flash of the mock UI if the manifest resolves slowly.
              null
            ) : (
              <>
                {/* Before */}
                <AbsoluteFill style={{ opacity: 1 - afterMix }}>
                  {screen(beat.before_screenshot, beforeFailed, () =>
                    setBeforeFailed(true),
                  )}
                </AbsoluteFill>

                {/* After — the proof */}
                <AbsoluteFill style={{ opacity: afterMix }}>
                  {screen(beat.after_screenshot, afterFailed, () => setAfterFailed(true))}
                </AbsoluteFill>

                {/* The target lights up as the focus pull lands on it. */}
                <div
                  style={{
                    position: "absolute",
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: 190,
                    height: 190,
                    marginLeft: -95,
                    marginTop: -95,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${alpha(ACCENT, 0.3)}, transparent 68%)`,
                    opacity: focusAmount * 0.9,
                    pointerEvents: "none",
                  }}
                />

                {/* Typing lands in place, over the field the cursor just entered. */}
                {beat.interaction_type === "type" && typed ? (
                  <div
                    style={{
                      position: "absolute",
                      left: `${target.x}%`,
                      top: `${target.y}%`,
                      transform: "translate(-50%, -50%)",
                      fontFamily: FONT_SANS,
                      fontSize: 30,
                      fontWeight: 500,
                      color: TEXT,
                      background: alpha(SURFACE, 0.94),
                      border: `1px solid ${alpha(ACCENT, 0.5)}`,
                      borderRadius: 10,
                      padding: "12px 20px",
                      whiteSpace: "nowrap",
                      boxShadow: `0 18px 50px ${SHADOW}`,
                    }}
                  >
                    {typed}
                    <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }}>│</span>
                  </div>
                ) : null}

                <FocusOverlay x={target.x} y={target.y} amount={focusAmount} />

                <Cursor
                  x={cursorX}
                  y={cursorY}
                  opacity={cursorOpacity}
                  scale={cursorScale}
                  ripple={beat.interaction_type === "hover" ? 0 : ripple}
                />
              </>
            )}

            {/* Depth of field. Sharp at the zoom target, softening outward —
                a lens opening up, not a blur filter over the picture.
                Sits outside the source switch because it belongs to the
                camera, and the camera is the same for both. */}
            {zoomBlur > 0.05 ? (
              <AbsoluteFill
                style={{
                  backdropFilter: `blur(${zoomBlur}px)`,
                  // `ellipse W% H%` — a percentage radius on `circle` is
                  // invalid, which drops the gradient, drops the mask, and
                  // blurs the entire frame including the subject.
                  WebkitMaskImage: `radial-gradient(ellipse 30% 52% at ${zoomAt.x}% ${zoomAt.y}%, transparent 20%, black 95%)`,
                  maskImage: `radial-gradient(ellipse 30% 52% at ${zoomAt.x}% ${zoomAt.y}%, transparent 20%, black 95%)`,
                  pointerEvents: "none",
                }}
              />
                ) : null}
              </Frame>
            </Zoom>
          </div>
        </Stage>
      </div>

      {beat.caption ? (
        <div
          style={{
            position: "absolute",
            bottom: 62,
            opacity: fadeIn(frame, P(30), 16) * fadeOut(frame, durationInFrames, 14),
            fontFamily: FONT_SANS,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: TEXT_MUTED,
          }}
        >
          {beat.caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
