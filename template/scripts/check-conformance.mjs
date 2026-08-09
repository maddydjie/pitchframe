#!/usr/bin/env node
/**
 * Holds the Director to the direction.
 *
 * .work/direction.json is described everywhere as binding, and until now was
 * binding by prose. Prose is exactly what failed for "be varied", for
 * bleed-is-the-default and for chrome-defaults-to-macos: when a default
 * contradicts a skill the default wins and nobody notices.
 *
 * A deviation is legal — the Director sees the product and the direction
 * script does not. It just has to be *written down*, naming the field, in
 * .work/director.md. That is the whole contract.
 *
 * Unlike the post-render inspection this exits non-zero, because it runs
 * before capture and voicing: nothing has been spent yet, so stopping costs a
 * re-direct rather than a re-render.
 */

import fs from "node:fs";
import path from "node:path";

/** Fields the direction owns outright. Anything else is the Director's. */
const OWNED = [
  "style",
  "structure",
  "type_layout",
  "accent_style",
  "transition",
  "framing",
  "chrome",
  "music",
];

/**
 * An excuse is a *stated override*, not any sentence containing the word.
 *
 * Matching the bare field name anywhere in the notes would let "the structure
 * of this product is unusual" silently license a structural deviation — which
 * would rebuild the exact hole this check exists to close, one level up. The
 * override and the field have to appear on the same line, which is what
 * writing an override actually looks like.
 */
const OVERRIDE = /overrid|overrode|deviat|instead of|departing from/i;

const excused = (field, notes) =>
  String(notes ?? "")
    .split("\n")
    .some((line) => OVERRIDE.test(line) && new RegExp(`\\b${field}\\b`, "i").test(line));

/**
 * A field is only owned if the direction actually declared it.
 *
 * Comparing against an absent direction would report every field the script
 * sets as a deviation from `undefined` — which is not a Director going its own
 * way, it is the direction step not having run. That failure mode is loud and
 * useless, and the kind of false alarm that teaches people to pass `--force`.
 */
export const conformanceFindings = (direction, script, directorNotes) =>
  OWNED.filter((field) => direction[field] !== undefined)
    .filter((field) => script[field] !== undefined && script[field] !== direction[field])
    .filter((field) => !excused(field, directorNotes))
    .map((field) => ({
      check: "conformance",
      severity: "fail",
      message: `direction says ${field} is "${direction[field]}" but the script uses "${script[field]}", with no stated override in .work/director.md`,
      target: field,
    }));

const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();
  const read = (p, fallback) => {
    try {
      return fs.readFileSync(path.join(project, p), "utf8");
    } catch {
      return fallback;
    }
  };

  const direction = JSON.parse(read(".work/direction.json", "{}"));
  const script = JSON.parse(read("script.json", "{}"));
  const notes = read(".work/director.md", "");

  const findings = conformanceFindings(direction, script, notes);
  for (const f of findings) process.stderr.write(`conformance: ${f.message}\n`);

  if (findings.length) {
    process.stderr.write(
      "\nEither conform to the direction, or state the override in .work/director.md " +
        "on one line naming the field — e.g. \"Overriding `structure`: <reason>\".\n",
    );
    process.exit(1);
  }
  process.stdout.write("conformance: the script obeys the direction\n");
}
