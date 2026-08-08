/**
 * Where `runs/` lives.
 *
 * This repo has two layouts and the scripts run in both. Installed into a
 * user's project, `pitchframe/` *is* the project — script.json, plan.json and
 * public/ sit beside the scripts, and `runs/` belongs there. In this
 * repository, the working project is `template/` while the tool itself is the
 * parent, so defaulting to "next to the scripts" would scatter run folders
 * inside `template/` where they are neither expected nor gitignored.
 *
 * One archive, at the tool's root, either way — because the archive is what
 * `art-direction.mjs` reads to avoid repeating a look, and a split history is
 * the same as no history.
 */

import fs from "node:fs";
import path from "node:path";

/** Set `PITCHFRAME_RUNS` to file runs somewhere else entirely. */
export const runsDir = (pitchframeDir) => {
  if (process.env.PITCHFRAME_RUNS) return path.resolve(process.env.PITCHFRAME_RUNS);

  // The development layout, identified by what is actually in the parent —
  // `skills/` is the tool, and it never ships inside a generated project.
  const parent = path.resolve(pitchframeDir, "..");
  if (
    path.basename(pitchframeDir) === "template" &&
    fs.existsSync(path.join(parent, "skills"))
  ) {
    return path.join(parent, "runs");
  }
  return path.join(pitchframeDir, "runs");
};
