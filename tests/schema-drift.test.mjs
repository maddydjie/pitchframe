import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** The top-level keys ScenePlan declares, read out of the type source. */
const scenePlanKeys = (src) => {
  const body = /export type ScenePlan = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]).sort();
};

test("every key in the shipped plan.json is declared in ScenePlan", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "template", "plan.json"), "utf8"));
  const declared = new Set(
    scenePlanKeys(fs.readFileSync(path.join(root, "template", "src", "lib", "types.ts"), "utf8")),
  );
  const undeclared = Object.keys(plan).filter((k) => !declared.has(k));
  assert.deepEqual(
    undeclared,
    [],
    `plan.json carries keys ScenePlan does not declare: ${undeclared.join(", ")}`,
  );
});

test("the pipeline step count agrees between ARCHITECTURE.md and the skill", () => {
  const countRows = (src) => (src.match(/^\|\s*\d+[a-z]?\s*\|/gm) ?? []).length;
  const arch = countRows(fs.readFileSync(path.join(root, "docs", "ARCHITECTURE.md"), "utf8"));
  const skill = countRows(
    fs.readFileSync(path.join(root, "skills", "pitchframe", "SKILL.md"), "utf8"),
  );
  assert.equal(arch, skill, `ARCHITECTURE.md lists ${arch} steps, the skill lists ${skill}`);
});
