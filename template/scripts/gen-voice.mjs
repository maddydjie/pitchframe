#!/usr/bin/env node
/**
 * Voice-over, and the timing spine of the whole video.
 *
 * This runs *before* the picture is planned, and that order is the point.
 * You cannot control how long a spoken line takes — you write it, the model
 * renders it, and it lasts what it lasts. Build the picture first and the
 * voice either overruns its beat or leaves dead air, and the error compounds
 * across a minute.
 *
 * So: script → one clip per line → measure each → the measured durations set
 * the beat lengths → render picture to audio. The editing term is a radio cut.
 *
 * **One clip per line, never one clip for the whole video.** A single file
 * would need word-level alignment to find the boundaries; separate files make
 * each boundary exact by construction, and a line rewritten by the judge is
 * just one clip regenerated.
 *
 * Maya returns raw PCM — 16-bit LE, mono, 24kHz — so duration is
 * `bytes / (24000 * 2)` exactly. No parsing, no ffprobe, and nothing here has
 * to *listen* to the audio to sync it. Sync is arithmetic.
 *
 *   MAYA_API_KEY=... node scripts/gen-voice.mjs
 *
 * Reads script.json, writes public/audio/vo/<id>.wav and .work/voice.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, require_ as requireKey } from "./lib/env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");
const VO_DIR = path.join(PITCHFRAME_DIR, "public", "audio", "vo");

const ENDPOINT = "https://tts.mayaresearch.ai/v1/tts";
/** Maya's output format. Duration depends on these, so they are not guesses. */
const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;

/**
 * A beat of room either side of each line.
 *
 * Lines butted end to end sound like a list being read. The silence is baked
 * into the clip rather than added in the composition so that one number — the
 * clip's duration — remains the whole truth about how long the beat needs.
 */
const LEAD_MS = 180;
const TAIL_MS = 320;

const log = (msg) => process.stdout.write(`  ${msg}\n`);

const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

const write = (result) => {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, "voice.json"), JSON.stringify(result, null, 2));
};

/* ------------------------------------------------------------------- wav */

/** 16-bit mono PCM into a WAV container. The header is 44 bytes of boredom. */
const toWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const silence = (ms) =>
  Buffer.alloc(Math.round((ms / 1000) * SAMPLE_RATE) * BYTES_PER_SAMPLE);

/* ------------------------------------------------------------------- api */

/**
 * One line. Retried, because a launch video should not fail on one flaky
 * request — but the caller still has to handle a null, since a missing line
 * changes the edit rather than merely degrading it.
 */
async function speak(key, text, voice, language, attempt = 1) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voice, language }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`HTTP ${res.status} ${detail}`);
    }

    const type = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());

    // A JSON body here means an error dressed as a 200, which some gateways do.
    if (type.includes("json")) {
      throw new Error(`expected audio, got JSON: ${buffer.toString("utf8").slice(0, 200)}`);
    }
    // Under ~0.05s of audio is not speech; treat it as a failed generation
    // rather than writing a clip that silently shortens a beat.
    if (buffer.length < SAMPLE_RATE * BYTES_PER_SAMPLE * 0.05) {
      throw new Error(`suspiciously short response (${buffer.length} bytes)`);
    }
    return buffer;
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 1200));
      return speak(key, text, voice, language, attempt + 1);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ main */

async function main() {
  /**
   * The key comes from the environment or `pitchframe/.env`, never from the
   * repo or a plan file. It is a live credential and this project is meant to
   * be pushed publicly.
   *
   * **A missing key stops the run.** It used to skip with a one-line notice,
   * and the result was four consecutive silent videos whose beats were timed
   * by a reading-speed guess — the exact failure the audio-first design exists
   * to prevent, arriving quietly. Silence has to be asked for now.
   */
  const silentOk = process.argv.includes("--allow-silent");
  const key = silentOk ? (loadEnv(), process.env.MAYA_API_KEY) : requireKey("MAYA_API_KEY", {
    hint:
      "Get one at https://mayaresearch.ai. To render deliberately without a\n" +
      "voice-over, re-run with --allow-silent (beats then fall back to\n" +
      "reading-speed estimates and nothing is synced to anything).",
  });

  if (!key) {
    log("MAYA_API_KEY not set and --allow-silent given — no voice-over.");
    write({ status: "skipped", reason: "no MAYA_API_KEY, --allow-silent" });
    return;
  }

  const script = readJson(path.join(PITCHFRAME_DIR, "script.json"));
  if (!script?.lines?.length) {
    log("No script.json with lines — nothing to voice.");
    write({ status: "skipped", reason: "no script" });
    return;
  }

  const voice = script.voice?.name ?? "Ananya";
  const language = script.voice?.language ?? "en";
  const spoken = script.lines.filter((l) => l.say && String(l.say).trim());

  if (spoken.length === 0) {
    log("Script has no spoken lines — silent video.");
    write({ status: "ok", voice, language, lines: [], total_seconds: 0 });
    return;
  }

  fs.rmSync(VO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VO_DIR, { recursive: true });

  const lines = [];
  let total = 0;

  for (const line of spoken) {
    try {
      const pcm = await speak(key, String(line.say).trim(), voice, language);
      const padded = Buffer.concat([silence(LEAD_MS), pcm, silence(TAIL_MS)]);
      const file = `${line.id}.wav`;
      fs.writeFileSync(path.join(VO_DIR, file), toWav(padded));

      // Exact, because the format is known. This number is what the picture
      // is cut to.
      const seconds = padded.length / (SAMPLE_RATE * BYTES_PER_SAMPLE);
      const frames = Math.ceil(seconds * (script.fps ?? 30));

      lines.push({
        id: line.id,
        file: `vo/${file}`,
        say: line.say,
        seconds: +seconds.toFixed(3),
        frames,
        speech_seconds: +(pcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)).toFixed(3),
      });
      total += seconds;
      log(`${line.id}: ${seconds.toFixed(2)}s — "${String(line.say).slice(0, 52)}"`);
    } catch (err) {
      lines.push({ id: line.id, file: null, say: line.say, error: String(err?.message ?? err) });
      log(`${line.id}: FAILED — ${err?.message ?? err}`);
    }
  }

  const ok = lines.filter((l) => l.file).length;
  write({
    status: ok === lines.length ? "ok" : ok > 0 ? "partial" : "failed",
    voice,
    language,
    sample_rate: SAMPLE_RATE,
    total_seconds: +total.toFixed(2),
    total_frames: Math.ceil(total * (script.fps ?? 30)),
    lines,
  });

  log(`${ok}/${lines.length} lines voiced — ${total.toFixed(1)}s of narration.`);
  if (ok < lines.length) {
    log("A failed line has no duration, so the picture cannot be cut to it — fix before planning.");
  }
}

main().catch((err) => {
  write({ status: "failed", reason: String(err?.stack ?? err) });
  process.exit(0);
});
