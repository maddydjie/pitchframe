import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import planJson from "../plan.json";
import type { BeatSpec, ScenePlan } from "./lib/types";
import { EASE } from "./lib/motion";
import { useJsonAsset } from "./lib/asset";
import { Background } from "./components/Background";
import { Fonts } from "./components/Fonts";
import { Surface } from "./components/Surface";
import { Grade } from "./components/Grade";
import { Transition, TRANSITION_LEN } from "./components/Transition";
import { TypographyBeat } from "./scenes/TypographyBeat";
import { LogoBeat } from "./scenes/LogoBeat";
import { InteractionBeat } from "./scenes/InteractionBeat";
import { UIBeat } from "./scenes/UIBeat";
import { CTABeat } from "./scenes/CTABeat";

/**
 * The composition. A pure function of plan.json + theme.ts.
 *
 * Nothing product-specific lives here — swap those two files and you have a
 * different company's launch video. Keep it that way: the moment a colour or
 * a string appears in this file, the pipeline stops being reusable.
 */

const plan = planJson as unknown as ScenePlan;

/**
 * Beats overlap so one cross-dissolves under the next. No hard cuts: a hard
 * cut in this genre reads as an unfinished edit.
 */
const OVERLAP = 8;

const renderBeat = (beat: BeatSpec, durationInFrames: number) => {
  switch (beat.type) {
    case "typography":
      return <TypographyBeat beat={beat} durationInFrames={durationInFrames} />;
    case "logo":
      return <LogoBeat beat={beat} durationInFrames={durationInFrames} />;
    case "interaction":
      return <InteractionBeat beat={beat} durationInFrames={durationInFrames} />;
    case "ui":
      return <UIBeat beat={beat} durationInFrames={durationInFrames} />;
    case "cta":
      return <CTABeat beat={beat} durationInFrames={durationInFrames} />;
    default:
      return null;
  }
};

/**
 * The paired scale that rides the dissolve: the outgoing beat drifts to 1.02
 * as it leaves, the incoming settles from 0.98. Two hundredths is nothing to
 * look at and everything to feel — it turns a fade into a camera handing off.
 */
const CrossScale: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, OVERLAP], [0.98, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const exit = interpolate(
    frame,
    [durationInFrames - OVERLAP, durationInFrames],
    [1, 1.02],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
  const scale = frame < durationInFrames - OVERLAP ? enter : exit;

  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, willChange: "transform" }}>
      {children}
    </AbsoluteFill>
  );
};

export const LaunchVideo: React.FC = () => {
  const total = plan.total_frames;

  return (
    <AbsoluteFill>
      <Fonts />
      <Background corner="tl" />

      {plan.beats.map((beat, index) => {
        const [start, end] = beat.frames;
        const isLast = index === plan.beats.length - 1;
        const length = Math.min(end + (isLast ? 0 : OVERLAP), total) - start;
        if (length <= 0) return null;

        return (
          <Sequence
            key={beat.id}
            from={start}
            durationInFrames={length}
            name={`${beat.id}. ${beat.type}`}
            layout="none"
          >
            <CrossScale durationInFrames={length}>
              {/* Rendered per beat rather than globally so consecutive beats
                  cross-dissolve their surfaces along with their content —
                  which is what makes a cut from dark to a colour field read
                  as one move instead of two. */}
              <Surface kind={beat.surface} durationInFrames={length} />
              {renderBeat(beat, length)}
            </CrossScale>
          </Sequence>
        );
      })}

      {plan.beats.map((beat, index) => {
        if (index === 0) return null;
        const kind = beat.transition ?? "dissolve";
        if (kind === "dissolve" || kind === "none") return null;

        const from = Math.max(0, beat.frames[0] - Math.round(TRANSITION_LEN / 2));
        return (
          <Sequence
            key={`t-${beat.id}`}
            from={from}
            durationInFrames={TRANSITION_LEN}
            name={`↔ ${kind}`}
            layout="none"
          >
            <Transition kind={kind} />
          </Sequence>
        );
      })}

      {/* Last, and above everything: a grade applies to the picture, not to
          the things in it. Anything drawn after this would sit outside it. */}
      {plan.grade === false ? null : <Grade />}

      {/* Voice-over. Each clip sits in its own Sequence at the frame its beat
          starts, because the beat's length *is* the clip's length. */}
      {(plan.narration ?? []).map((line, i) => (
        <Sequence
          key={`vo-${i}`}
          from={line.from}
          durationInFrames={line.frames}
          name={`♪ ${line.file}`}
          layout="none"
        >
          <Audio src={staticFile(`audio/${line.file}`)} />
        </Sequence>
      ))}

      <Soundtrack wantsBed={plan.music !== false} narrated={(plan.narration ?? []).length > 0} />
    </AbsoluteFill>
  );
};

/**
 * One voiced line, placed at the frame its beat begins.
 *
 * The picture was cut to these clips rather than the other way round, so the
 * offset is simply the beat's own start — no alignment pass, no drift.
 */
type Narration = { file: string; from: number; frames: number };

type AudioManifest = {
  cues: boolean;
  bed: boolean;
  /** A real track the user dropped into public/audio/, if there is one. */
  music: string | null;
};

/**
 * The sound.
 *
 * Everything here is generated by scripts/gen-audio.mjs from this same plan,
 * so the cues land on the frames the edit actually cuts on — including the
 * frame the mouse went down, which is read back out of the recording track.
 *
 * Levels are baked into the generated files rather than set here: the bed is
 * synthesized at about -20dBFS and ducked under each impact at generation
 * time, which is a thing that can only be done where the cue times are known.
 * Turning these into `volume` props would put the mix in two places.
 */
const Soundtrack: React.FC<{ wantsBed: boolean; narrated: boolean }> = ({
  wantsBed,
  narrated,
}) => {
  const audio = useJsonAsset<AudioManifest>("audio/audio.json");
  if (audio.status !== "ready") return null;

  return (
    <>
      {/* Cues duck under narration. A whoosh at full strength over a spoken
          line makes the line harder to follow, and the line is the point. */}
      {audio.value.cues ? (
        <Audio src={staticFile("audio/cues.wav")} volume={narrated ? 0.45 : 1} />
      ) : null}
      {/* A real track ducks hard under narration and carries the video without
          it — the same rule the synthesized bed below already followed. Left at
          a fixed 0.26 it was inaudible on a video with no voice-over, which is
          a legitimate way to cut one. */}
      {wantsBed && audio.value.music ? (
        <Audio src={staticFile(`audio/${audio.value.music}`)} volume={narrated ? 0.26 : 0.8} />
      ) : wantsBed && audio.value.bed ? (
        <Audio src={staticFile("audio/bed.wav")} volume={narrated ? 0.5 : 1} />
      ) : null}
    </>
  );
};
