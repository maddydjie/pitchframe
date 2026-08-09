import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { driftingFiles } from "../scripts/sync-template.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pf-sync-"));

test("no drift when trees match", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "same");
  fs.writeFileSync(path.join(b, "x.mjs"), "same");
  assert.deepEqual(driftingFiles(a, b), []);
});

test("reports a file whose contents differ", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "new");
  fs.writeFileSync(path.join(b, "x.mjs"), "old");
  assert.deepEqual(driftingFiles(a, b), ["x.mjs"]);
});

test("reports a file missing from the destination", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "new");
  assert.deepEqual(driftingFiles(a, b), ["x.mjs"]);
});

test("recurses into subdirectories", () => {
  const a = tmp(), b = tmp();
  fs.mkdirSync(path.join(a, "lib"));
  fs.writeFileSync(path.join(a, "lib", "y.mjs"), "new");
  assert.deepEqual(driftingFiles(a, b), [path.join("lib", "y.mjs")]);
});

test("the real scripts tree is in sync with the template copy", () => {
  const root = path.resolve(import.meta.dirname, "..");
  assert.deepEqual(
    driftingFiles(path.join(root, "scripts"), path.join(root, "template", "scripts")),
    [],
    "run: npm run sync",
  );
});
