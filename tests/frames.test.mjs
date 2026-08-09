import test from "node:test";
import assert from "node:assert/strict";
import {
  samplePositions,
  luminanceStats,
  laplacianEnergy,
  frameDelta,
} from "../scripts/lib/frames.mjs";

test("samples a midpoint for every beat", () => {
  const plan = {
    total_frames: 100,
    beats: [
      { id: 1, type: "typography", frames: [0, 40] },
      { id: 2, type: "interaction", frames: [40, 100], recording: "scan" },
    ],
  };
  const frames = samplePositions(plan).map((s) => s.frame);
  assert.ok(frames.includes(20), "typography midpoint");
  assert.ok(frames.includes(70), "hero midpoint");
});

test("samples both sides of every transition boundary", () => {
  const plan = {
    total_frames: 100,
    beats: [
      { id: 1, type: "typography", frames: [0, 40] },
      { id: 2, type: "cta", frames: [40, 100] },
    ],
  };
  const frames = samplePositions(plan).map((s) => s.frame);
  assert.ok(frames.includes(39));
  assert.ok(frames.includes(41));
});

test("positions are sorted, unique and inside the runtime", () => {
  const plan = {
    total_frames: 100,
    beats: [
      { id: 1, type: "typography", frames: [0, 40] },
      { id: 2, type: "interaction", frames: [40, 100], recording: "scan" },
    ],
  };
  const frames = samplePositions(plan).map((s) => s.frame);
  assert.deepEqual(frames, [...new Set(frames)].sort((a, b) => a - b));
  assert.ok(frames.every((f) => f >= 0 && f < 100));
});

test("a flat field has zero variance", () => {
  const gray = new Uint8Array(16).fill(120);
  const { mean, variance } = luminanceStats(gray, 4, 4);
  assert.equal(mean, 120);
  assert.equal(variance, 0);
});

test("a half-black half-white field has high variance", () => {
  const gray = new Uint8Array(16);
  gray.fill(255, 8);
  assert.ok(luminanceStats(gray, 4, 4).variance > 1000);
});

test("laplacian energy is zero on a flat region and positive on an edge", () => {
  const flat = new Uint8Array(25).fill(50);
  assert.equal(laplacianEnergy(flat, 5, 5, { x: 0, y: 0, w: 5, h: 5 }), 0);

  const edged = new Uint8Array(25).fill(0);
  for (let y = 0; y < 5; y++) edged[y * 5 + 2] = 255;
  assert.ok(laplacianEnergy(edged, 5, 5, { x: 0, y: 0, w: 5, h: 5 }) > 0);
});

test("frameDelta is zero for identical frames and 255 for inverted ones", () => {
  const a = new Uint8Array(9).fill(10);
  assert.equal(frameDelta(a, a), 0);
  assert.equal(frameDelta(new Uint8Array(9).fill(0), new Uint8Array(9).fill(255)), 255);
});
