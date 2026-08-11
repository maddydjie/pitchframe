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
      centreVariance: 900,
      edgeEnergy: 900,
      edgeVariance: 900,
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

test("measuring nothing is reported as a failure, never as a clean pass", async () => {
  const { measureFrames } = await import("../scripts/lib/extract.mjs");
  const plan = {
    total_frames: 100,
    fps: 30,
    beats: [{ id: 1, type: "typography", frames: [0, 100] }],
  };
  // A file that exists but is not a video: extraction yields no stills.
  const notAVideo = new URL(import.meta.url).pathname;
  const r = measureFrames(plan, notAVideo, "/tmp/pf-none", process.cwd());
  assert.ok(
    r.findings.some((f) => f.severity === "fail"),
    "a render that could not be measured must fail, not report nothing",
  );
  assert.equal(r.measured.length, 0);
});

test("an empty region is not reported as blurred", () => {
  // The real numbers from frame 744 of a correct render: a sharp bar chart
  // whose middle is empty. Whole-frame contrast is high, centre detail is
  // near zero because there is nothing there — not because it is soft.
  const measured = [
    {
      frame: 744,
      why: "hero: before the action",
      variance: 2204,
      mean: 40,
      centreEnergy: 14,
      centreVariance: 6,
      edgeEnergy: 240,
      edgeVariance: 2204,
    },
  ];
  assert.deepEqual(
    gradeFrameFindings(measured, {}),
    [],
    "empty negative space must not read as out of focus",
  );
});

test("blurred content is still reported", () => {
  // Same shape, but the centre carries real contrast and has lost its detail.
  const measured = [
    {
      frame: 744,
      why: "hero: after the action",
      variance: 2204,
      mean: 40,
      centreEnergy: 14,
      centreVariance: 1400,
      edgeEnergy: 240,
      edgeVariance: 2204,
    },
  ];
  const [f] = gradeFrameFindings(measured, {});
  assert.equal(f.check, "subject_blur");
});
