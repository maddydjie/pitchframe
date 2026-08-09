import test from "node:test";
import assert from "node:assert/strict";
import { relativeLuminance, contrastRatio, checkContrast } from "../scripts/lib/checks.mjs";

test("relative luminance of black and white", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
});

test("contrast ratio of black on white is 21", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
});

const theme = {
  TEXT: "#ffffff",
  TEXT_ON_LIGHT: "#141414",
  ACCENT: "#67e8f9",
  ACCENT_ON_LIGHT: "#0e7490",
  BACKGROUND: "#0a0a0a",
  SURFACE: "#161616",
};

const beat = (type, surface) => ({ id: 1, type, frames: [0, 60], surface, text: "hi" });

test("white text on the dark background passes", () => {
  assert.deepEqual(checkContrast({ beats: [beat("typography", "dark")] }, theme), []);
});

test("a light surface uses TEXT_ON_LIGHT and passes", () => {
  assert.deepEqual(checkContrast({ beats: [beat("typography", "light")] }, theme), []);
});

test("a light surface with a dark-context text token fails at the real ratio", () => {
  const broken = { ...theme, TEXT_ON_LIGHT: "#ffffff" };
  const [f] = checkContrast({ beats: [beat("typography", "light")] }, broken);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /1\.\d+:1/);
  assert.equal(f.target, "beats[0].surface");
});

test("beats that render no text are not checked", () => {
  assert.deepEqual(checkContrast({ beats: [beat("interaction", "light")] }, theme), []);
});
