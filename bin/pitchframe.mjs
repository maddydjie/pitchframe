#!/usr/bin/env node
/**
 * Pitchframe installer.
 *
 * `npx pitchframe install` does two things:
 *   1. scaffolds the reference Remotion project into ./pitchframe/
 *   2. installs the skills so Claude Code knows how to drive it
 *
 * After that the founder never runs this CLI again — they ask Claude Code for a
 * video in plain English. That is the whole design: the CLI is an installer, not
 * an orchestrator. The reasoning lives in the skills, in the session the founder
 * is already in.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const CWD = process.cwd();

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const command = argv.find((a) => !a.startsWith("--")) ?? "install";

const FORCE = flags.has("--force");
const GLOBAL = flags.has("--global");
const NO_INSTALL = flags.has("--no-install");

/* ------------------------------------------------------------------- ui */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const say = (s = "") => process.stdout.write(`${s}\n`);
const step = (s) => say(`${c.cyan("›")} ${s}`);
const ok = (s) => say(`${c.green("✓")} ${s}`);
const warn = (s) => say(`${c.yellow("!")} ${s}`);
const fail = (s) => say(`${c.red("✗")} ${s}`);

/* ---------------------------------------------------------------- files */

const SKIP_NAMES = new Set(["node_modules", "out", "output.mp4", ".DS_Store"]);

/**
 * Copies a tree, never clobbering the founder's work unless --force.
 *
 * Re-running the installer has to be safe: plan.json and palette.json are the
 * files the founder edits by hand, and silently resetting them would be the
 * worst possible surprise from a command called "install".
 */
const copyTree = (from, to, stats = { written: 0, skipped: 0 }, exclude = null) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue;
    if (exclude?.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);

    if (entry.isDirectory()) {
      copyTree(src, dest, stats);
      continue;
    }
    if (fs.existsSync(dest) && !FORCE) {
      stats.skipped++;
      continue;
    }
    fs.copyFileSync(src, dest);
    stats.written++;
  }
  return stats;
};

const findProjectRoot = () => {
  let dir = CWD;
  for (let i = 0; i < 8; i++) {
    const hasMarker = ["package.json", ".git"].some((m) =>
      fs.existsSync(path.join(dir, m)),
    );
    if (hasMarker) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return CWD;
};

/* -------------------------------------------------------------- install */

const install = () => {
  const root = findProjectRoot();
  const target = path.join(root, "pitchframe");
  const claudeDir = GLOBAL
    ? path.join(os.homedir(), ".claude")
    : path.join(root, ".claude");

  say();
  say(c.bold("  Pitchframe") + c.dim("  — launch video, from your codebase"));
  say();

  if (root !== CWD) {
    warn(`Installing at project root: ${c.dim(root)}`);
  }

  // 1. Reference Remotion project
  //
  // `scripts` is excluded deliberately. The template carries a copy of it so
  // the repo can be developed and rendered in place, but copying that copy
  // first would then make step 2 a no-op — copyTree skips files that already
  // exist — and the founder would silently get whichever version happened to
  // be in the template. `scripts/` at the package root is the only source.
  step("Scaffolding the reference Remotion project → ./pitchframe/");
  const tpl = copyTree(
    path.join(PKG_ROOT, "template"),
    target,
    undefined,
    new Set(["scripts"]),
  );

  // 2. Capture engine
  copyTree(path.join(PKG_ROOT, "scripts"), path.join(target, "scripts"), tpl);
  fs.mkdirSync(path.join(target, ".work"), { recursive: true });
  fs.mkdirSync(path.join(target, "public", "assets"), { recursive: true });
  ok(
    `${tpl.written} files written` +
      (tpl.skipped ? c.dim(`, ${tpl.skipped} left alone (use --force to overwrite)`) : ""),
  );

  // 3. Skills + command, so Claude Code knows the workflow
  step(`Installing skills → ${GLOBAL ? "~/.claude" : "./.claude"}`);
  const skills = copyTree(
    path.join(PKG_ROOT, "skills"),
    path.join(claudeDir, "skills"),
    { written: 0, skipped: 0 },
  );
  copyTree(
    path.join(PKG_ROOT, "commands"),
    path.join(claudeDir, "commands"),
    skills,
  );
  // Subagents carry the per-step model choice (Opus for the reasoning and
  // code-generation steps, Sonnet for tool orchestration). Without these the
  // whole pipeline runs on whatever model the session happens to be on.
  copyTree(
    path.join(PKG_ROOT, "agents"),
    path.join(claudeDir, "agents"),
    skills,
  );
  ok(`${skills.written} skill and agent files installed`);

  // 4. Dependencies
  if (NO_INSTALL) {
    warn("Skipped npm install (--no-install). Run it in ./pitchframe before rendering.");
  } else if (fs.existsSync(path.join(target, "node_modules"))) {
    ok("Dependencies already present");
  } else {
    step("Installing Remotion + Playwright (~60s, one time)");
    const res = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: target,
      stdio: "inherit",
      shell: true,
    });
    if (res.status !== 0) {
      fail("npm install failed. Run it yourself in ./pitchframe and try again.");
      process.exit(1);
    }
    ok("Dependencies installed");
  }

  say();
  say(c.bold("  Ready.") + " Open Claude Code in this project and ask:");
  say();
  say(c.green('    "make a launch video for this product"'));
  say();
  say(c.dim("  Or with a directive:"));
  say(c.dim('    /pitchframe focus on the collab feature, we\'re pitching enterprise'));
  say();
  say(c.dim("  First run takes 3–6 minutes. Output lands at ./pitchframe/output.mp4"));
  say();
};

/* --------------------------------------------------------------- doctor */

const doctor = () => {
  const root = findProjectRoot();
  const target = path.join(root, "pitchframe");
  say();
  say(c.bold("  Pitchframe doctor"));
  say();

  const checks = [
    [
      "Node.js 20+",
      Number(process.versions.node.split(".")[0]) >= 20,
      `found ${process.versions.node}`,
    ],
    ["Scaffold at ./pitchframe", fs.existsSync(path.join(target, "package.json")), "run: npx pitchframe install"],
    ["Dependencies installed", fs.existsSync(path.join(target, "node_modules")), "run: cd pitchframe && npm install"],
    ["Capture engine", fs.existsSync(path.join(target, "scripts", "capture.mjs")), "run: npx pitchframe install --force"],
    [
      "Skills available to Claude Code",
      fs.existsSync(path.join(root, ".claude", "skills", "pitchframe")) ||
        fs.existsSync(path.join(os.homedir(), ".claude", "skills", "pitchframe")),
      "run: npx pitchframe install",
    ],
    ["Project has a dev script", Boolean(readPkg(root)?.scripts?.dev), "UI capture will fall back to a public URL"],
    ["Chromium-based browser", Boolean(findBrowser()), "install Chrome, or set PITCHFRAME_BROWSER"],
  ];

  for (const [label, pass, hint] of checks) {
    say(pass ? `${c.green("✓")} ${label}` : `${c.yellow("!")} ${label} ${c.dim(`— ${hint}`)}`);
  }
  say();
};

const readPkg = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
};

const findBrowser = () => {
  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] ?? [];

  if (process.env.PITCHFRAME_BROWSER) return process.env.PITCHFRAME_BROWSER;
  return candidates.find((p) => fs.existsSync(p)) ?? null;
};

/* ----------------------------------------------------------- passthrough */

const runInProject = (args) => {
  const target = path.join(findProjectRoot(), "pitchframe");
  if (!fs.existsSync(path.join(target, "package.json"))) {
    fail("No ./pitchframe project here. Run: npx pitchframe install");
    process.exit(1);
  }
  const res = spawnSync(args[0], args.slice(1), {
    cwd: target,
    stdio: "inherit",
    shell: true,
  });
  process.exit(res.status ?? 0);
};

const help = () => {
  say(`
  ${c.bold("pitchframe")} — launch video, generated from your codebase

  ${c.bold("npx pitchframe install")}     scaffold ./pitchframe and install the skills
  ${c.bold("npx pitchframe doctor")}      check this machine can run the pipeline
  ${c.bold("npx pitchframe capture")}     re-run UI capture from .work/capture.json
  ${c.bold("npx pitchframe render")}      re-render ./pitchframe/output.mp4

  ${c.dim("--force")}        overwrite existing files in ./pitchframe
  ${c.dim("--global")}       install skills to ~/.claude instead of ./.claude
  ${c.dim("--no-install")}   skip npm install

  ${c.dim("Everything else happens by asking Claude Code:")}
  ${c.dim('  "make a launch video for this product"')}
`);
};

switch (command) {
  case "install":
  case "init":
    install();
    break;
  case "doctor":
    doctor();
    break;
  case "capture":
    runInProject(["node", "scripts/capture.mjs"]);
    break;
  case "render":
    runInProject(["npx", "remotion", "render", "LaunchVideo", "output.mp4"]);
    break;
  case "studio":
    runInProject(["npx", "remotion", "studio"]);
    break;
  default:
    help();
}
