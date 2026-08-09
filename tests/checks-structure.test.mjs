import test from "node:test";
import assert from "node:assert/strict";
import {
  checkContiguity,
  checkOneHeroRecording,
  checkHeroShare,
  checkPayoff,
} from "../scripts/lib/checks.mjs";

const plan = (beats, total) => ({ total_frames: total, fps: 30, beats });
const beat = (type, from, to, extra = {}) => ({ id: from, type, frames: [from, to], ...extra });

test("contiguous beats pass", () => {
  const p = plan([beat("typography", 0, 60), beat("cta", 60, 100)], 100);
  assert.deepEqual(checkContiguity(p), []);
});

test("a gap between beats fails and names the beat", () => {
  const p = plan([beat("typography", 0, 60), beat("cta", 70, 100)], 100);
  const [f] = checkContiguity(p);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /starts at 70.*previous ended at 60/);
  assert.equal(f.target, "beats[1].frames");
});

test("a last beat not ending at total_frames fails", () => {
  const p = plan([beat("typography", 0, 60), beat("cta", 60, 90)], 100);
  const messages = checkContiguity(p).map((f) => f.message);
  assert.ok(messages.some((m) => /ends at 90.*total_frames is 100/.test(m)));
});

test("five interaction beats sharing one recording is one hero, and passes", () => {
  const p = plan(
    [0, 1, 2, 3, 4].map((i) =>
      beat("interaction", i * 20, i * 20 + 20, { recording: "scan" }),
    ),
    100,
  );
  assert.deepEqual(checkOneHeroRecording(p), []);
});

test("two distinct recordings means two hero moments and fails", () => {
  const p = plan(
    [
      beat("interaction", 0, 50, { recording: "scan" }),
      beat("interaction", 50, 100, { recording: "export" }),
    ],
    100,
  );
  const [f] = checkOneHeroRecording(p);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /scan.*export/);
});

test("hero at 47% of the runtime passes the 30% floor", () => {
  const p = plan(
    [beat("typography", 0, 53), beat("interaction", 53, 100, { recording: "scan" })],
    100,
  );
  assert.deepEqual(checkHeroShare(p), []);
});

test("hero at 20% of the runtime fails", () => {
  const p = plan(
    [beat("typography", 0, 80), beat("interaction", 80, 100, { recording: "scan" })],
    100,
  );
  const [f] = checkHeroShare(p);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /20%/);
});

test("a typography beat after the hero counts as the payoff", () => {
  const p = plan(
    [beat("interaction", 0, 60, { recording: "scan" }), beat("typography", 60, 100)],
    100,
  );
  assert.deepEqual(checkPayoff(p), []);
});

test("a plan whose only post-hero beat is the cta has no payoff and fails", () => {
  const p = plan(
    [beat("interaction", 0, 60, { recording: "scan" }), beat("cta", 60, 100)],
    100,
  );
  const [f] = checkPayoff(p);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /payoff/);
});
