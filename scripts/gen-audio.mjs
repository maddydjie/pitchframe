#!/usr/bin/env node
/**
 * Sound design, synthesized.
 *
 * A launch video is carried by its audio, and until now Pitchframe shipped
 * silence — `music: true` in the plan referenced an mp3 nobody had.
 *
 * The obvious fixes are both bad. A generative audio API means every user of
 * an `npx`-installed plugin needs an account and pays per render. A bundled
 * sample pack means megabytes in the repo, a licence to verify, and cues that
 * never quite line up with the edit.
 *
 * So the cues are generated here, from the plan, with nothing but Node. A
 * whoosh is filtered noise under an envelope; an impact is a pitch-swept sine
 * with a noise transient on top. That is the entire trick, and it buys three
 * things worth more than fidelity: no dependency, no licence question, and
 * cues landing on the exact frame the edit cuts — including the frame the
 * mouse actually went down, read back out of the recording track.
 *
 * Writes:
 *   public/audio/cues.wav   the sound effects, timed to the plan
 *   public/audio/bed.wav    a pad, ducked under the cues
 *
 * Drop an mp3 in public/audio/music.mp3 and the composition uses that instead
 * of the pad. The pad is a floor, not a ceiling.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(PROJECT, "public", "audio");
const ASSETS_DIR = path.join(PROJECT, "public", "assets");

const SR = 48_000;
const log = (msg) => process.stdout.write(`  ${msg}\n`);

/* ------------------------------------------------------------------- wav */

/** 16-bit stereo PCM. The header is 44 bytes and none of it is interesting. */
function writeWav(file, left, right) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);

  for (let i = 0; i < frames; i++) {
    // Clamped, not wrapped: a sample over 1.0 that wraps becomes a full-scale
    // click in the opposite direction, which is far more audible than the
    // clipping it came from.
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buffer.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return buffer.length;
}

/* ------------------------------------------------------------------- dsp */

/**
 * Deterministic noise.
 *
 * `Math.random()` would make every render of the same plan produce different
 * audio, which quietly breaks the ability to re-render a video and get the
 * same file. A seeded LCG costs nothing and makes the output reproducible.
 */
const makeNoise = (seed = 12345) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0x7fffffff) - 1;
  };
};

/** Two-pole state-variable filter. Cheap, stable, and it resonates. */
const svf = (cutoff, q = 1) => {
  let low = 0;
  let band = 0;
  const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SR / 2.5)) / SR);
  const damp = 1 / q;
  return (input) => {
    const high = input - low - damp * band;
    band += f * high;
    low += f * band;
    return { low, band, high };
  };
};

/** Exponential decay — the shape almost every percussive sound has. */
const decay = (t, tau) => Math.exp(-t / tau);

/** Raised-cosine fade, for anything that must not click at its edges. */
const fade = (t, len) =>
  t < len ? 0.5 - 0.5 * Math.cos((Math.PI * t) / len) : 1;

/* ---------------------------------------------------------------- voices */

/**
 * A whoosh: noise through a bandpass that sweeps up and back down.
 *
 * The sweep is what makes it read as movement rather than as static. Peaking
 * before the midpoint and falling faster than it rose gives it a direction —
 * it sounds like something passing, not something fading.
 */
function whoosh(duration, { gain = 0.3, seed = 7 } = {}) {
  const n = Math.round(duration * SR);
  const out = new Float32Array(n);
  const noise = makeNoise(seed);
  let filter = svf(400, 1.6);
  let lastCutoff = 400;

  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cutoff = 350 + Math.sin(Math.pow(t, 0.7) * Math.PI) * 3600;
    // Rebuilding the filter every sample would reset its state and destroy
    // the resonance; only rebuild when the cutoff has moved enough to matter.
    if (Math.abs(cutoff - lastCutoff) > 40) {
      filter = svf(cutoff, 1.6);
      lastCutoff = cutoff;
    }
    const env = Math.sin(Math.pow(t, 0.8) * Math.PI) ** 1.4;
    out[i] = filter(noise()).band * env * gain;
  }
  return out;
}

/**
 * An impact: sub, body and transient.
 *
 * The pitch sweep on the body is the whole sound — a fixed-frequency sine with
 * a decay is a beep, and the same sine falling an octave and a half in 120ms
 * is a hit. The noise transient only has to survive about 20ms; it is there to
 * give the attack an edge, not to be heard.
 */
function impact(duration, { gain = 0.5, root = 170, seed = 21 } = {}) {
  const n = Math.round(duration * SR);
  const out = new Float32Array(n);
  const noise = makeNoise(seed);
  const hp = svf(2600, 0.8);
  let phase = 0;
  let subPhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const freq = root * Math.pow(0.34, Math.min(1, t / 0.13) ** 0.6);
    phase += (2 * Math.PI * freq) / SR;
    subPhase += (2 * Math.PI * 52) / SR;

    const body = Math.sin(phase) * decay(t, 0.16);
    const sub = Math.sin(subPhase) * decay(t, 0.28) * 0.7;
    const tick = hp(noise()).high * decay(t, 0.012) * 0.5;

    // Soft clip. A little saturation on the peak makes it sound like it hit
    // something rather than like a sine wave with an envelope on it.
    out[i] = Math.tanh((body + sub + tick) * 1.6) * gain;
  }
  return out;
}

/**
 * A riser: bandpassed noise climbing, plus a tone climbing with it.
 *
 * Only ever used ahead of a hard cut. Its job is to make the cut feel
 * inevitable — which means it has to end *exactly* on the cut, so this is
 * placed backwards from the target frame rather than forwards from anything.
 */
function riser(duration, { gain = 0.22, seed = 33 } = {}) {
  const n = Math.round(duration * SR);
  const out = new Float32Array(n);
  const noise = makeNoise(seed);
  let filter = svf(300, 3);
  let lastCutoff = 300;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cutoff = 300 + Math.pow(t, 2.2) * 5200;
    if (Math.abs(cutoff - lastCutoff) > 40) {
      filter = svf(cutoff, 3);
      lastCutoff = cutoff;
    }
    phase += (2 * Math.PI * (220 + Math.pow(t, 2.4) * 900)) / SR;
    const env = Math.pow(t, 1.8);
    out[i] = (filter(noise()).band * 0.8 + Math.sin(phase) * 0.25) * env * gain;
  }
  return out;
}

/** A click: one filtered tick. Short enough that its shape barely matters. */
function click(duration = 0.05, { gain = 0.24, seed = 5 } = {}) {
  const n = Math.round(duration * SR);
  const out = new Float32Array(n);
  const noise = makeNoise(seed);
  const bp = svf(2200, 2.2);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = bp(noise()).band * decay(t, 0.008) * gain;
  }
  return out;
}

/**
 * The bed: three detuned saws and a fifth, under a slowly opening filter.
 *
 * Deliberately plain. A bed that is interesting competes with the video, and
 * at the level this sits at (about -22dB) what carries is the filter movement,
 * not the notes. Minor third, because a launch wants weight rather than
 * cheerfulness.
 */
function pad(duration, { gain = 0.13, root = 110 } = {}) {
  const n = Math.round(duration * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Root, minor third, fifth, octave. Each voice detuned a few cents from its
  // partner and panned apart, which is the whole width of the sound.
  const voices = [
    { f: root, detune: 1.0, pan: -0.6 },
    { f: root * 1.19, detune: 1.004, pan: 0.5 },
    { f: root * 1.5, detune: 0.997, pan: 0.35 },
    { f: root * 2, detune: 1.002, pan: -0.3 },
  ];
  const phases = voices.map(() => 0);
  const phasesB = voices.map(() => 0);

  let filterL = svf(300, 0.9);
  let filterR = svf(300, 0.9);
  let lastCutoff = 300;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // One slow open-and-close across the whole piece, plus a gentle wobble.
    const cutoff =
      420 +
      Math.sin((t / Math.max(1, duration)) * Math.PI) * 700 +
      Math.sin(t * 0.7) * 90;
    if (Math.abs(cutoff - lastCutoff) > 25) {
      filterL = svf(cutoff, 0.9);
      filterR = svf(cutoff, 0.9);
      lastCutoff = cutoff;
    }

    let l = 0;
    let r = 0;
    voices.forEach((voice, v) => {
      phases[v] += (2 * Math.PI * voice.f) / SR;
      phasesB[v] += (2 * Math.PI * voice.f * voice.detune) / SR;
      // Saw by phase wrapping, softened — a raw saw is too bright to sit under
      // dialogue-free video without fatiguing.
      const saw = (x) => {
        const p = (x / (2 * Math.PI)) % 1;
        return (p - 0.5) * 2;
      };
      const s = (saw(phases[v]) + saw(phasesB[v])) * 0.5;
      l += s * (1 - Math.max(0, voice.pan));
      r += s * (1 + Math.min(0, voice.pan));
    });

    const env = fade(t, 1.6) * fade(duration - t, 2.2);
    left[i] = filterL(l / voices.length).low * gain * env;
    right[i] = filterR(r / voices.length).low * gain * env;
  }
  return { left, right };
}

/* ------------------------------------------------------------------- mix */

const mixInto = (target, source, offset, gain = 1) => {
  const start = Math.max(0, Math.round(offset));
  for (let i = 0; i < source.length; i++) {
    const at = start + i;
    if (at >= target.length) break;
    target[at] += source[i] * gain;
  }
};

/**
 * Ducks the bed under each cue.
 *
 * Without this the pad and the impacts fight for the same low frequencies and
 * the hit loses. Sidechain compression is how every piece of music with a kick
 * drum in it solves this; here it can be done exactly, because the cue times
 * are known rather than detected.
 */
function duck(channel, cueFrames, fps, { depth = 0.55, attack = 0.01, release = 0.42 }) {
  for (const frame of cueFrames) {
    const at = Math.round((frame / fps) * SR);
    const attackSamples = Math.round(attack * SR);
    const releaseSamples = Math.round(release * SR);
    for (let i = -attackSamples; i < releaseSamples; i++) {
      const index = at + i;
      if (index < 0 || index >= channel.length) continue;
      const amount =
        i < 0 ? (1 + i / attackSamples) : 1 - i / releaseSamples;
      channel[index] *= 1 - depth * Math.max(0, amount);
    }
  }
}

/* ------------------------------------------------------------------ plan */

const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

/**
 * Where the sound lands.
 *
 * Derived from the plan rather than authored, which is the point: re-time a
 * beat and the audio follows, with no second file to keep in sync.
 */
function cuesFor(plan) {
  const fps = plan.fps ?? 30;
  const cues = [];

  plan.beats.forEach((beat, index) => {
    const [start] = beat.frames;
    const isFirst = index === 0;

    if (beat.type === "logo") {
      // The mark is the one place a hard hit is always right, and the riser
      // has to *end* on it, so it starts 26 frames earlier.
      cues.push({ at: Math.max(0, start - 26), kind: "riser", length: 26 / fps });
      cues.push({ at: start, kind: "impact", gain: 0.55 });
    } else if (beat.type === "cta") {
      cues.push({ at: start, kind: "impact", gain: 0.3, root: 130 });
    } else if (beat.type === "interaction") {
      cues.push({ at: start, kind: "whoosh", gain: 0.22 });

      /**
       * The click, on the frame the mouse actually went down.
       *
       * Read out of the recording track and mapped through the same fit the
       * playback uses. A click sound half a beat away from the visible press
       * is worse than no click sound — it reads as the video being out of
       * sync rather than as a missing effect.
       */
      const track = beat.recording
        ? readJson(path.join(ASSETS_DIR, `${beat.recording}.track.json`))
        : null;
      const beatLength = beat.frames[1] - beat.frames[0];
      if (track?.events?.length && track.frame_count > 1) {
        for (const event of track.events) {
          if (event.type !== "down") continue;
          const local = (event.frame / (track.frame_count - 1)) * (beatLength - 1);
          cues.push({ at: start + local, kind: "click" });
        }
      }
    } else if (!isFirst) {
      cues.push({ at: start, kind: "whoosh", gain: 0.16 });
    }

    if (beat.transition === "flash" && beat.type !== "logo") {
      cues.push({ at: start, kind: "impact", gain: 0.4 });
    }
  });

  return { cues, fps };
}

/* ------------------------------------------------------------------ main */

function main() {
  const plan = readJson(path.join(PROJECT, "plan.json"));
  if (!plan?.beats?.length) {
    log("No plan.json with beats — nothing to score.");
    process.exit(0);
  }

  const { cues, fps } = cuesFor(plan);
  // A little tail so the last impact is not cut off mid-decay.
  const seconds = plan.total_frames / fps + 1.2;
  const n = Math.round(seconds * SR);

  const cueL = new Float32Array(n);
  const cueR = new Float32Array(n);

  for (const cue of cues) {
    const at = (cue.at / fps) * SR;
    let sound;
    switch (cue.kind) {
      case "whoosh":
        sound = whoosh(0.62, { gain: cue.gain ?? 0.26, seed: 7 + Math.round(cue.at) });
        break;
      case "impact":
        sound = impact(0.85, { gain: cue.gain ?? 0.5, root: cue.root ?? 170 });
        break;
      case "riser":
        sound = riser(cue.length ?? 0.9, { gain: 0.22 });
        break;
      case "click":
        sound = click(0.05, { gain: 0.22 });
        break;
      default:
        continue;
    }
    // Cues sit slightly wide of centre, alternating, so successive hits do not
    // stack in the same place. Impacts stay centred — low end belongs in the
    // middle or it loses power on anything but headphones.
    const spread = cue.kind === "impact" ? 0 : 0.12;
    mixInto(cueL, sound, at, 1 - spread);
    mixInto(cueR, sound, at, 1 + spread);
  }

  const cueBytes = writeWav(path.join(AUDIO_DIR, "cues.wav"), cueL, cueR);
  log(`cues.wav — ${cues.length} cues, ${(cueBytes / 1e6).toFixed(1)}MB`);

  const bed = pad(seconds, { gain: 0.13 });
  const impactFrames = cues.filter((c) => c.kind === "impact").map((c) => c.at);
  duck(bed.left, impactFrames, fps, {});
  duck(bed.right, impactFrames, fps, {});
  const bedBytes = writeWav(path.join(AUDIO_DIR, "bed.wav"), bed.left, bed.right);
  log(`bed.wav  — ${seconds.toFixed(1)}s, ducked under ${impactFrames.length} impacts, ${(bedBytes / 1e6).toFixed(1)}MB`);

  const breakdown = cues.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, {});
  log(`cue breakdown: ${JSON.stringify(breakdown)}`);

  /**
   * A real track, if one was dropped in, wins over the pad.
   *
   * The pad exists so the video is never silent, not because a synthesized bed
   * beats a composed one. It cannot be ducked under the cues — that would mean
   * decoding mp3 — so the cue levels are set low enough to sit over a mix.
   */
  /**
   * A real track beats the synthesized pad, and the plan chooses which.
   *
   * Tracks live in public/audio/music/. The plan names one because the choice
   * is editorial — a launch and a teaser want different music, and that is a
   * decision for the Director, not for whichever file sorts first.
   */
  const musicDir = path.join(AUDIO_DIR, "music");
  const available = fs.existsSync(musicDir)
    ? fs.readdirSync(musicDir).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f))
    : [];
  const wanted = plan.music_file ?? null;

  /**
   * If tracks exist, one of them plays. Always.
   *
   * This used to depend on the Director naming a file, and a Director that
   * simply forgot produced a video scored with the synthesized pad while three
   * real tracks sat unused in the folder. "Editorial choice" is a good reason
   * for *which* track; it is not a reason for silence when the choice is
   * missing. So a missing or unresolvable name now falls through to a real
   * track rather than to the pad.
   *
   * The fallback is index-based rather than alphabetical so two products do
   * not both get whatever sorts first — the same anti-sameness rule the art
   * direction follows, applied to sound.
   */
  const pickFallback = () => {
    if (!available.length) return null;
    const seed = [...String(plan.video_thesis ?? "")].reduce(
      (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0,
      7,
    );
    return `music/${available[seed % available.length]}`;
  };

  const music =
    (wanted && available.includes(wanted) ? `music/${wanted}` : null) ??
    (["music.mp3", "music.m4a", "music.wav"].find((f) =>
      fs.existsSync(path.join(AUDIO_DIR, f)),
    ) ?? null) ??
    pickFallback();

  if (available.length) log(`music available: ${available.join(", ")}`);
  if (wanted && !available.includes(wanted)) {
    log(`plan asked for "${wanted}" which is not in public/audio/music — falling back`);
  }
  if (music) {
    log(`using ${music}${wanted ? "" : " (no track named in the plan — chose one)"}`);
  } else if (!available.length) {
    log("no tracks in public/audio/music — scoring with the synthesized bed");
  }

  /**
   * The manifest is what the composition reads. Without it the composition
   * would have to assume these files exist, and a render on a fresh clone —
   * before this script has ever run — would fail on a missing asset instead
   * of simply being silent.
   *
   * `vo` extends that same guarantee to the narration, which used to bypass
   * the manifest entirely: plan.json is committed carrying narration entries,
   * public/audio/vo/ is gitignored, so `remotion render` on a fresh clone died
   * on a 404 for vo/l1.wav rather than rendering silent. The rule was already
   * written three lines above this one; it just had not been applied to the
   * one audio path that is generated per run *and* referenced from a
   * committed file.
   */
  const voDir = path.join(AUDIO_DIR, "vo");
  const vo = fs.existsSync(voDir)
    ? fs
        .readdirSync(voDir)
        .filter((f) => /\.(wav|mp3)$/i.test(f))
        .map((f) => `vo/${f}`)
        .sort()
    : [];

  fs.writeFileSync(
    path.join(AUDIO_DIR, "audio.json"),
    JSON.stringify({ cues: true, bed: !music, music, cue_count: cues.length, vo }, null, 2),
  );
  if (!vo.length) log("no voice-over clips on disk — the video renders without narration");
}

main();
