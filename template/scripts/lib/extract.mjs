/**
 * Pulls stills out of the finished MP4 and grades them.
 *
 * Extraction prefers the ffmpeg Remotion already ships and falls back to one
 * on PATH: an optional dependency that is usually missing is a check that
 * usually does not run, and this project has already learned that an opt-in
 * feature which degrades silently is a feature that never runs. When neither
 * exists the caller gets a `warn` finding saying so, never silence.
 *
 * Resolution is by file existence, never by `npx`. `npx remotion ffmpeg` costs
 * a registry round trip on a machine where the package is not installed, and a
 * check that reaches the network to decide whether it can run is a check that
 * fails offline for reasons nobody will connect to video quality.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  luminanceStats,
  laplacianEnergy,
  frameDelta,
  samplePositions,
} from "./frames.mjs";

export const framesToTimestamps = (frames, fps) => frames.map((f) => (f / fps).toFixed(3));

/**
 * @returns {{bin: string, pre: string[]} | null}
 */
export const ffmpegBinary = (project = process.cwd()) => {
  const bundled = path.join(project, "node_modules", ".bin", "remotion");
  if (fs.existsSync(bundled)) return { bin: bundled, pre: ["ffmpeg"] };

  const system = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (system.status === 0) return { bin: "ffmpeg", pre: [] };

  return null;
};

/**
 * Thresholds.
 *
 * `BLANK_VARIANCE` is deliberately not a file-size test: a solid-black
 * 3840×2160 PNG compresses to about 29KB, so size cannot detect a blank
 * screen. capture.mjs measures variance for the same reason.
 *
 * `HERO_DELTA` is in mean absolute 8-bit luminance. A dissolve between two
 * identical screenshots reads as the product doing nothing, which is worse
 * than having no hero beat at all — so the floor is low but not zero, to
 * tolerate compression noise.
 */
const BLANK_VARIANCE = 25;
const HERO_DELTA = 2;
/** The subject may be softer than its surroundings, but not by 4×. */
const BLUR_RATIO = 0.25;

export const gradeFrameFindings = (measured, { heroDelta } = {}) => {
  const out = [];

  for (const m of measured) {
    if (m.variance < BLANK_VARIANCE) {
      out.push({
        check: "blank_frame",
        severity: "fail",
        message: `frame ${m.frame} (${m.why}) is blank — luminance variance ${m.variance.toFixed(1)}`,
        target: `frame ${m.frame}`,
      });
      continue;
    }
    if (m.edgeEnergy > 0 && m.centreEnergy / m.edgeEnergy < BLUR_RATIO) {
      out.push({
        check: "subject_blur",
        severity: "fail",
        message: `frame ${m.frame} (${m.why}) has its subject blurrier than its periphery — the depth of field is aimed away from what the shot is framing`,
        target: `frame ${m.frame}`,
      });
    }
  }

  if (typeof heroDelta === "number" && heroDelta < HERO_DELTA) {
    out.push({
      check: "hero_static",
      severity: "fail",
      message: `the hero's before and after frames differ by ${heroDelta.toFixed(2)} — the product appears to have done nothing`,
      target: "beats[].recording",
    });
  }

  return out;
};

/**
 * Every wanted frame, in one decode, selected by exact frame number.
 *
 * The obvious implementation — one `-ss <timestamp>` seek per frame — is
 * wrong here, and wrong in the way that matters most. Seeking before `-i`
 * snaps to the nearest keyframe, and half the sampled positions are one frame
 * either side of a cut: a seek that lands on the wrong side of the cut reports
 * the *next* beat's opening frame as this beat's closing one. Verified against
 * a synthetic clip, that turned the last frame of a detailed pattern into a
 * "blank frame" finding — a false failure on a correct video, which is the one
 * kind of finding that would teach a founder to ignore the checker.
 *
 * `select=eq(n,N)` is exact, and doing it in a single pass decodes the file
 * once instead of once per sample.
 */
export const extractFrames = (mp4, positions, fps, outDir, project) => {
  const ff = ffmpegBinary(project);
  if (!ff) return null;
  fs.mkdirSync(outDir, { recursive: true });

  const wanted = positions.map((p) => p.frame);
  const expr = wanted.map((n) => `eq(n\\,${n})`).join("+");
  const pattern = path.join(outDir, "sel%04d.png");

  const res = spawnSync(
    ff.bin,
    [...ff.pre, "-y", "-i", mp4, "-vf", `select='${expr}'`, "-vsync", "0", pattern],
    { stdio: "ignore" },
  );
  if (res.status !== 0) return [];

  // ffmpeg numbers the selected frames 1..n in presentation order, which is
  // the order `positions` is already sorted in.
  const written = [];
  positions.forEach((p, i) => {
    const from = path.join(outDir, `sel${String(i + 1).padStart(4, "0")}.png`);
    if (!fs.existsSync(from)) return;
    const to = path.join(outDir, `f${String(p.frame).padStart(5, "0")}.png`);
    fs.renameSync(from, to);
    written.push({ ...p, png: to });
  });
  return written;
};

/**
 * Grayscale bytes, straight out of ffmpeg.
 *
 * Decoding PNG in-process would mean a dependency; asking ffmpeg for `gray`
 * rawvideo means the pixels arrive as exactly the Uint8Array the measurement
 * functions want, with no image-format handling anywhere in this repo.
 */
export const decodeGray = (imagePath, project, w = 480) => {
  const ff = ffmpegBinary(project);
  if (!ff) return null;
  const h = Math.round((w * 9) / 16);
  const res = spawnSync(
    ff.bin,
    [
      ...ff.pre,
      "-y",
      "-i",
      imagePath,
      "-vf",
      `scale=${w}:${h}`,
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: w * h * 8 },
  );
  if (res.status !== 0 || !res.stdout?.length) return null;
  return { gray: new Uint8Array(res.stdout), w, h };
};

export const measureFrames = (plan, mp4, outDir, project) => {
  if (!fs.existsSync(mp4)) {
    return {
      measured: [],
      findings: [
        {
          check: "frames",
          severity: "warn",
          message: `no ${path.basename(mp4)} to inspect — render first`,
          target: "output.mp4",
        },
      ],
    };
  }
  if (!ffmpegBinary(project)) {
    return {
      measured: [],
      findings: [
        {
          check: "frames",
          severity: "warn",
          message:
            "no ffmpeg available, so frame measurement was skipped — the static checks still ran",
          target: "environment",
        },
      ],
    };
  }

  const positions = samplePositions(plan);
  const stills = extractFrames(mp4, positions, plan.fps, outDir, project) ?? [];

  const measured = [];
  const decoded = new Map();
  for (const s of stills) {
    const img = decodeGray(s.png, project);
    if (!img) continue;
    decoded.set(s.frame, img);
    const { variance, mean } = luminanceStats(img.gray, img.w, img.h);
    const centre = {
      x: Math.round(img.w * 0.3),
      y: Math.round(img.h * 0.3),
      w: Math.round(img.w * 0.4),
      h: Math.round(img.h * 0.4),
    };
    const centreEnergy = laplacianEnergy(img.gray, img.w, img.h, centre);
    const edgeEnergy = laplacianEnergy(img.gray, img.w, img.h, {
      x: 0,
      y: 0,
      w: img.w,
      h: img.h,
    });
    measured.push({ frame: s.frame, why: s.why, variance, mean, centreEnergy, edgeEnergy });
  }

  const before = positions.find((p) => p.why === "hero: before the action");
  const after = positions.find((p) => p.why === "hero: after the action");
  const a = before && decoded.get(before.frame);
  const b = after && decoded.get(after.frame);
  const heroDelta = a && b ? frameDelta(a.gray, b.gray) : undefined;

  return { measured, findings: gradeFrameFindings(measured, { heroDelta }) };
};
