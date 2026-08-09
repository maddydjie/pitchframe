#!/usr/bin/env node
/**
 * Looks at what the pipeline produced.
 *
 * Until this existed nothing between install and output.mp4 ever examined its
 * own output, which is why every entry in CLAUDE.md's gotcha list is described
 * as a bug that rendered without error. That is not twenty bugs; it is one
 * missing feedback channel, twenty times.
 *
 * Exits 0 unconditionally. A post-render check that blocks a founder from a
 * finished video is the wrong trade — the finding is written to
 * .work/inspection.json and reported by name instead.
 */

import fs from "node:fs";
import path from "node:path";
import {
  checkChromeFraming,
  checkContiguity,
  checkContrast,
  checkColourLiterals,
  checkHeroShare,
  checkOneHeroRecording,
  checkPayoff,
  checkZoomBlurCoupling,
} from "./lib/checks.mjs";

/** theme.ts is generated, so its shape is stable enough to read with a regex. */
export const parseTheme = (source) => {
  const out = {};
  const re = /export const ([A-Z_]+) = "(#[0-9a-fA-F]{3,8})"/g;
  let m;
  while ((m = re.exec(source))) out[m[1]] = m[2];
  return out;
};

export const runStaticChecks = ({ plan, theme, files }) => [
  ...checkContiguity(plan),
  ...checkOneHeroRecording(plan),
  ...checkHeroShare(plan),
  ...checkPayoff(plan),
  ...checkContrast(plan, theme),
  ...checkChromeFraming(plan),
  ...checkZoomBlurCoupling(plan),
  ...checkColourLiterals(files),
];

const readTsx = (dir, base = dir, out = {}) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) readTsx(full, base, out);
    else if (/\.tsx?$/.test(e.name)) out[path.relative(base, full)] = fs.readFileSync(full, "utf8");
  }
  return out;
};

const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();

  const plan = JSON.parse(fs.readFileSync(path.join(project, "plan.json"), "utf8"));
  const theme = parseTheme(fs.readFileSync(path.join(project, "src", "theme.ts"), "utf8"));
  const files = readTsx(path.join(project, "src"));

  const findings = runStaticChecks({ plan, theme, files });
  const workDir = path.join(project, ".work");
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(
    path.join(workDir, "inspection.json"),
    JSON.stringify({ findings, frames: [] }, null, 2),
  );

  if (!findings.length) process.stdout.write("inspect: no findings\n");
  for (const f of findings) {
    process.stdout.write(`inspect: ${f.severity} ${f.check} — ${f.message}\n  fix: ${f.target}\n`);
  }
}
