import test from "node:test";
import assert from "node:assert/strict";
import { conformanceFindings } from "../scripts/check-conformance.mjs";

const direction = {
  style: "signature",
  structure: "thesis",
  type_layout: "stacked",
  transition: "dissolve",
};

test("a script that matches the direction produces no findings", () => {
  const script = { structure: "thesis", type_layout: "stacked", transition: "dissolve" };
  assert.deepEqual(conformanceFindings(direction, script, ""), []);
});

test("an unexplained deviation fails and names the field", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const [f] = conformanceFindings(direction, script, "");
  assert.equal(f.severity, "fail");
  assert.equal(f.target, "structure");
  assert.match(f.message, /thesis.*mosaic/);
});

test("a deviation named in director.md is allowed", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const notes =
    "Overriding `structure`: the product has three equally load-bearing surfaces and a single thesis beat cannot carry them.";
  assert.deepEqual(conformanceFindings(direction, script, notes), []);
});

test("a note that does not name the deviating field does not excuse it", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const notes = "Overriding `transition`: the product's own UI uses hard cuts.";
  const [f] = conformanceFindings(direction, script, notes);
  assert.equal(f.target, "structure");
});

test("fields absent from the script are not deviations", () => {
  assert.deepEqual(conformanceFindings(direction, { structure: "thesis" }, ""), []);
});

test("a passing mention of the field name does not excuse a deviation", () => {
  const script = { structure: "mosaic" };
  const notes = "The structure of this product is unusual.";
  const [f] = conformanceFindings(direction, script, notes);
  assert.equal(
    f.target,
    "structure",
    "an excuse must be a stated override, not any sentence containing the word",
  );
});

test("a direction that has not run yet is not a pile of deviations", () => {
  const script = { structure: "thesis", type_layout: "stacked" };
  assert.deepEqual(
    conformanceFindings({}, script, ""),
    [],
    "an absent direction means the step has not run, not that every field deviates",
  );
});
