import test from "node:test";
import assert from "node:assert/strict";
import { framesToTimestamps, gradeFrameFindings } from "../scripts/lib/extract.mjs";

test("frame numbers become seek timestamps at the plan's fps", () => {
  assert.deepEqual(framesToTimestamps([0, 30, 45], 30), ["0.000", "1.000", "1.500"]);
});

test("a blank frame is reported as a failure", () => {
  const measured = [
    { frame: 10, why: "cta beat 3 midpoint", variance: 4, mean: 0, centreEnergy: 0, edgeEnergy: 0 },
  ];
  const [f] = gradeFrameFindings(measured, {});
  assert.equal(f.severity, "fail");
  assert.match(f.message, /blank/);
  assert.equal(f.target, "frame 10");
});

test("a frame with detail is not reported", () => {
  const measured = [
    {
      frame: 10,
      why: "cta beat 3 midpoint",
      variance: 900,
      mean: 40,
      centreEnergy: 500,
      edgeEnergy: 400,
    },
  ];
  assert.deepEqual(gradeFrameFindings(measured, {}), []);
});

test("the subject blurrier than its periphery is reported", () => {
  const measured = [
    {
      frame: 10,
      why: "hero: after the action",
      variance: 900,
      mean: 40,
      centreEnergy: 50,
      edgeEnergy: 900,
    },
  ];
  const [f] = gradeFrameFindings(measured, {});
  assert.match(f.message, /blurrier/);
});

test("an unchanged hero before/after pair is reported", () => {
  const [f] = gradeFrameFindings([], { heroDelta: 0.4 });
  assert.equal(f.severity, "fail");
  assert.match(f.message, /done nothing/);
});

test("a hero pair that changed is not reported", () => {
  assert.deepEqual(gradeFrameFindings([], { heroDelta: 12 }), []);
});
