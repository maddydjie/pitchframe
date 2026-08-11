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
  regionStats,
  frameDelta,
  samplePositions,
} from "./frames.mjs";

export const framesToTimestamps = (frames, fps) => frames.map((f) => (f / fps).toFixed(3));

/**
 * @returns {{bin: string, pre: string[]} | null}
 */
export const ffmpegBinary = (project = process.cwd()) => {
  // A full build first. Remotion's bundled ffmpeg is compiled with
  // --disable-filters and a short allowlist that has `scale` but not `select`,
  // so it can convert a still and cannot pick one out of a video. It stays as
  // the fallback because it is always present in an installed project, and
  // everything below is written to need no filter beyond scale.
  const system = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (system.status === 0) return { bin: "ffmpeg", pre: [] };

  const bundled = path.join(project, "node_modules", ".bin", "remotion");
  if (fs.existsSync(bundled)) return { bin: bundled, pre: ["ffmpeg"] };

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
/**
 * Local contrast below this means the region is empty rather than soft, and
 * its sharpness is not a question that can be answered. Set well under the
 * ~1400 a real UI region carries and well over the ~10 of a flat gradient.
 */
const CONTENT_VARIANCE = 150;

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
    /*
     * Only judge sharpness where there is something to be sharp.
     *
     * An empty region has no high-frequency detail whether or not it is in
     * focus, so detail alone cannot tell "blurred" from "nothing here". The
     * first version compared centre detail against whole-frame contrast and
     * flagged seven frames of a correct hero whose middle was an empty stretch
     * of chart — a false failure on good work, which is the one finding that
     * teaches a founder to stop reading the findings.
     *
     * Requiring local contrast first means blurred *content* still trips it
     * (blur keeps large-scale variance and destroys detail) while empty space
     * is skipped.
     */
    const judgeable =
      m.centreVariance >= CONTENT_VARIANCE && m.edgeVariance >= CONTENT_VARIANCE;

    if (judgeable && m.edgeEnergy > 0 && m.centreEnergy / m.edgeEnergy < BLUR_RATIO) {
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
 * Every wanted frame, pulled out by exact frame number.
 *
 * Seeking with `-ss` *before* `-i` is the fast way and the wrong one: it snaps
 * to the nearest keyframe, and half the sampled positions sit one frame either
 * side of a cut, so a seek landing on the wrong side reports the next beat's
 * opening frame as this beat's closing one. Verified against a synthetic clip,
 * that turned the last frame of a detailed pattern into a "blank frame"
 * finding — a false failure on a correct video, which is the single kind of
 * finding that would teach a founder to ignore the checker.
 *
 * `-ss` *after* `-i` is output seeking: ffmpeg decodes and discards up to the
 * timestamp, so the frame is exact. It needs no filter, which matters because
 * the fallback ffmpeg has almost none compiled in.
 */
export const extractFrames = (mp4, positions, fps, outDir, project) => {
  const ff = ffmpegBinary(project);
  if (!ff) return null;
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  const failures = [];

  for (const p of positions) {
    const png = path.join(outDir, `f${String(p.frame).padStart(5, "0")}.png`);
    /*
     * Aim half a frame *before* the wanted frame's start.
     *
     * Output seeking returns the first frame at or after the timestamp, so
     * aiming at the frame's own midpoint overshoots by one — verified: frame
     * 89 of a pattern that ends at 89 came back as the black frame 90, which
     * is the same off-by-one-at-a-cut error arriving from the opposite side.
     * Half a frame early is unambiguous at any fps and cannot underflow into
     * the previous frame.
     */
    const target = Math.max(0, (p.frame - 0.5) / fps);

    /*
     * Fast seek to shortly before the target, then decode the rest exactly.
     *
     * Pure output seeking is exact but decodes from the start of the file for
     * every frame: on a 53-second render that made inspection take longer than
     * the render itself. Input seeking alone is fast and lands on a keyframe,
     * which is the off-by-one this whole function exists to avoid. Doing both —
     * `-ss` before `-i` to get near, `-ss` after `-i` for the remainder —
     * bounds the decode to PREROLL seconds and keeps the frame exact.
     */
    const PREROLL = 2;
    const coarse = Math.max(0, target - PREROLL);
    const fine = target - coarse;

    const args = [...ff.pre, "-y"];
    if (coarse > 0) args.push("-ss", coarse.toFixed(4));
    args.push("-i", mp4, "-ss", fine.toFixed(4), "-frames:v", "1", png);

    const res = spawnSync(ff.bin, args, { encoding: "utf8" });
    if (res.status === 0 && fs.existsSync(png)) written.push({ ...p, png });
    else failures.push(`${p.frame}: ${(res.stderr || "").trim().split("\n").pop() ?? "no output"}`);
  }

  if (!written.length && positions.length) {
    throw new Error(`frame extraction failed: ${failures.slice(0, 2).join(" / ")}`);
  }
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

  let stills;
  try {
    stills = extractFrames(mp4, positions, plan.fps, outDir, project) ?? [];
  } catch (err) {
    return {
      measured: [],
      findings: [
        {
          check: "frames",
          severity: "fail",
          message: `frame measurement could not run: ${err.message}`,
          target: "environment",
        },
      ],
    };
  }

  /*
   * Measuring nothing is not the same as finding nothing.
   *
   * The first version of this returned an empty findings array when extraction
   * produced no stills, so `inspect` printed "no findings" over a render it
   * had never looked at — a silent pass, which is the exact failure the whole
   * inspection step exists to abolish. A check that cannot run has to say so
   * as loudly as a check that fails.
   */
  if (positions.length && !stills.length) {
    return {
      measured: [],
      findings: [
        {
          check: "frames",
          severity: "fail",
          message: `wanted ${positions.length} frames from the render and got none — the frame half did not run, so nothing here has been looked at`,
          target: "environment",
        },
      ],
    };
  }

  const measured = [];
  const decoded = new Map();
  for (const s of stills) {
    const img = decodeGray(s.png, project);
    if (!img) continue;
    decoded.set(s.frame, img);
    const { variance, mean } = luminanceStats(img.gray, img.w, img.h);
    const centre = regionStats(img.gray, img.w, img.h, {
      x: Math.round(img.w * 0.3),
      y: Math.round(img.h * 0.3),
      w: Math.round(img.w * 0.4),
      h: Math.round(img.h * 0.4),
    });
    const whole = regionStats(img.gray, img.w, img.h, { x: 0, y: 0, w: img.w, h: img.h });

    measured.push({
      frame: s.frame,
      why: s.why,
      variance,
      mean,
      centreEnergy: centre.energy,
      centreVariance: centre.variance,
      edgeEnergy: whole.energy,
      edgeVariance: whole.variance,
    });
  }

  const before = positions.find((p) => p.why === "hero: before the action");
  const after = positions.find((p) => p.why === "hero: after the action");
  const a = before && decoded.get(before.frame);
  const b = after && decoded.get(after.frame);
  const heroDelta = a && b ? frameDelta(a.gray, b.gray) : undefined;

  return { measured, findings: gradeFrameFindings(measured, { heroDelta }) };
};
