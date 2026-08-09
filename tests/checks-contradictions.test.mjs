import test from "node:test";
import assert from "node:assert/strict";
import {
  checkChromeFraming,
  checkZoomBlurCoupling,
  checkColourLiterals,
} from "../scripts/lib/checks.mjs";

const hero = (extra) => ({
  total_frames: 100,
  beats: [{ id: 1, type: "interaction", frames: [0, 100], recording: "scan", ...extra }],
});

test("bleed with chrome off passes", () => {
  assert.deepEqual(checkChromeFraming(hero({ framing: "bleed", chrome: "none" })), []);
});

test("bleed with macos chrome contradicts and fails", () => {
  const [f] = checkChromeFraming(hero({ framing: "bleed", chrome: "macos" }));
  assert.equal(f.severity, "fail");
  assert.match(f.message, /chrome/);
  assert.equal(f.target, "beats[0].chrome");
});

test("the contradiction is caught inside a shots array too", () => {
  const [f] = checkChromeFraming(
    hero({ shots: [{ frames: 50, framing: "bleed", chrome: "macos" }] }),
  );
  assert.equal(f.target, "beats[0].shots[0].chrome");
});

test("zoom 1 with no blur passes", () => {
  assert.deepEqual(checkZoomBlurCoupling(hero({ zoom: 1 })), []);
});

test("zoom 1 with an explicit blur fails — a lens that does not move has no falloff", () => {
  const [f] = checkZoomBlurCoupling(hero({ zoom: 1, zoom_blur: 4 }));
  assert.equal(f.severity, "fail");
  assert.match(f.message, /does not move/);
});

test("theme.ts may contain colour literals", () => {
  assert.deepEqual(checkColourLiterals({ "src/theme.ts": 'export const X = "#ffffff";' }), []);
});

test("a colour literal in a scene fails and names the file", () => {
  const [f] = checkColourLiterals({ "src/scenes/CTABeat.tsx": 'color: "#ff0000"' });
  assert.equal(f.severity, "fail");
  assert.equal(f.target, "src/scenes/CTABeat.tsx");
});

test("an rgba literal in a scene fails", () => {
  const [f] = checkColourLiterals({ "src/scenes/UIBeat.tsx": "background: rgba(0, 0, 0, 0.5)" });
  assert.equal(f.severity, "fail");
});
