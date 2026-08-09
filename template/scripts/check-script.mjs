#!/usr/bin/env node
/**
 * Checks the script before anything is voiced.
 *
 * Rewriting a line here costs one regenerated clip; after the render it costs
 * a re-voice and a re-render. None of these checks make writing good — no
 * check does. They catch the specific failure of copy that reads as generated,
 * and the one that is not a taste question at all: invented words.
 */

import fs from "node:fs";
import path from "node:path";

/** Every string recon actually read off the product, flattened and lowercased. */
const reconStrings = (recon) => {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === "string") out.add(v.toLowerCase());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(recon);
  return out;
};

/**
 * Drawn labels live in two places: a `render` on the shown beat, and a
 * `render` on any hero shot. Both are the same claim about the product's real
 * words, so both are checked.
 */
const drawnItems = (script) =>
  (script.lines ?? []).flatMap((line, i) => {
    const show = line.show ?? {};
    const here = show.render?.items ?? [];
    const inShots = (show.shots ?? []).flatMap((s) => s.render?.items ?? []);
    return [...here, ...inShots].map((item) => ({ item, index: i }));
  });

/**
 * A rebuilt component carrying the product's real words is truthful; one
 * carrying invented words is a lie that renders beautifully. This is the only
 * check here about honesty rather than craft, which is why it is a fail and
 * never a warning.
 */
export const checkDrawnLabels = (script, recon) => {
  const known = reconStrings(recon);
  return drawnItems(script)
    .filter(({ item }) => !known.has(String(item).toLowerCase()))
    .map(({ item, index }) => ({
      check: "drawn_label",
      severity: "fail",
      message: `drawn label "${item}" does not appear in .work/recon.json — a rebuilt component with invented words is a lie that renders beautifully`,
      target: `lines[${index}].show.render.items`,
    }));
};

/**
 * The thesis has to name something that exists.
 *
 * "Unlock unprecedented productivity" is a sentence about no product in
 * particular, and a video built on it will be about no product in particular.
 * Grounding is checkable where quality is not: some substantial word of the
 * thesis has to appear in what recon actually read off the site.
 */
export const checkThesisGrounded = (script, recon) => {
  const thesis = String(script.thesis ?? script.video_thesis ?? "");
  if (!thesis) return [];

  const known = [...reconStrings(recon)].filter((s) => s.length > 3);
  // Four letters and up: shorter words are grammar, and grammar matches
  // everything, which would ground every thesis ever written.
  const words = thesis.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const grounded = words.some((w) => known.some((k) => k.includes(w)));
  if (grounded) return [];

  return [
    {
      check: "thesis_grounded",
      severity: "fail",
      message: `the thesis "${thesis}" names nothing that appears in recon — a thesis about no product in particular produces a video about no product in particular`,
      target: "thesis",
    },
  ];
};

/**
 * The register that reads as generated.
 *
 * Not a style opinion: these are the words that appear when a model is
 * describing a product it has not understood, and they are the tell a founder
 * hears first.
 */
const MARKETING = [
  "seamless",
  "seamlessly",
  "effortless",
  "effortlessly",
  "powerful",
  "robust",
  "cutting-edge",
  "unlock",
  "leverage",
  "revolutionize",
  "revolutionise",
  "game-changing",
  "unprecedented",
  "supercharge",
];

export const checkGenericCopy = (script) => {
  const out = [];
  (script.lines ?? []).forEach((line, i) => {
    const said = String(line.say ?? line.vo ?? "");
    // Word boundaries on both ends: "unlocked" is a door, not a value prop.
    const hits = MARKETING.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(said));
    if (!hits.length) return;
    out.push({
      check: "generic_copy",
      severity: "fail",
      message: `line ${line.id ?? i} uses ${hits.map((h) => `"${h}"`).join(", ")} — the register a founder hears as generated`,
      target: `lines[${i}].say`,
    });
  });
  return out;
};

export const scriptFindings = (script, recon) => [
  ...checkDrawnLabels(script, recon),
  ...checkThesisGrounded(script, recon),
  ...checkGenericCopy(script),
];

const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();
  const read = (p) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(project, p), "utf8"));
    } catch {
      return {};
    }
  };

  const recon = read(".work/recon.json");
  const hasRecon = Object.keys(recon).length > 0;
  const findings = scriptFindings(read("script.json"), recon);

  /*
   * Two of the three checks ask "does this word exist in the product?", and
   * without recon that question has no answer — every label and every thesis
   * would be reported as invented. Reporting an unanswerable question as a
   * fault is how a checker teaches people to ignore it, so the verdict is
   * withheld and the reason is stated. A real run always has recon: it is
   * written at step 1, before the Director runs at all.
   */
  const NEEDS_RECON = new Set(["thesis_grounded", "drawn_label"]);
  const relevant = hasRecon ? findings : findings.filter((f) => !NEEDS_RECON.has(f.check));

  if (!hasRecon) {
    process.stderr.write(
      `script: no .work/recon.json — ${findings.length - relevant.length} label and grounding check(s) skipped, not passed\n`,
    );
  }
  for (const f of relevant) process.stderr.write(`script: ${f.message}\n  fix: ${f.target}\n`);

  if (relevant.some((f) => f.severity === "fail")) process.exit(1);
  process.stdout.write("script: no findings\n");
}
