#!/usr/bin/env node
/**
 * Turns the Director's script into a scene plan, cut to the voice-over.
 *
 * This is where audio-first stops being a slogan. Every beat's length is the
 * *measured* duration of the line spoken over it — not a guess, not a number
 * anyone chose. Rewrite a line and its beat re-times itself; the judge loop
 * costs one regenerated clip rather than a hand re-edit.
 *
 * The output is the existing `plan.json` schema, deliberately. Everything
 * downstream — multi-shot heroes, drawn archetypes, the 3D treatments, the
 * palette styles — keeps working untouched. The script layer sits on top of
 * the renderer rather than replacing it.
 *
 *   node scripts/plan-from-script.mjs
 *
 * Reads script.json + .work/voice.json, writes plan.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");

const log = (msg) => process.stdout.write(`  ${msg}\n`);
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

/**
 * How long a beat runs when nothing is spoken over it.
 *
 * Reading speed, roughly — 13 characters a second is a comfortable pace for
 * on-screen display type, floored so a two-word line still holds long enough
 * to register. Only used for silent videos and for beats the Director
 * deliberately leaves unnarrated.
 */
const silentFrames = (text, fps) =>
  Math.max(Math.round(fps * 1.6), Math.round(((text ?? "").length / 13) * fps));

const script = readJson(path.join(PITCHFRAME_DIR, "script.json"));
if (!script?.lines?.length) {
  process.stderr.write("no script.json with lines\n");
  process.exit(1);
}

const voice = readJson(path.join(WORK_DIR, "voice.json"), { lines: [] });
const direction = readJson(path.join(WORK_DIR, "direction.json"), {});
const spoken = new Map((voice.lines ?? []).filter((l) => l.file).map((l) => [l.id, l]));
const fps = script.fps ?? 30;

/**
 * A line whose clip failed has no duration, so there is nothing to cut to.
 * Falling back silently would produce a beat of invented length with audio
 * that never plays — the video would drift and nothing would say why.
 */
const missing = script.lines.filter(
  (l) => l.say && String(l.say).trim() && !spoken.has(l.id),
);
if (missing.length && voice.status !== "skipped") {
  log(`WARNING: ${missing.length} spoken line(s) have no audio: ${missing.map((l) => l.id).join(", ")}`);
  log("Those beats fall back to a reading-speed estimate and will not be in sync.");
}

let at = 0;
const beats = [];
const narration = [];

script.lines.forEach((line, index) => {
  const clip = spoken.get(line.id);
  const frames = clip
    ? clip.frames
    : silentFrames(line.show?.text ?? line.say ?? "", fps);

  const show = line.show ?? { type: "typography", text: line.say ?? "" };
  const beat = {
    id: index + 1,
    ...show,
    frames: [at, at + frames],
  };
  beats.push(beat);

  if (clip) {
    // Where the composition plays this clip. The beat starts exactly when the
    // clip does, so the offset is the beat's own start.
    narration.push({ file: clip.file, from: at, frames: clip.frames });
  }
  at += frames;
});

/**
 * Hero shot lengths are *weights*, not frame counts.
 *
 * The Director writes `shots` before a single word has been spoken, so it
 * cannot know how long the beat will be — the voice decides that, later. Left
 * alone, a three-shot hero written against a guessed 240 frames lands in a beat
 * the narration made 300 long, and the renderer's "last shot absorbs the
 * remainder" rule quietly stretches the final shot by 60 frames. The cut the
 * Director wrote is not the cut that plays.
 *
 * So the numbers are read as proportions and refitted. Rewrite a line, the beat
 * re-times, and the cuts inside it re-time with it — which is the whole point
 * of cutting to the voice.
 */
const MIN_SHOT = 12; // 0.4s. Below this a cut reads as a glitch, not an edit.
for (const b of beats) {
  if (!Array.isArray(b.shots) || b.shots.length === 0) continue;
  const len = b.frames[1] - b.frames[0];

  // A short beat cannot hold every shot. Dropping the tail is better than
  // emitting cuts too fast to register, or negative-length ones.
  const room = Math.max(1, Math.floor(len / MIN_SHOT));
  let shots = b.shots;
  if (shots.length > room) {
    log(`beat ${b.id}: ${len} frames only fits ${room} of ${shots.length} shots — dropping the rest`);
    shots = shots.slice(0, room);
  }

  const weights = shots.map((s) => Math.max(1, s.frames ?? 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let used = 0;
  b.shots = shots.map((s, i) => {
    // The last shot takes the rounding remainder, matching how the renderer
    // already treats it — so the arithmetic agrees at both ends.
    const frames =
      i === shots.length - 1
        ? len - used
        : Math.max(MIN_SHOT, Math.round((weights[i] / total) * len));
    used += frames;
    return { ...s, frames };
  });
}

/**
 * Consecutive beats sharing one recording get consecutive slices of it.
 *
 * One spoken line is one beat, but a hero take spans several lines. Without
 * this every one of those beats would replay the whole recording and the same
 * click would happen three times. Slices are proportional to beat length, so
 * the take runs continuously across the cuts at a constant speed.
 */
let run = [];
const flush = () => {
  if (run.length < 2) {
    run = [];
    return;
  }

  /**
   * An explicitly authored `segment` wins.
   *
   * Proportional slicing assumes every second of the take is worth showing,
   * and plenty of takes are not like that. A security scan that runs for
   * twenty-one seconds between the click and the result is one continuous
   * recording whose middle two-thirds is a spinner — slice it evenly across
   * four beats and most of the hero is dead air, which is exactly the footage
   * an editor would cut. When the Director has said which parts matter,
   * believe it.
   *
   * All-or-nothing per run: mixing authored and derived segments silently
   * produces overlaps or gaps, and that reads as a broken recording rather
   * than a broken plan.
   */
  if (run.some((b) => Array.isArray(b.segment))) {
    const missing = run.filter((b) => !Array.isArray(b.segment));
    if (missing.length) {
      log(
        `WARNING: recording "${run[0].recording}" has authored segments but beat(s) ` +
          `${missing.map((b) => b.id).join(", ")} have none — they replay the whole take`,
      );
    }
    log(`  ${run.length} beats share recording "${run[0].recording}" — authored segments kept`);
    run = [];
    return;
  }

  const total = run.reduce((sum, b) => sum + (b.frames[1] - b.frames[0]), 0);
  let at = 0;
  for (const b of run) {
    const len = b.frames[1] - b.frames[0];
    b.segment = [+(at / total).toFixed(4), +((at + len) / total).toFixed(4)];
    at += len;
  }
  log(`  ${run.length} beats share recording "${run[0].recording}" — sliced continuously`);
  run = [];
};
for (const b of beats) {
  const same = run.length && b.type === "interaction" && b.recording === run[0].recording;
  if (b.type === "interaction" && b.recording && (same || run.length === 0)) {
    run.push(b);
  } else {
    flush();
    if (b.type === "interaction" && b.recording) run.push(b);
  }
}
flush();

const plan = {
  video_thesis: script.thesis ?? "",
  hero_moment: script.hero_moment ?? "",
  structure: script.structure ?? "thesis",
  duration_seconds: +(at / fps).toFixed(2),
  fps,
  total_frames: at,
  music: script.music !== false,
  /**
   * Which track, by filename in public/audio/music/.
   *
   * The script may name one; if it does not, the art direction already chose
   * one against this product. Falling through rather than to `null` is the
   * point — a video going out silent because nobody filled in a field is not
   * an editorial decision, it is an omission.
   */
  music_file: script.music_file ?? direction.music ?? null,
  narration,
  beats,
};

fs.writeFileSync(path.join(PITCHFRAME_DIR, "plan.json"), JSON.stringify(plan, null, 2));

/* --------------------------------------------------------------- report */

let cursor = 0;
for (const b of beats) {
  if (b.frames[0] !== cursor) throw new Error(`gap before beat ${b.id}`);
  cursor = b.frames[1];
}
if (cursor !== at) throw new Error("beats do not cover the plan");

/**
 * The hero is every interaction beat, not the first one.
 *
 * Measuring a single beat made a six-beat hero report as 6% of runtime and
 * look like a failure — the check was written when one line meant one hero.
 */
const heroFrames = beats
  .filter((b) => b.type === "interaction")
  .reduce((sum, b) => sum + (b.frames[1] - b.frames[0]), 0);
log(`${beats.length} beats, ${at} frames (${(at / fps).toFixed(1)}s), cut to ${narration.length} voiced lines`);
if (heroFrames) {
  log(`hero ${((heroFrames / at) * 100).toFixed(0)}% of runtime across ${beats.filter((b) => b.type === "interaction").length} beats`);
}
if (at / fps < 55) {
  log(`NOTE: ${(at / fps).toFixed(0)}s — the brief asks for at least a minute; the Director needs more lines.`);
}
