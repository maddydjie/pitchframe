import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runStaticChecks, parseTheme } from "../scripts/inspect.mjs";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

/**
 * A theme whose light-context tokens are the dark-context ones — the exact
 * mistake that shipped white display type on pale lavender at 1.57:1.
 */
const brokenTheme = {
  TEXT: "#ffffff",
  TEXT_ON_LIGHT: "#ffffff",
  ACCENT: "#67e8f9",
  ACCENT_ON_LIGHT: "#ffffff",
  BACKGROUND: "#0a0a0a",
  MESH_LIGHT_DEEP: "#c2c2c2",
};

test("the broken fixture trips every check it was built to trip", () => {
  const plan = readJson("tests/fixtures/broken-plan.json");
  const found = new Set(
    runStaticChecks({ plan, theme: brokenTheme, files: {} }).map((f) => f.check),
  );

  for (const expected of [
    "contiguity", // beat 2 starts at 50, beat 1 ended at 40; last ends at 280 of 300
    "one_hero", // two recordings: scan and export
    "payoff", // nothing but a cta after the hero
    "contrast", // white on a light surface
    "chrome_framing", // bleed with macos chrome
    "zoom_blur", // zoom disabled, blur still ramping
  ]) {
    assert.ok(found.has(expected), `expected the fixture to trip ${expected}, got ${[...found]}`);
  }
});

test("a colour literal outside theme.ts is caught", () => {
  const plan = readJson("tests/fixtures/broken-plan.json");
  const findings = runStaticChecks({
    plan,
    theme: brokenTheme,
    files: { "src/scenes/CTABeat.tsx": 'const c = "#ff0000";' },
  });
  assert.ok(findings.some((f) => f.check === "colour_literal"));
});

test("the shipped reference plan trips nothing", () => {
  const plan = readJson("template/plan.json");
  const theme = parseTheme(
    fs.readFileSync(path.join(root, "template/src/theme.ts"), "utf8"),
  );
  const findings = runStaticChecks({ plan, theme, files: {} });
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

test("the reference project's own components carry no colour literals", () => {
  const dir = path.join(root, "template", "src");
  const files = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) files[path.relative(dir, full)] = fs.readFileSync(full, "utf8");
    }
  };
  walk(dir);

  const plan = readJson("template/plan.json");
  const findings = runStaticChecks({ plan, theme: parseTheme(files["theme.ts"] ?? ""), files });
  const literals = findings.filter((f) => f.check === "colour_literal");
  assert.deepEqual(literals, [], JSON.stringify(literals, null, 2));
});
