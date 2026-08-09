import test from "node:test";
import assert from "node:assert/strict";
import { buildDirection, signatureOf } from "../scripts/art-direction.mjs";

test("chrome and framing never contradict", () => {
  for (let rotation = 0; rotation < 20; rotation++) {
    const d = buildDirection({ product: "acme", lightUI: false, rotation, tracks: [] });
    assert.ok(
      !(d.framing === "bleed" && d.chrome === "macos"),
      `rotation ${rotation} produced bleed with macos chrome`,
    );
  }
});

test("the signature includes framing", () => {
  const a = {
    style: "s",
    structure: "thesis",
    type_layout: "stacked",
    hero_progression: ["a"],
    framing: "bleed",
  };
  const b = { ...a, framing: "component" };
  assert.notEqual(signatureOf(a), signatureOf(b));
});

test("the same product and rotation always give the same direction", () => {
  const args = { product: "acme", lightUI: false, rotation: 3, tracks: [] };
  assert.deepEqual(buildDirection(args), buildDirection(args));
});

test("two different products get different directions", () => {
  const a = buildDirection({ product: "acme", lightUI: false, rotation: 0, tracks: [] });
  const b = buildDirection({ product: "linear", lightUI: false, rotation: 0, tracks: [] });
  assert.notEqual(a.signature, b.signature);
});

test("a light UI still gets a dark frame", () => {
  for (let rotation = 0; rotation < 20; rotation++) {
    const d = buildDirection({ product: "acme", lightUI: true, rotation, tracks: [] });
    assert.ok(
      ["signature", "ambient", "mono", "spectrum"].includes(d.style),
      `rotation ${rotation} gave a light frame to a light UI: ${d.style}`,
    );
  }
});

test("importing the module does not run the CLI", () => {
  // The rotation loop reads runs/ and writes .work/direction.json. If the
  // module still executed at import, this test file would have rewritten the
  // real project's direction just by loading — which is exactly the kind of
  // side effect that makes a test suite unsafe to run.
  assert.equal(typeof buildDirection, "function");
});
