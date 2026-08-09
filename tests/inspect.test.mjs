import test from "node:test";
import assert from "node:assert/strict";
import { parseTheme, runStaticChecks } from "../scripts/inspect.mjs";

test("parseTheme reads hex constants and ignores null and derived values", () => {
  const src = `
export const BACKGROUND = "#0a0a0a";
export const TEXT = "#ffffff";
export const LOGO = null;
export const BORDER = "rgba(255, 255, 255, 0.1)";
`;
  const theme = parseTheme(src);
  assert.equal(theme.BACKGROUND, "#0a0a0a");
  assert.equal(theme.TEXT, "#ffffff");
  assert.equal(theme.LOGO, undefined);
});

test("runStaticChecks aggregates findings from every check", () => {
  const plan = {
    total_frames: 100,
    fps: 30,
    beats: [
      { id: 1, type: "typography", frames: [0, 10], surface: "light" },
      {
        id: 2,
        type: "interaction",
        frames: [10, 90],
        recording: "scan",
        framing: "bleed",
        chrome: "macos",
      },
    ],
  };
  const theme = { TEXT: "#ffffff", TEXT_ON_LIGHT: "#ffffff", BACKGROUND: "#0a0a0a" };
  const findings = runStaticChecks({ plan, theme, files: {} });
  const checks = new Set(findings.map((f) => f.check));
  assert.ok(checks.has("contrast"));
  assert.ok(checks.has("chrome_framing"));
  assert.ok(checks.has("contiguity"), "last beat ends at 90, total is 100");
  assert.ok(checks.has("payoff"));
});

test("a clean plan produces no findings", () => {
  const plan = {
    total_frames: 100,
    fps: 30,
    beats: [
      { id: 1, type: "typography", frames: [0, 20] },
      { id: 2, type: "interaction", frames: [20, 80], recording: "scan" },
      { id: 3, type: "typography", frames: [80, 100] },
    ],
  };
  const theme = { TEXT: "#ffffff", TEXT_ON_LIGHT: "#141414", BACKGROUND: "#0a0a0a" };
  assert.deepEqual(runStaticChecks({ plan, theme, files: {} }), []);
});
