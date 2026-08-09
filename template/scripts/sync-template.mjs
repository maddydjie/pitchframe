#!/usr/bin/env node
/**
 * Keeps template/scripts identical to scripts/.
 *
 * The installer already treats package-root scripts/ as the only source — it
 * excludes template/scripts from the template copy and lays the real one down
 * on top. The template copy exists solely so this repo can be rendered in
 * place. That makes it a copy maintained by discipline, and discipline is what
 * failed for every other prose-only rule in this project: a stale local copy
 * runs the old script, and the difference shows up as a rendered defect with
 * no error attached to it.
 */

import fs from "node:fs";
import path from "node:path";

const walk = (dir, base = dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
};

export const driftingFiles = (srcDir, dstDir) =>
  walk(srcDir).filter((rel) => {
    const dst = path.join(dstDir, rel);
    if (!fs.existsSync(dst)) return true;
    return !fs.readFileSync(path.join(srcDir, rel)).equals(fs.readFileSync(dst));
  });

const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const root = path.resolve(import.meta.dirname, "..");
  const src = path.join(root, "scripts");
  const dst = path.join(root, "template", "scripts");
  const drift = driftingFiles(src, dst);

  if (process.argv.includes("--write")) {
    for (const rel of drift) {
      const to = path.join(dst, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(src, rel), to);
    }
    process.stdout.write(`synced ${drift.length} file(s)\n`);
  } else if (drift.length) {
    process.stderr.write(
      `template/scripts is stale:\n  ${drift.join("\n  ")}\nrun: npm run sync\n`,
    );
    process.exit(1);
  } else {
    process.stdout.write("template/scripts is in sync\n");
  }
}
