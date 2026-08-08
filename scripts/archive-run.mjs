#!/usr/bin/env node
/**
 * Files a finished run into `runs/<product>-<timestamp>/`.
 *
 * Two reasons, and the second is the one that matters.
 *
 * The obvious one: a run's script, plan, video and feedback belong together.
 * The working tree holds exactly one of each, so the next run overwrites all
 * of it, and comparing this video to the last one meant having kept a copy by
 * hand. Nobody ever had.
 *
 * The real one: `runs/` is the memory that makes variety possible.
 * `art-direction.mjs` reads every `direction.json` under `runs/` and refuses a look
 * it has already used. Without an archive there is no history, without history
 * there is no way to detect a repeat, and "make it different this time" stays
 * an instruction nothing can check. Archiving is not bookkeeping — it is the
 * input to the next run.
 *
 *   node scripts/archive-run.mjs
 *
 * Copies rather than moves: the working tree stays renderable.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runsDir } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");
const RUNS_DIR = runsDir(PITCHFRAME_DIR);

const log = (msg) => process.stdout.write(`  ${msg}\n`);
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

const script = readJson(path.join(PITCHFRAME_DIR, "script.json"), {});
const plan = readJson(path.join(PITCHFRAME_DIR, "plan.json"), {});
const direction = readJson(path.join(WORK_DIR, "direction.json"), {});
const voice = readJson(path.join(WORK_DIR, "voice.json"), {});

const slug = (direction.product ?? script.product ?? "product")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 32) || "product";

// Local time, sortable, no separators that need quoting in a shell.
const d = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const stamp =
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
  `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

const runDir = path.join(RUNS_DIR, `${slug}-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });

/* ------------------------------------------------------------- the copies */

/**
 * The video is looked for in both places because `remotion render` writes
 * wherever it was told to, and the two conventions in this repo are the
 * template root and `out/`.
 */
const VIDEO_CANDIDATES = [
  path.join(PITCHFRAME_DIR, "output.mp4"),
  path.join(PITCHFRAME_DIR, "out", "output.mp4"),
];

const copied = [];
const copy = (from, as) => {
  if (!from || !fs.existsSync(from)) return false;
  fs.copyFileSync(from, path.join(runDir, as));
  copied.push(as);
  return true;
};

copy(path.join(PITCHFRAME_DIR, "script.json"), "script.json");
copy(path.join(PITCHFRAME_DIR, "plan.json"), "plan.json");
copy(path.join(PITCHFRAME_DIR, "palette.json"), "palette.json");
copy(path.join(WORK_DIR, "direction.json"), "direction.json");
copy(path.join(WORK_DIR, "voice.json"), "voice.json");
copy(path.join(WORK_DIR, "director.md"), "director.md");
copy(path.join(WORK_DIR, "judgement.md"), "feedback.md");

const video = VIDEO_CANDIDATES.find((f) => fs.existsSync(f));
const hasVideo = copy(video, "video.mp4");

/**
 * Feedback is created empty rather than omitted when the judge has not run.
 *
 * A file that exists and says "not judged yet" is a prompt; a missing file is
 * invisible, and the judge step is the one most often skipped.
 */
if (!copied.includes("feedback.md")) {
  fs.writeFileSync(
    path.join(runDir, "feedback.md"),
    `# Feedback — ${direction.product ?? slug}\n\n` +
      `Not judged yet. Run \`/judge-user\` or \`/judge-vc\` after watching\n` +
      `\`video.mp4\`, and the verdict is written here.\n`,
  );
  copied.push("feedback.md");
}

/* ------------------------------------------------------------ the summary */

const secs = plan.total_frames && plan.fps ? (plan.total_frames / plan.fps).toFixed(1) : "?";
const voiced = (voice.lines ?? []).filter((l) => l.file).length;
const heroPct =
  plan.beats && plan.total_frames
    ? Math.round(
        (plan.beats
          .filter((b) => b.type === "interaction")
          .reduce((sum, b) => sum + (b.frames[1] - b.frames[0]), 0) /
          plan.total_frames) *
          100,
      )
    : null;

fs.writeFileSync(
  path.join(runDir, "run.md"),
  [
    `# ${direction.product ?? slug} — ${stamp}`,
    "",
    `**Thesis** ${script.thesis ?? plan.video_thesis ?? "—"}`,
    `**Hero** ${script.hero_moment ?? plan.hero_moment ?? "—"}`,
    "",
    "| | |",
    "|---|---|",
    `| Runtime | ${secs}s (${plan.total_frames ?? "?"} frames) |`,
    `| Hero share | ${heroPct === null ? "—" : `${heroPct}%`} |`,
    `| Beats | ${plan.beats?.length ?? "—"} |`,
    `| Voice | ${voice.status ?? "not run"}${voiced ? ` — ${voiced} clips` : ""} |`,
    `| Music | ${plan.music_file ?? (plan.music === false ? "none" : "bed")} |`,
    `| Video | ${hasVideo ? "video.mp4" : "**not rendered**"} |`,
    "",
    "## Look",
    "",
    "| | |",
    "|---|---|",
    `| Style | ${direction.style ?? "—"} |`,
    `| Structure | ${direction.structure ?? "—"} |`,
    `| Type | ${direction.type_layout ?? "—"}, accent ${direction.accent_style ?? "—"} |`,
    `| Hero grammar | ${direction.hero_progression?.join(" → ") ?? "—"} |`,
    `| Drawn | ${direction.drawn?.length ? direction.drawn.join(", ") : "none"} |`,
    `| 3D | ${direction.three_d ?? "none"} |`,
    `| Signature | \`${direction.signature ?? "—"}\` |`,
    "",
    "The signature is what the next run reads to avoid repeating this look.",
    "",
  ].join("\n"),
);

log(`archived to runs/${path.basename(runDir)}/`);
log(`  ${copied.join(", ")}, run.md`);
if (!hasVideo) log("  WARNING: no output.mp4 found — the run is filed without a video");
