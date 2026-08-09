import test from "node:test";
import assert from "node:assert/strict";
import { checkHeroShotFloor } from "../scripts/lib/checks.mjs";

const heroPlan = (seconds, shots) => ({
  total_frames: seconds * 30,
  fps: 30,
  beats: [{ id: 1, type: "interaction", frames: [0, seconds * 30], recording: "scan", shots }],
});

test("a 5-second hero needs only one shot", () => {
  assert.deepEqual(checkHeroShotFloor(heroPlan(5, [{ frames: 150 }]), 30), []);
});

test("a 30-second hero held on one framing fails", () => {
  const [f] = checkHeroShotFloor(heroPlan(30, [{ frames: 900 }]), 30);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /1 shot.*needs at least 5/);
});

test("a 30-second hero cut into five shots passes", () => {
  const shots = Array.from({ length: 5 }, () => ({ frames: 180 }));
  assert.deepEqual(checkHeroShotFloor(heroPlan(30, shots), 30), []);
});

test("a hero with no shots array counts as one shot", () => {
  const [f] = checkHeroShotFloor(heroPlan(30, undefined), 30);
  assert.match(f.message, /1 shot/);
});

test("shots are counted across every beat sharing the recording", () => {
  const p = {
    total_frames: 900,
    fps: 30,
    beats: [
      {
        id: 1,
        type: "interaction",
        frames: [0, 450],
        recording: "scan",
        shots: [{ frames: 200 }, { frames: 250 }],
      },
      {
        id: 2,
        type: "interaction",
        frames: [450, 900],
        recording: "scan",
        shots: [{ frames: 150 }, { frames: 150 }, { frames: 150 }],
      },
    ],
  };
  assert.deepEqual(checkHeroShotFloor(p, 30), []);
});
