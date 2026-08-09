# Pitchframe Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Pitchframe pipeline a feedback channel — deterministic checks on the plan, measurements on the rendered frames, and a conformance contract on the chosen look — so defects are named before a founder discovers them by watching.

**Architecture:** All new logic is pure functions in `scripts/lib/checks.mjs` and `scripts/lib/frames.mjs`, wrapped by thin CLI scripts (`inspect.mjs`, `check-conformance.mjs`, `check-script.mjs`). Purity is the point: every check is unit-testable at the repo root without rendering anything. Tests use Node's built-in `node:test` and `node:assert` — zero new dependencies, matching a repo that currently has none at its root.

**Tech Stack:** Node 20+ ESM (`.mjs`), `node:test`, Remotion 4.0.506, TypeScript 5.9 in `template/`.

## Global Constraints

- **Node 20+, ESM only.** Every script is `.mjs` with `import`. No CommonJS.
- **Zero new runtime dependencies.** The root package has none; keep it that way. Tests use `node:test`/`node:assert` only.
- **`scripts/` at the package root is the only source.** `bin/pitchframe.mjs:114-130` already excludes `template/scripts` from the template copy and copies package-root `scripts/` over it. Never edit `template/scripts/*` directly.
- **Comments explain *why*, never *what*.** Match the surrounding code: name the failure mode being prevented or the reason a number is that number.
- **No glob patterns inside block comments.** `runs/*/direction.json` contains `*/`, which closes the comment mid-sentence and produces a `SyntaxError` pointing thirty lines away. Write `runs/<name>/…`.
- **Run `node --check <file>` on every script you touch.** It catches the above in one second.
- **Nothing in the audio path may use `Math.random()`.** Not touched by this plan, but do not introduce it.
- **Beat frame ranges are `frames: [start, end]`, end-exclusive.** Not `start`/`end` properties.
- **The hero invariant is one *recording*, not one beat.** A hero take spans several spoken lines, so several `interaction` beats legitimately share one `recording` and are given consecutive `segment` slices. Verified: shipped `template/plan.json` has five interaction beats, all `recording: "scan"`.

---

### Task 1: Test harness and the `scripts/` drift guard

Nothing in this repo is unit-tested today. Every later task depends on a working `npm test`, so it comes first. The same task closes the `template/scripts/` drift risk, because every later task adds a script and would otherwise pay the tax twice.

**Files:**
- Modify: `package.json` (add `scripts.test`, `scripts.sync`)
- Create: `scripts/sync-template.mjs`
- Create: `tests/sync-template.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs `node --test tests/`. `npm run sync` copies `scripts/` → `template/scripts/`. `scripts/sync-template.mjs` exports `driftingFiles(srcDir, dstDir): string[]` — relative paths whose contents differ or which are missing in `dstDir`.

- [ ] **Step 1: Write the failing test**

Create `tests/sync-template.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { driftingFiles } from "../scripts/sync-template.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pf-sync-"));

test("no drift when trees match", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "same");
  fs.writeFileSync(path.join(b, "x.mjs"), "same");
  assert.deepEqual(driftingFiles(a, b), []);
});

test("reports a file whose contents differ", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "new");
  fs.writeFileSync(path.join(b, "x.mjs"), "old");
  assert.deepEqual(driftingFiles(a, b), ["x.mjs"]);
});

test("reports a file missing from the destination", () => {
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, "x.mjs"), "new");
  assert.deepEqual(driftingFiles(a, b), ["x.mjs"]);
});

test("recurses into subdirectories", () => {
  const a = tmp(), b = tmp();
  fs.mkdirSync(path.join(a, "lib"));
  fs.writeFileSync(path.join(a, "lib", "y.mjs"), "new");
  assert.deepEqual(driftingFiles(a, b), [path.join("lib", "y.mjs")]);
});

test("the real scripts tree is in sync with the template copy", () => {
  const root = path.resolve(import.meta.dirname, "..");
  assert.deepEqual(
    driftingFiles(path.join(root, "scripts"), path.join(root, "template", "scripts")),
    [],
    "run: npm run sync",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/sync-template.mjs'`, and `npm test` itself is not yet defined.

- [ ] **Step 3: Add the npm scripts**

In `package.json`, add to a new `"scripts"` block (the root package has none today):

```json
  "scripts": {
    "test": "node --test tests/",
    "sync": "node scripts/sync-template.mjs --write"
  },
```

- [ ] **Step 4: Write the implementation**

Create `scripts/sync-template.mjs`:

```js
#!/usr/bin/env node
/**
 * Keeps template/scripts identical to scripts/.
 *
 * The installer already treats package-root scripts/ as the only source — it
 * excludes template/scripts from the template copy and lays the real one down
 * on top. The template copy exists solely so this repo can be rendered in
 * place. That makes it a copy maintained by discipline, and discipline is what
 * failed for every other prose-only rule in this project: a stale local copy
 * runs the old script and the difference shows up as a rendered defect with no
 * error attached.
 */

import fs from "node:fs";
import path from "node:path";

const walk = (dir, base = dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
};

export const driftingFiles = (srcDir, dstDir) =>
  walk(srcDir).filter((rel) => {
    const dst = path.join(dstDir, rel);
    if (!fs.existsSync(dst)) return true;
    return !fs.readFileSync(path.join(srcDir, rel)).equals(fs.readFileSync(dst));
  });

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const root = path.resolve(import.meta.dirname, "..");
  const src = path.join(root, "scripts");
  const dst = path.join(root, "template", "scripts");
  const drift = driftingFiles(src, dst);

  if (process.argv.includes("--write")) {
    for (const rel of drift) {
      const to = path.join(dst, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(src, rel), to);
    }
    process.stdout.write(`synced ${drift.length} file(s)\n`);
  } else if (drift.length) {
    process.stderr.write(`template/scripts is stale:\n  ${drift.join("\n  ")}\nrun: npm run sync\n`);
    process.exit(1);
  } else {
    process.stdout.write("template/scripts is in sync\n");
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/sync-template.mjs tests/sync-template.test.mjs
git commit -m "Add a test harness and a drift guard for template/scripts"
```

---

### Task 2: Static checks — structure

The first four checks in Layer A's static half. All pure, all operating on a parsed `plan.json` object.

**Files:**
- Create: `scripts/lib/checks.mjs`
- Create: `tests/checks-structure.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Finding = { check: string, severity: "fail" | "warn", message: string, target: string }` — `target` names the field or beat id a repair must edit.
  - `checkContiguity(plan): Finding[]`
  - `checkOneHeroRecording(plan): Finding[]`
  - `checkHeroShare(plan): Finding[]`
  - `checkPayoff(plan): Finding[]`
  - `heroBeats(plan): BeatSpec[]` — every `interaction` beat.

- [ ] **Step 1: Write the failing test**

Create `tests/checks-structure.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/checks.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/checks.mjs`:

```js
/**
 * Deterministic checks on a scene plan.
 *
 * Every gotcha in CLAUDE.md is described as a bug that "rendered without error
 * and only showed up in the output". Most of them never needed a rendered
 * frame to catch — they needed two numbers compared. This file is that
 * comparison, kept pure so it is testable without mounting Remotion.
 *
 * A finding carries a `target` because a check that only says "something is
 * wrong" costs a full re-reason; one that names the field costs an edit.
 */

/** @typedef {{check: string, severity: "fail"|"warn", message: string, target: string}} Finding */

export const heroBeats = (plan) => plan.beats.filter((b) => b.type === "interaction");

export const checkContiguity = (plan) => {
  const out = [];
  let prev = 0;
  plan.beats.forEach((b, i) => {
    const [from, to] = b.frames;
    if (from !== prev) {
      out.push({
        check: "contiguity",
        severity: "fail",
        message: `beat ${b.id} (${b.type}) starts at ${from}, but the previous ended at ${prev}`,
        target: `beats[${i}].frames`,
      });
    }
    prev = to;
  });
  if (plan.beats.length && prev !== plan.total_frames) {
    const i = plan.beats.length - 1;
    out.push({
      check: "contiguity",
      severity: "fail",
      message: `the last beat ends at ${prev}, but total_frames is ${plan.total_frames}`,
      target: `beats[${i}].frames`,
    });
  }
  return out;
};

/**
 * One hero moment means one *recording*, not one beat.
 *
 * A hero take spans several spoken lines, and one line is one beat, so several
 * interaction beats legitimately share a recording and are given consecutive
 * `segment` slices by plan-from-script.mjs. Counting beats instead of
 * recordings would fail every real plan — the shipped reference plan has five.
 */
export const checkOneHeroRecording = (plan) => {
  const names = [...new Set(heroBeats(plan).map((b) => b.recording).filter(Boolean))];
  if (names.length <= 1) return [];
  return [
    {
      check: "one_hero",
      severity: "fail",
      message: `${names.length} hero recordings (${names.join(", ")}) — two hero moments means neither gets proven`,
      target: "beats[].recording",
    },
  ];
};

/** Below 30% the hero is a feature the video mentions, not the spine it is built on. */
export const checkHeroShare = (plan) => {
  const frames = heroBeats(plan).reduce((a, b) => a + (b.frames[1] - b.frames[0]), 0);
  const share = plan.total_frames ? frames / plan.total_frames : 0;
  if (share >= 0.3) return [];
  return [
    {
      check: "hero_share",
      severity: "fail",
      message: `the hero is ${Math.round(share * 100)}% of the runtime; below 30% it reads as a feature, not a spine`,
      target: "beats[].frames",
    },
  ];
};

/**
 * The payoff is a typography beat *after* the hero.
 *
 * Without one the hero is a screenshot rather than a claim: the viewer is shown
 * a thing happening and never told what it meant. The CTA does not count — a
 * URL is an instruction, not a completion.
 */
export const checkPayoff = (plan) => {
  const hero = heroBeats(plan);
  if (!hero.length) return [];
  const heroEnd = Math.max(...hero.map((b) => b.frames[1]));
  const payoff = plan.beats.some((b) => b.type === "typography" && b.frames[0] >= heroEnd);
  if (payoff) return [];
  return [
    {
      check: "payoff",
      severity: "fail",
      message: "no typography beat after the hero — without a payoff the hero is a screenshot, not a claim",
      target: "beats",
    },
  ];
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Verify against the real shipped plan**

Run:
```bash
node -e "import('./scripts/lib/checks.mjs').then(async (c) => {
  const plan = JSON.parse(await import('node:fs').then(fs => fs.readFileSync('template/plan.json','utf8')));
  console.log([...c.checkContiguity(plan), ...c.checkOneHeroRecording(plan), ...c.checkHeroShare(plan), ...c.checkPayoff(plan)]);
})"
```
Expected: `[]` — the shipped reference plan passes all four.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks.mjs tests/checks-structure.test.mjs
git commit -m "Check plan structure: contiguity, one hero recording, hero share, payoff"
```

---

### Task 3: Static checks — contrast

The white-display-type-on-pale-lavender bug rendered at **1.57:1**. Catching it required multiplying two numbers, not looking at an image.

**Files:**
- Modify: `scripts/lib/checks.mjs` (append)
- Create: `tests/checks-contrast.test.mjs`

**Interfaces:**
- Consumes: the `Finding` shape from Task 2.
- Produces:
  - `relativeLuminance(hex): number` — WCAG relative luminance, 0–1.
  - `contrastRatio(hexA, hexB): number` — WCAG ratio, 1–21.
  - `checkContrast(plan, theme): Finding[]` where `theme` is `{ TEXT, TEXT_ON_LIGHT, ACCENT, ACCENT_ON_LIGHT, BACKGROUND, SURFACE }`, all `#rrggbb`.

- [ ] **Step 1: Write the failing test**

Create `tests/checks-contrast.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `relativeLuminance is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/lib/checks.mjs`:

```js
/* ------------------------------------------------------------- contrast */

/**
 * Contrast is arithmetic on the theme, not a property of the render.
 *
 * `surfaceColors()` in src/lib/surface.ts already decides which token a beat
 * draws with given what it sits on. That decision is reproducible here without
 * mounting anything, which is why this check is in the static half: the first
 * light beat shipped white display type on pale lavender at 1.57:1, and every
 * component that gains a light context can repeat it.
 *
 * Rec. 709 coefficients and the sRGB transfer curve, per WCAG 2.1.
 */
const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export const relativeLuminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Beat types that render type. An interaction beat draws footage, not words. */
const TEXT_BEATS = new Set(["typography", "logo", "cta", "ui"]);

/**
 * `mesh` is a mid-tone field built from the accent and white still clears
 * 4.5:1 on it, so only `light` inverts — the same rule surfaceColors() encodes.
 */
const backdropFor = (surface, theme) =>
  surface === "light" ? theme.ACCENT_ON_LIGHT_BG ?? "#f2f2f2" : theme.BACKGROUND;

export const checkContrast = (plan, theme) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (!TEXT_BEATS.has(b.type)) return;
    const onLight = b.surface === "light";
    const text = onLight ? theme.TEXT_ON_LIGHT : theme.TEXT;
    const backdrop = backdropFor(b.surface, theme);
    const ratio = contrastRatio(text, backdrop);
    if (ratio === null || ratio >= 4.5) return;
    out.push({
      check: "contrast",
      severity: "fail",
      message: `beat ${b.id} (${b.type}, surface ${b.surface ?? "dark"}) draws ${text} on ${backdrop} at ${ratio.toFixed(2)}:1 — below 4.5:1 it is invisible in the video`,
      target: `beats[${i}].surface`,
    });
  });
  return out;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 19 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs tests/checks-contrast.test.mjs
git commit -m "Check text contrast against each beat's real surface"
```

---

### Task 4: Static checks — the contradictions that silently reverted fixes

Three failures from `CLAUDE.md` that rendered cleanly: `chrome` forcing `contained` and undoing the framing work; a blur ramp running with the zoom disabled; a colour literal outside `theme.ts`.

**Files:**
- Modify: `scripts/lib/checks.mjs` (append)
- Create: `tests/checks-contradictions.test.mjs`

**Interfaces:**
- Consumes: `Finding`, `heroBeats` from Task 2.
- Produces:
  - `checkChromeFraming(plan): Finding[]`
  - `checkZoomBlurCoupling(plan): Finding[]`
  - `checkColourLiterals(files): Finding[]` where `files` is `{ [relPath]: sourceText }`.

- [ ] **Step 1: Write the failing test**

Create `tests/checks-contradictions.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `checkChromeFraming is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/lib/checks.mjs`:

```js
/* ------------------------------------------------------- contradictions */

/**
 * Every shot in a hero, whether written as `shots` or as the one-shot
 * shorthand on the beat itself. `resolveShots()` in lib/heroShots.ts owns the
 * precedence rule at render time; this mirrors only the enumeration, never the
 * precedence, because re-implementing precedence in two places is how the two
 * drift apart.
 */
const shotsOf = (beat, beatIndex) =>
  Array.isArray(beat.shots) && beat.shots.length
    ? beat.shots.map((s, j) => ({ spec: s, path: `beats[${beatIndex}].shots[${j}]` }))
    : [{ spec: beat, path: `beats[${beatIndex}]` }];

/**
 * Chrome and `bleed` are mutually exclusive, and the pair is where a default
 * silently reverted a fix: `chrome` defaulted to `macos`, chrome forces
 * `contained` geometry, and so the framing work landed and was undone in the
 * same session across three videos while the skill still said `bleed` was the
 * default. A window whose edges have left the frame is not a window.
 */
export const checkChromeFraming = (plan) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (b.type !== "interaction") return;
    for (const { spec, path } of shotsOf(b, i)) {
      if (spec.framing === "bleed" && spec.chrome === "macos") {
        out.push({
          check: "chrome_framing",
          severity: "fail",
          message: `${path} asks for bleed and macos chrome — chrome forces contained geometry, so the bleed is silently discarded`,
          target: `${path}.chrome`,
        });
      }
    }
  });
  return out;
};

/**
 * A lens that does not move has no falloff.
 *
 * `zoomBlur` once ramped to a fixed 4px independent of `zoomPeak`, so setting
 * `zoom: 1` to disable the punch left the blur running — and because the sharp
 * spot is a small ellipse at the click target, a shot aimed at a toolbar
 * blurred the whole rest of the app for most of the hero.
 */
export const checkZoomBlurCoupling = (plan) => {
  const out = [];
  plan.beats.forEach((b, i) => {
    if (b.type !== "interaction") return;
    for (const { spec, path } of shotsOf(b, i)) {
      if (spec.zoom === 1 && Number(spec.zoom_blur) > 0) {
        out.push({
          check: "zoom_blur",
          severity: "fail",
          message: `${path} disables the zoom but keeps ${spec.zoom_blur}px of blur — a lens that does not move has no falloff, so the product just looks out of focus`,
          target: `${path}.zoom_blur`,
        });
      }
    }
  });
  return out;
};

/**
 * theme.ts is the only place a colour is written down. Anywhere else and two
 * products' videos start looking identical, which is the pipeline being broken
 * in the way that is hardest to notice.
 */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[0-9]/;

export const checkColourLiterals = (files) =>
  Object.entries(files)
    .filter(([rel]) => !rel.endsWith("theme.ts"))
    .filter(([, src]) => COLOUR.test(src))
    .map(([rel]) => ({
      check: "colour_literal",
      severity: "fail",
      message: `${rel} contains a colour literal — every colour must resolve through theme.ts or two products get the same video`,
      target: rel,
    }));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 27 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/checks.mjs tests/checks-contradictions.test.mjs
git commit -m "Check the contradictions that rendered cleanly: chrome/bleed, zoom/blur, colour literals"
```

---

### Task 5: `inspect.mjs` — wire the static half

A CLI that loads the real artifacts, runs every check from Tasks 2–4, writes `.work/inspection.json`, and reports.

**Files:**
- Create: `scripts/inspect.mjs`
- Create: `tests/inspect.test.mjs`

**Interfaces:**
- Consumes: every `check*` function from Tasks 2–4.
- Produces:
  - `runStaticChecks({ plan, theme, files }): Finding[]` — the aggregate.
  - `parseTheme(source): object` — pulls `export const NAME = "#hex"` pairs out of `theme.ts` text into a plain object.
  - CLI: `node scripts/inspect.mjs [--project <dir>]`, writes `<project>/.work/inspection.json`, exits 0 always.

- [ ] **Step 1: Write the failing test**

Create `tests/inspect.test.mjs`:

```js
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
    beats: [
      { id: 1, type: "typography", frames: [0, 10], surface: "light" },
      { id: 2, type: "interaction", frames: [10, 90], recording: "scan", framing: "bleed", chrome: "macos" },
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
    beats: [
      { id: 1, type: "typography", frames: [0, 20] },
      { id: 2, type: "interaction", frames: [20, 80], recording: "scan" },
      { id: 3, type: "typography", frames: [80, 100] },
    ],
  };
  const theme = { TEXT: "#ffffff", TEXT_ON_LIGHT: "#141414", BACKGROUND: "#0a0a0a" };
  assert.deepEqual(runStaticChecks({ plan, theme, files: {} }), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/inspect.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/inspect.mjs`:

```js
#!/usr/bin/env node
/**
 * Looks at what the pipeline produced.
 *
 * Until this existed nothing between install and output.mp4 ever examined its
 * own output, which is why every entry in CLAUDE.md's gotcha list is described
 * as a bug that rendered without error. That is not twenty bugs; it is one
 * missing feedback channel, twenty times.
 *
 * Exits 0 unconditionally. A post-render check that blocks a founder from a
 * finished video is the wrong trade — the finding is written to
 * .work/inspection.json and reported by name instead.
 */

import fs from "node:fs";
import path from "node:path";
import {
  checkChromeFraming,
  checkContiguity,
  checkContrast,
  checkColourLiterals,
  checkHeroShare,
  checkOneHeroRecording,
  checkPayoff,
  checkZoomBlurCoupling,
} from "./lib/checks.mjs";

/** theme.ts is generated, so its shape is stable enough to read with a regex. */
export const parseTheme = (source) => {
  const out = {};
  const re = /export const ([A-Z_]+) = "(#[0-9a-fA-F]{3,8})"/g;
  let m;
  while ((m = re.exec(source))) out[m[1]] = m[2];
  return out;
};

export const runStaticChecks = ({ plan, theme, files }) => [
  ...checkContiguity(plan),
  ...checkOneHeroRecording(plan),
  ...checkHeroShare(plan),
  ...checkPayoff(plan),
  ...checkContrast(plan, theme),
  ...checkChromeFraming(plan),
  ...checkZoomBlurCoupling(plan),
  ...checkColourLiterals(files),
];

const readTsx = (dir, base = dir, out = {}) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) readTsx(full, base, out);
    else if (/\.tsx?$/.test(e.name)) out[path.relative(base, full)] = fs.readFileSync(full, "utf8");
  }
  return out;
};

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();

  const plan = JSON.parse(fs.readFileSync(path.join(project, "plan.json"), "utf8"));
  const theme = parseTheme(fs.readFileSync(path.join(project, "src", "theme.ts"), "utf8"));
  const files = readTsx(path.join(project, "src"));

  const findings = runStaticChecks({ plan, theme, files });
  const workDir = path.join(project, ".work");
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(
    path.join(workDir, "inspection.json"),
    JSON.stringify({ findings, frames: [] }, null, 2),
  );

  if (!findings.length) process.stdout.write("inspect: no findings\n");
  for (const f of findings) {
    process.stdout.write(`inspect: ${f.severity} ${f.check} — ${f.message}\n  fix: ${f.target}\n`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 30 tests total.

- [ ] **Step 5: Run it against the real project**

Run: `node scripts/inspect.mjs --project template`
Expected: prints findings for the shipped plan (the `colour_literal` check may flag files; record what it reports). `template/.work/inspection.json` exists afterwards.

If `colour_literal` flags a file other than `theme.ts`, that is a real pre-existing defect — record it in the commit message, do not weaken the check.

- [ ] **Step 6: Sync and commit**

```bash
npm run sync
git add scripts/inspect.mjs template/scripts/inspect.mjs tests/inspect.test.mjs
git commit -m "Add inspect.mjs and wire the static checks"
```

---

### Task 6: Frame extraction and per-frame measurements

The half that needs pixels. Frames are sampled at positions derived from `plan.json`, never uniformly — uniform sampling spends most of its frames on holds, where nothing is moving and nothing can be wrong.

**Files:**
- Create: `scripts/lib/frames.mjs`
- Create: `tests/frames.test.mjs`

**Interfaces:**
- Consumes: `heroBeats` from Task 2.
- Produces:
  - `samplePositions(plan): { frame: number, why: string }[]`
  - `luminanceStats(gray, w, h): { mean: number, variance: number }` where `gray` is a `Uint8Array` of length `w*h`.
  - `laplacianEnergy(gray, w, h, region): number` — `region` is `{x, y, w, h}` in pixels.
  - `frameDelta(grayA, grayB): number` — mean absolute difference, 0–255.

- [ ] **Step 1: Write the failing test**

Create `tests/frames.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { samplePositions, luminanceStats, laplacianEnergy, frameDelta } from "../scripts/lib/frames.mjs";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/frames.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/frames.mjs`:

```js
/**
 * Measurements on rendered frames, and where to take them.
 *
 * Pure and pixel-format agnostic: everything below takes a Uint8Array of
 * 8-bit luminance. Decoding is somebody else's problem, which keeps this file
 * testable with a 4×4 array instead of a render.
 */

import { heroBeats } from "./checks.mjs";

/**
 * Where to look.
 *
 * Derived from the plan rather than sampled uniformly, because a launch video
 * is mostly holds: uniform sampling spends its budget on frames where nothing
 * is moving and therefore nothing can be wrong. The interesting frames are the
 * ones where the plan says something changes.
 */
export const samplePositions = (plan) => {
  const seen = new Map();
  const add = (frame, why) => {
    const f = Math.max(0, Math.min(plan.total_frames - 1, Math.round(frame)));
    if (!seen.has(f)) seen.set(f, { frame: f, why });
  };

  for (const b of plan.beats) {
    const [from, to] = b.frames;
    add((from + to) / 2, `${b.type} beat ${b.id} midpoint`);
    // Both sides of the cut: a transition that fails fails asymmetrically.
    if (from > 0) {
      add(from - 1, `before the cut into beat ${b.id}`);
      add(from + 1, `after the cut into beat ${b.id}`);
    }
  }

  const hero = heroBeats(plan);
  if (hero.length) {
    const from = Math.min(...hero.map((b) => b.frames[0]));
    const to = Math.max(...hero.map((b) => b.frames[1]));
    // The pair that proves the state change. Identical frames here mean the
    // product appeared to do nothing, which is worse than having no hero.
    add(from + (to - from) * 0.2, "hero: before the action");
    add(from + (to - from) * 0.8, "hero: after the action");
  }

  return [...seen.values()].sort((a, b) => a.frame - b.frame);
};

export const luminanceStats = (gray, w, h) => {
  const n = w * h;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (gray[i] - mean) ** 2;
  return { mean, variance: acc / n };
};

/**
 * Laplacian energy — a stand-in for "how much detail is here".
 *
 * Compared centre-against-periphery it detects the depth-of-field bug that
 * survived three renders: the subject blurrier than its own surroundings,
 * because the sharp ellipse was aimed at the click target while the shot was
 * framed on something else.
 */
export const laplacianEnergy = (gray, w, h, region) => {
  const x0 = Math.max(1, region.x);
  const y0 = Math.max(1, region.y);
  const x1 = Math.min(w - 1, region.x + region.w);
  const y1 = Math.min(h - 1, region.y + region.h);
  let acc = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      acc += lap * lap;
      n++;
    }
  }
  return n ? acc / n : 0;
};

export const frameDelta = (a, b) => {
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i]);
  return acc / a.length;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 37 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/frames.mjs tests/frames.test.mjs
git commit -m "Add frame sampling positions and per-frame measurements"
```

---

### Task 7: Decode frames from output.mp4 and write them for review

Connects Task 6's pure maths to a real MP4. Extraction goes through the ffmpeg binary Remotion already ships, so no new dependency and no assumption that the user has ffmpeg on PATH.

**Files:**
- Modify: `scripts/inspect.mjs`
- Create: `scripts/lib/extract.mjs`
- Create: `tests/extract.test.mjs`

**Interfaces:**
- Consumes: `samplePositions`, `luminanceStats`, `laplacianEnergy`, `frameDelta` from Task 6.
- Produces:
  - `ffmpegBinary(): string | null` — resolves Remotion's bundled ffmpeg, else `ffmpeg` on PATH, else `null`.
  - `extractFrames(mp4, positions, fps, outDir): Promise<{frame:number, png:string}[]>`
  - `decodeGray(pngPath): Promise<{gray: Uint8Array, w: number, h: number}>`
  - `measureFrames(plan, mp4, outDir): Promise<Finding[]>` — appended to `inspection.json` under `frames`.

- [ ] **Step 1: Probe what extraction path exists on this machine**

Run:
```bash
cd template && node -e "
const { execSync } = require('node:child_process');
try { console.log('remotion ffmpeg:', execSync('npx remotion ffmpeg -version', {encoding:'utf8'}).split('\n')[0]); }
catch (e) { console.log('remotion ffmpeg: unavailable'); }
try { console.log('system ffmpeg:', execSync('ffmpeg -version', {encoding:'utf8'}).split('\n')[0]); }
catch (e) { console.log('system ffmpeg: unavailable'); }
"
```

Record which succeeded. `npx remotion ffmpeg` is the preferred path because it needs no system install. If **neither** is available, implement `ffmpegBinary()` returning `null` and have `measureFrames` return a single `warn` finding saying frame measurement was skipped — the static half still runs, and a capability that degrades loudly is the whole point.

- [ ] **Step 2: Write the failing test**

Create `tests/extract.test.mjs`:

```js
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
    { frame: 10, why: "cta beat 3 midpoint", variance: 900, mean: 40, centreEnergy: 500, edgeEnergy: 400 },
  ];
  assert.deepEqual(gradeFrameFindings(measured, {}), []);
});

test("the subject blurrier than its periphery is reported", () => {
  const measured = [
    { frame: 10, why: "hero: after the action", variance: 900, mean: 40, centreEnergy: 50, edgeEnergy: 900 },
  ];
  const [f] = gradeFrameFindings(measured, {});
  assert.match(f.message, /blurrier/);
});

test("an unchanged hero before/after pair is reported", () => {
  const [f] = gradeFrameFindings([], { heroDelta: 0.4 });
  assert.equal(f.severity, "fail");
  assert.match(f.message, /did nothing/);
});

test("a hero pair that changed is not reported", () => {
  assert.deepEqual(gradeFrameFindings([], { heroDelta: 12 }), []);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/extract.mjs'`.

- [ ] **Step 4: Write the implementation**

Create `scripts/lib/extract.mjs`:

```js
/**
 * Pulls stills out of the finished MP4 and grades them.
 *
 * Extraction goes through the ffmpeg Remotion already ships rather than
 * assuming one on PATH: an optional dependency that is usually missing is a
 * check that usually does not run, and this project has already learned that
 * an opt-in feature which degrades silently is a feature that never runs.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { luminanceStats, laplacianEnergy, frameDelta, samplePositions } from "./frames.mjs";

export const framesToTimestamps = (frames, fps) => frames.map((f) => (f / fps).toFixed(3));

export const ffmpegBinary = () => {
  const remotion = spawnSync("npx", ["remotion", "ffmpeg", "-version"], { shell: true });
  if (remotion.status === 0) return "npx remotion ffmpeg";
  const system = spawnSync("ffmpeg", ["-version"], { shell: true });
  if (system.status === 0) return "ffmpeg";
  return null;
};

/**
 * Thresholds.
 *
 * `BLANK_VARIANCE` is deliberately not a file-size test: a solid-black
 * 3840×2160 PNG compresses to about 29KB, so size cannot detect a blank
 * screen. capture.mjs measures variance for the same reason.
 *
 * `HERO_DELTA` is in mean absolute 8-bit luminance. A dissolve between two
 * identical screenshots reads as the product doing nothing, which is worse
 * than having no hero beat at all — so the floor is low but not zero, to
 * tolerate compression noise.
 */
const BLANK_VARIANCE = 25;
const HERO_DELTA = 2;
/** The subject may be softer than its surroundings, but not by 4×. */
const BLUR_RATIO = 0.25;

export const gradeFrameFindings = (measured, { heroDelta } = {}) => {
  const out = [];

  for (const m of measured) {
    if (m.variance < BLANK_VARIANCE) {
      out.push({
        check: "blank_frame",
        severity: "fail",
        message: `frame ${m.frame} (${m.why}) is blank — luminance variance ${m.variance.toFixed(1)}`,
        target: `frame ${m.frame}`,
      });
      continue;
    }
    if (m.edgeEnergy > 0 && m.centreEnergy / m.edgeEnergy < BLUR_RATIO) {
      out.push({
        check: "subject_blur",
        severity: "fail",
        message: `frame ${m.frame} (${m.why}) has its subject blurrier than its periphery — the depth of field is aimed away from what the shot is framing`,
        target: `frame ${m.frame}`,
      });
    }
  }

  if (typeof heroDelta === "number" && heroDelta < HERO_DELTA) {
    out.push({
      check: "hero_static",
      severity: "fail",
      message: `the hero's before and after frames differ by ${heroDelta.toFixed(2)} — the product appears to have did nothing`,
      target: "beats[].recording",
    });
  }

  return out;
};

export const extractFrames = (mp4, positions, fps, outDir) => {
  const bin = ffmpegBinary();
  if (!bin) return null;
  fs.mkdirSync(outDir, { recursive: true });
  const stamps = framesToTimestamps(positions.map((p) => p.frame), fps);
  const written = [];
  positions.forEach((p, i) => {
    const png = path.join(outDir, `f${String(p.frame).padStart(5, "0")}.png`);
    const args = ["-y", "-ss", stamps[i], "-i", mp4, "-frames:v", "1", png];
    const res = spawnSync(bin, args, { shell: true, stdio: "ignore" });
    if (res.status === 0 && fs.existsSync(png)) written.push({ ...p, png });
  });
  return written;
};
```

- [ ] **Step 5: Add `decodeGray` and `measureFrames`**

PNG decoding without a dependency: re-encode each still to raw grayscale with the same ffmpeg, which avoids writing a PNG decoder. Append to `scripts/lib/extract.mjs`:

```js
/**
 * Grayscale bytes, straight out of ffmpeg.
 *
 * Decoding PNG in-process would mean a dependency; asking ffmpeg for `gray`
 * rawvideo means the pixels arrive as exactly the Uint8Array the measurement
 * functions want, with no format handling anywhere in this repo.
 */
export const decodeGray = (imagePath, w = 480) => {
  const bin = ffmpegBinary();
  if (!bin) return null;
  const h = Math.round((w * 9) / 16);
  const res = spawnSync(
    bin,
    ["-y", "-i", imagePath, "-vf", `scale=${w}:${h}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"],
    { shell: true, maxBuffer: w * h * 4 },
  );
  if (res.status !== 0) return null;
  return { gray: new Uint8Array(res.stdout), w, h };
};

export const measureFrames = (plan, mp4, outDir) => {
  if (!fs.existsSync(mp4)) {
    return [{
      check: "frames",
      severity: "warn",
      message: `no ${mp4} to inspect — render first`,
      target: "output.mp4",
    }];
  }
  if (!ffmpegBinary()) {
    return [{
      check: "frames",
      severity: "warn",
      message: "no ffmpeg available, so frame measurement was skipped — the static checks still ran",
      target: "environment",
    }];
  }

  const positions = samplePositions(plan);
  const stills = extractFrames(mp4, positions, plan.fps, outDir) ?? [];

  const measured = [];
  const decoded = new Map();
  for (const s of stills) {
    const img = decodeGray(s.png);
    if (!img) continue;
    decoded.set(s.frame, img);
    const { variance, mean } = luminanceStats(img.gray, img.w, img.h);
    const centre = { x: Math.round(img.w * 0.3), y: Math.round(img.h * 0.3), w: Math.round(img.w * 0.4), h: Math.round(img.h * 0.4) };
    const centreEnergy = laplacianEnergy(img.gray, img.w, img.h, centre);
    const whole = laplacianEnergy(img.gray, img.w, img.h, { x: 0, y: 0, w: img.w, h: img.h });
    measured.push({ frame: s.frame, why: s.why, variance, mean, centreEnergy, edgeEnergy: whole });
  }

  const before = positions.find((p) => p.why === "hero: before the action");
  const after = positions.find((p) => p.why === "hero: after the action");
  const a = before && decoded.get(before.frame);
  const b = after && decoded.get(after.frame);
  const heroDelta = a && b ? frameDelta(a.gray, b.gray) : undefined;

  return { measured, findings: gradeFrameFindings(measured, { heroDelta }) };
};
```

- [ ] **Step 6: Wire it into `inspect.mjs`**

In `scripts/inspect.mjs`, add the import and extend the CLI block:

```js
import { measureFrames } from "./lib/extract.mjs";
```

Replace the `findings` / write block in the `isMain` section with:

```js
  const findings = runStaticChecks({ plan, theme, files });
  const workDir = path.join(project, ".work");
  fs.mkdirSync(workDir, { recursive: true });

  const frameResult = measureFrames(
    plan,
    path.join(project, "output.mp4"),
    path.join(workDir, "frames"),
  );
  const frameFindings = Array.isArray(frameResult) ? frameResult : frameResult.findings;
  const measured = Array.isArray(frameResult) ? [] : frameResult.measured;

  const all = [...findings, ...frameFindings];
  fs.writeFileSync(
    path.join(workDir, "inspection.json"),
    JSON.stringify({ findings: all, frames: measured }, null, 2),
  );

  if (!all.length) process.stdout.write("inspect: no findings\n");
  for (const f of all) {
    process.stdout.write(`inspect: ${f.severity} ${f.check} — ${f.message}\n  fix: ${f.target}\n`);
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 43 tests total.

- [ ] **Step 8: Run against a real render**

Run:
```bash
cd template && npx remotion render LaunchVideo output.mp4 && cd .. && node scripts/inspect.mjs --project template
```
Expected: `template/.work/frames/` contains PNGs; `template/.work/inspection.json` has a populated `frames` array. Record any findings — do not weaken a threshold to silence one without first opening the named PNG and confirming the frame is actually fine.

- [ ] **Step 9: Sync and commit**

```bash
npm run sync
git add scripts/lib/extract.mjs scripts/inspect.mjs template/scripts/ tests/extract.test.mjs
git commit -m "Extract frames from the render and measure them"
```

---

### Task 8: The `pitchframe-review` skill

The step that reads `inspection.json` and *looks at* `.work/frames/`. This is the first point in the pipeline's life where anything sees the output.

**Files:**
- Create: `skills/pitchframe-review/SKILL.md`
- Modify: `skills/pitchframe/SKILL.md` (pipeline table, step 12)

**Interfaces:**
- Consumes: `.work/inspection.json` (`{ findings: Finding[], frames: Measured[] }`), `.work/frames/*.png`.
- Produces: at most one repair pass, then continues to `archive-run.mjs` regardless.

- [ ] **Step 1: Write the skill**

Create `skills/pitchframe-review/SKILL.md`:

```markdown
---
name: pitchframe-review
description: Inspect a rendered Pitchframe video — run the deterministic checks, then look at sampled frames — and repair at most one round of findings before archiving. Used by Pitchframe step 12, after the render.
---

# Reviewing the render

Nothing in this pipeline used to examine its own output. Every hard-won entry
in CLAUDE.md's gotcha list is a bug that rendered without error and only
appeared in the video. This step is the missing feedback channel.

## Run it

```bash
node pitchframe/scripts/inspect.mjs --project pitchframe
```

Writes `.work/inspection.json` and `.work/frames/*.png`. Exits 0 always — a
post-render check that blocks a founder from a finished video is the wrong
trade.

## Then look at the frames

Read every PNG in `.work/frames/`. The metrics cannot answer the question this
step exists for: **does this read as one moment, or as a tour?** Nor can they
tell you that type is sitting on a busy part of a screenshot, that the logo
landed off-centre, or that the payoff line arrives after the viewer has already
understood the point.

Each frame carries its `why` in `inspection.json` — a beat midpoint, a cut
boundary, the hero's before/after pair. Judge it against what the plan says
should be happening there.

## Repair, once

Findings carry a `target` naming the field to edit. Fix `severity: "fail"`
findings by editing `script.json` and re-cutting, or by editing the named plan
field directly when the fix is a framing number rather than a line.

**One pass.** Then archive whatever you have and report by name anything left
unfixed. An unattended repair loop optimises toward whatever the checker
rewards, which is not the founder's taste — the same reason the judge is
manual and one-shot.

**Do not verify a fix with a single re-render.** Renders are only nearly
deterministic; one run in three differs by ~150 bytes on a static frame. Re-run
`inspect.mjs` and compare findings, not bytes.

## What each finding means

| Check | What went wrong |
|---|---|
| `contiguity` | A beat starts where the previous did not end |
| `one_hero` | Two distinct recordings — two hero moments, neither proven |
| `hero_share` | The hero is under 30% of the runtime |
| `payoff` | No typography beat after the hero |
| `contrast` | Type below 4.5:1 on its own surface — invisible in the video |
| `chrome_framing` | `bleed` and `macos` chrome — the bleed is silently discarded |
| `zoom_blur` | Blur running with the lens disabled |
| `colour_literal` | A colour outside `theme.ts` |
| `blank_frame` | A sampled frame has almost no luminance variance |
| `subject_blur` | The subject is blurrier than its own periphery |
| `hero_static` | The before and after frames are the same — the product did nothing |
```

- [ ] **Step 2: Add the step to the pipeline table**

In `skills/pitchframe/SKILL.md`, the pipeline table currently ends at row 11 (`Render, then file the run`). Split it so review happens between render and archive:

```markdown
| 11 | Render | **agent** `pitchframe-remotion` | `output.mp4` |
| 12 | **Look at it**, repair once | `pitchframe-review` | `.work/inspection.json`, `.work/frames/` |
| 13 | File the run | — | `runs/<product>-<stamp>/` |
```

- [ ] **Step 3: Verify the skill loads**

Run: `node -e "const fs=require('node:fs');const s=fs.readFileSync('skills/pitchframe-review/SKILL.md','utf8');if(!/^---\nname: pitchframe-review\n/.test(s))throw new Error('frontmatter missing');console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add skills/pitchframe-review/SKILL.md skills/pitchframe/SKILL.md
git commit -m "Add the review step that looks at the rendered frames"
```

---

### Task 9: `check-conformance.mjs` — make the direction a contract

`.work/direction.json` is described as binding and is binding by prose alone. Prose is what failed for "be varied", for `bleed`-is-the-default, and for `chrome`.

**Files:**
- Create: `scripts/check-conformance.mjs`
- Create: `tests/conformance.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `conformanceFindings(direction, script, directorNotes): Finding[]` — `directorNotes` is the text of `.work/director.md`.
  - CLI: `node scripts/check-conformance.mjs [--project <dir>]`, **exits 1** on an unexplained deviation.

- [ ] **Step 1: Write the failing test**

Create `tests/conformance.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { conformanceFindings } from "../scripts/check-conformance.mjs";

const direction = { style: "signature", structure: "thesis", type_layout: "stacked", transition: "dissolve" };

test("a script that matches the direction produces no findings", () => {
  const script = { structure: "thesis", type_layout: "stacked", transition: "dissolve" };
  assert.deepEqual(conformanceFindings(direction, script, ""), []);
});

test("an unexplained deviation fails and names the field", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const [f] = conformanceFindings(direction, script, "");
  assert.equal(f.severity, "fail");
  assert.equal(f.target, "structure");
  assert.match(f.message, /thesis.*mosaic/);
});

test("a deviation named in director.md is allowed", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const notes = "Overriding `structure`: the product has three equally load-bearing surfaces and a single thesis beat cannot carry them.";
  assert.deepEqual(conformanceFindings(direction, script, notes), []);
});

test("a note that does not name the deviating field does not excuse it", () => {
  const script = { structure: "mosaic", type_layout: "stacked", transition: "dissolve" };
  const notes = "Overriding `transition`: the product's own UI uses hard cuts.";
  const [f] = conformanceFindings(direction, script, notes);
  assert.equal(f.target, "structure");
});

test("fields absent from the script are not deviations", () => {
  assert.deepEqual(conformanceFindings(direction, { structure: "thesis" }, ""), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/check-conformance.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/check-conformance.mjs`:

```js
#!/usr/bin/env node
/**
 * Holds the Director to the direction.
 *
 * .work/direction.json is described everywhere as binding, and until now was
 * binding by prose. Prose is exactly what failed for "be varied", for
 * bleed-is-the-default and for chrome-defaults-to-macos: when a default
 * contradicts a skill the default wins and nobody notices.
 *
 * A deviation is legal — the Director sees the product and the direction
 * script does not. It just has to be *written down*, naming the field, in
 * .work/director.md. That is the whole contract.
 *
 * Unlike the post-render inspection this exits non-zero, because it runs
 * before capture and voicing: nothing has been spent yet, so stopping costs a
 * re-direct rather than a re-render.
 */

import fs from "node:fs";
import path from "node:path";

/** Fields the direction owns outright. Anything else is the Director's. */
const OWNED = ["style", "structure", "type_layout", "accent_style", "transition", "framing", "music"];

const excused = (field, notes) =>
  new RegExp(`\`?${field}\`?`, "i").test(notes ?? "");

export const conformanceFindings = (direction, script, directorNotes) =>
  OWNED.filter((field) => script[field] !== undefined && script[field] !== direction[field])
    .filter((field) => !excused(field, directorNotes))
    .map((field) => ({
      check: "conformance",
      severity: "fail",
      message: `direction says ${field} is "${direction[field]}" but the script uses "${script[field]}", with no reason in .work/director.md`,
      target: field,
    }));

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();
  const read = (p, fallback) => {
    try { return fs.readFileSync(path.join(project, p), "utf8"); } catch { return fallback; }
  };

  const direction = JSON.parse(read(".work/direction.json", "{}"));
  const script = JSON.parse(read("script.json", "{}"));
  const notes = read(".work/director.md", "");

  const findings = conformanceFindings(direction, script, notes);
  for (const f of findings) {
    process.stderr.write(`conformance: ${f.message}\n`);
  }
  if (findings.length) {
    process.stderr.write(
      `\nEither conform to the direction or write the reason in .work/director.md, naming the field.\n`,
    );
    process.exit(1);
  }
  process.stdout.write("conformance: the script obeys the direction\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 48 tests total.

- [ ] **Step 5: Wire it into the pipeline**

In `skills/pitchframe/SKILL.md`, after the step-6 Director row, add to the "The look is chosen mechanically" section:

```markdown
After the Director writes `script.json`, before anything is captured or voiced:

```bash
node pitchframe/scripts/check-conformance.mjs --project pitchframe
```

Non-zero means the script silently substituted a look. Fix the script, or
write the reason in `.work/director.md` naming the field. Do not proceed —
capture and voicing are the expensive steps, and this runs before both.
```

- [ ] **Step 6: Sync and commit**

```bash
npm run sync
git add scripts/check-conformance.mjs template/scripts/check-conformance.mjs tests/conformance.test.mjs skills/pitchframe/SKILL.md
git commit -m "Make the art direction a checked contract, not a prose one"
```

---

### Task 10: Widen the direction and add the hero shot-count floor

`framing` and `chrome` are left to the Director's free choice, and free choice converged every time. Moving them into `direction.json` also removes the contradiction where `chrome: macos` forces `contained` and undoes `bleed` — the two become one decision.

**Files:**
- Modify: `scripts/art-direction.mjs:197-213` (the `build` function and `signatureOf`)
- Modify: `scripts/lib/checks.mjs` (append `checkHeroShotFloor`)
- Create: `tests/direction.test.mjs`
- Create: `tests/checks-shots.test.mjs`

**Interfaces:**
- Consumes: `Finding` from Task 2.
- Produces:
  - `direction.json` gains `framing: "bleed" | "closeup" | "component" | "contained"` and `chrome: "macos" | "none"`, always consistent with each other.
  - `signatureOf` gains `framing`.
  - `checkHeroShotFloor(plan, fps): Finding[]` — requires `shots.length >= ceil(heroSeconds / 6)`, minimum 1.

- [ ] **Step 1: Write the failing tests**

Create `tests/checks-shots.test.mjs`:

```js
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
  const p = heroPlan(30, undefined);
  const [f] = checkHeroShotFloor(p, 30);
  assert.match(f.message, /1 shot/);
});

test("shots are counted across every beat sharing the recording", () => {
  const p = {
    total_frames: 900,
    fps: 30,
    beats: [
      { id: 1, type: "interaction", frames: [0, 450], recording: "scan", shots: [{ frames: 200 }, { frames: 250 }] },
      { id: 2, type: "interaction", frames: [450, 900], recording: "scan", shots: [{ frames: 150 }, { frames: 150 }, { frames: 150 }] },
    ],
  };
  assert.deepEqual(checkHeroShotFloor(p, 30), []);
});
```

Create `tests/direction.test.mjs`:

```js
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
  const a = { style: "s", structure: "thesis", type_layout: "stacked", hero_progression: ["a"], framing: "bleed" };
  const b = { ...a, framing: "component" };
  assert.notEqual(signatureOf(a), signatureOf(b));
});

test("the same product and rotation always give the same direction", () => {
  const args = { product: "acme", lightUI: false, rotation: 3, tracks: [] };
  assert.deepEqual(buildDirection(args), buildDirection(args));
});

test("a light UI still gets a dark frame", () => {
  const d = buildDirection({ product: "acme", lightUI: true, rotation: 0, tracks: [] });
  assert.ok(["signature", "ambient", "mono", "spectrum"].includes(d.style));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `checkHeroShotFloor is not a function`, and `buildDirection is not exported`.

- [ ] **Step 3: Add the shot floor check**

Append to `scripts/lib/checks.mjs`:

```js
/**
 * A hero held on one framing is the "this was generated" tell.
 *
 * Bigger than colour, bigger than easing. Sixteen samples of a reference
 * launch film gave sixteen different compositions; three Pitchframe videos in
 * a row held one window for thirty seconds and looked like the same video
 * recoloured. The reference films cut every one to three seconds; six is the
 * loosest floor that still forbids the failure.
 *
 * Shots are counted across every beat sharing the recording, because the take
 * is continuous and the beat boundaries are where the narration happened to
 * break, not where the camera did.
 */
export const checkHeroShotFloor = (plan, fps = plan.fps ?? 30) => {
  const hero = heroBeats(plan);
  if (!hero.length) return [];
  const frames = hero.reduce((a, b) => a + (b.frames[1] - b.frames[0]), 0);
  const seconds = frames / fps;
  const shots = hero.reduce((a, b) => a + (b.shots?.length || 1), 0);
  const needed = Math.max(1, Math.ceil(seconds / 6));
  if (shots >= needed) return [];
  return [
    {
      check: "hero_shots",
      severity: "fail",
      message: `the hero runs ${seconds.toFixed(1)}s on ${shots} shot${shots === 1 ? "" : "s"} and needs at least ${needed} — one framing held is the clearest tell that a video was generated`,
      target: "beats[].shots",
    },
  ];
};
```

Add it to `runStaticChecks` in `scripts/inspect.mjs`:

```js
  ...checkHeroShotFloor(plan),
```

with the matching import.

- [ ] **Step 4: Refactor `art-direction.mjs` to export a pure builder**

In `scripts/art-direction.mjs`, replace the `signatureOf` and `build` definitions (currently lines 194–213) with exported, argument-taking versions. The module-level `build(rotation)` call sites below become `buildDirection({ product, lightUI, rotation, tracks: TRACKS })`.

```js
export const signatureOf = (d) =>
  [d.style, d.structure, d.type_layout, d.framing, d.hero_progression.join(">")].join("/");

/**
 * `chrome` and `framing` are one decision, not two.
 *
 * They were two, and the pair is where a default silently reverted a fix:
 * chrome defaulted to macos, chrome forces contained geometry, and the framing
 * work landed and was undone in the same session across three videos. A window
 * whose edges have left the frame is not a window — so the frame decides, and
 * the chrome follows it.
 */
const CHROME_FOR = {
  bleed: "none",
  closeup: "none",
  component: "none",
  contained: "macos",
};

const FRAMINGS = ["bleed", "bleed", "component", "closeup", "contained"];

export const buildDirection = ({ product, lightUI, rotation, tracks }) => {
  const styles = lightUI ? DARK_FRAME : STYLES;
  const direction = {
    product,
    style: pick(styles, rotation * 7),
    structure: pick(["thesis", "thesis", "mosaic"], rotation * 3),
    type_layout: pick(LAYOUTS, rotation * 5),
    accent_style: pick(ACCENTS, rotation * 11),
    transition: pick(TRANSITIONS, rotation * 13),
    framing: pick(FRAMINGS, rotation * 29),
    hero_progression: pick(HERO_PROGRESSIONS, rotation * 2),
    drawn: pick(DRAWN, rotation * 17),
    three_d: pick(THREE_D, rotation * 19),
    music: tracks.length ? pick(tracks, rotation * 23) : null,
  };
  direction.chrome = CHROME_FOR[direction.framing];
  direction.signature = signatureOf(direction);
  return direction;
};
```

Then update the rotation loop to call `buildDirection({ product, lightUI, rotation, tracks: TRACKS })` in both places, and add `framing` and `chrome` to the report block near line 250:

```js
log(`framing      ${direction.framing}, chrome ${direction.chrome}`);
```

**Note:** `FRAMINGS` weights `bleed` twice deliberately — it is the default because it is the opinionated option, and a rotation that reaches `contained` as often as `bleed` would make the most literal look one-in-four.

- [ ] **Step 5: Guard the export against the CLI running on import**

`art-direction.mjs` executes at module scope today. Wrap the file's imperative section (history read, rotation loop, write, report — currently lines 174–263) in the same `isMain` guard used by the other scripts, so importing it in a test does not write `.work/direction.json`:

```js
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  /* … existing history / rotation / write / report code … */
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 57 tests total.

- [ ] **Step 7: Verify the script still runs as a CLI**

Run: `node --check scripts/art-direction.mjs && cd template && node scripts/art-direction.mjs`
Expected: prints the direction report including the new `framing` / `chrome` line, and writes `template/.work/direction.json` containing both keys.

- [ ] **Step 8: Sync and commit**

```bash
npm run sync
git add scripts/art-direction.mjs scripts/lib/checks.mjs scripts/inspect.mjs template/scripts/ tests/direction.test.mjs tests/checks-shots.test.mjs
git commit -m "Give the direction framing and chrome, and put a floor under hero shot count"
```

---

### Task 11: Script checks — the prose-only rules

Four rules currently enforced by paragraphs in skills. A rebuilt component carrying the product's real words is truthful; one carrying invented words is a lie that renders beautifully.

**Files:**
- Create: `scripts/check-script.mjs`
- Create: `tests/check-script.test.mjs`

**Interfaces:**
- Consumes: `Finding` from Task 2.
- Produces:
  - `checkDrawnLabels(script, recon): Finding[]`
  - `checkThesisGrounded(script, recon): Finding[]`
  - `checkGenericCopy(script): Finding[]`
  - `scriptFindings(script, recon): Finding[]`
  - CLI: `node scripts/check-script.mjs [--project <dir>]`, exits 1 on any `fail`.

- [ ] **Step 1: Write the failing test**

Create `tests/check-script.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { checkDrawnLabels, checkThesisGrounded, checkGenericCopy } from "../scripts/check-script.mjs";

const recon = {
  identity: { name: "Acme" },
  copy: ["Run a scan", "Export report", "Share with your team"],
  elements: [{ label: "Run a scan" }, { label: "Export report" }],
};

test("drawn labels taken from recon pass", () => {
  const script = { lines: [{ shot: { render: { archetype: "chips", items: ["Run a scan", "Export report"] } } }] };
  assert.deepEqual(checkDrawnLabels(script, recon), []);
});

test("an invented drawn label fails and quotes it", () => {
  const script = { lines: [{ shot: { render: { archetype: "chips", items: ["Run a scan", "AI Copilot"] } } }] };
  const [f] = checkDrawnLabels(script, recon);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /AI Copilot/);
});

test("a thesis naming something in recon passes", () => {
  assert.deepEqual(checkThesisGrounded({ video_thesis: "One scan and the report is already written." }, recon), []);
});

test("a thesis grounded in nothing fails", () => {
  const [f] = checkThesisGrounded({ video_thesis: "Unlock unprecedented productivity at scale." }, recon);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /names nothing/);
});

test("plain copy passes the register check", () => {
  assert.deepEqual(checkGenericCopy({ lines: [{ vo: "You run the scan. The report writes itself." }] }), []);
});

test("marketing register fails and quotes the offending word", () => {
  const [f] = checkGenericCopy({ lines: [{ vo: "Seamlessly unlock powerful insights." }] });
  assert.equal(f.severity, "fail");
  assert.match(f.message, /Seamlessly|powerful/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/check-script.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/check-script.mjs`:

```js
#!/usr/bin/env node
/**
 * Checks the script before anything is voiced.
 *
 * Rewriting a line here costs one regenerated clip; after the render it costs
 * a re-voice and a re-render. None of these checks make writing good — no
 * check does. They catch the specific failure of copy that reads as generated,
 * and the one that is not a taste question at all: invented words.
 */

import fs from "node:fs";
import path from "node:path";

const reconStrings = (recon) => {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === "string") out.add(v.toLowerCase());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(recon);
  return out;
};

const drawnItems = (script) =>
  (script.lines ?? []).flatMap((l) => l.shot?.render?.items ?? []);

/**
 * A rebuilt component carrying the product's real words is truthful; one
 * carrying invented words is a lie that renders beautifully. This is the only
 * check here that is about honesty rather than craft, which is why it is a
 * fail and not a warning.
 */
export const checkDrawnLabels = (script, recon) => {
  const known = reconStrings(recon);
  return drawnItems(script)
    .filter((item) => !known.has(String(item).toLowerCase()))
    .map((item) => ({
      check: "drawn_label",
      severity: "fail",
      message: `drawn label "${item}" does not appear in .work/recon.json — a rebuilt component with invented words is a lie that renders beautifully`,
      target: "lines[].shot.render.items",
    }));
};

/**
 * The thesis has to name something that exists.
 *
 * "Unlock unprecedented productivity" is a sentence about no product in
 * particular, and a video built on it will be about no product in particular.
 * Grounding is checkable where quality is not: at least one noun phrase from
 * the thesis must appear in what recon actually read off the site.
 */
export const checkThesisGrounded = (script, recon) => {
  const thesis = String(script.video_thesis ?? "");
  const known = [...reconStrings(recon)].filter((s) => s.length > 3);
  const words = thesis.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const grounded = words.some((w) => known.some((k) => k.includes(w)));
  if (grounded) return [];
  return [
    {
      check: "thesis_grounded",
      severity: "fail",
      message: `the thesis "${thesis}" names nothing that appears in recon — a thesis about no product in particular produces a video about no product in particular`,
      target: "video_thesis",
    },
  ];
};

/**
 * The register that reads as generated.
 *
 * Not a style opinion: these are the words that appear when a model is
 * describing a product it has not understood, and they are the tell a founder
 * hears first.
 */
const MARKETING = [
  "seamless", "seamlessly", "effortless", "effortlessly", "powerful",
  "robust", "cutting-edge", "unlock", "leverage", "revolutionize",
  "revolutionise", "game-changing", "unprecedented", "supercharge",
];

export const checkGenericCopy = (script) => {
  const out = [];
  (script.lines ?? []).forEach((line, i) => {
    const vo = String(line.vo ?? "");
    const hits = MARKETING.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(vo));
    if (!hits.length) return;
    out.push({
      check: "generic_copy",
      severity: "fail",
      message: `line ${i} uses ${hits.map((h) => `"${h}"`).join(", ")} — the register a founder hears as generated`,
      target: `lines[${i}].vo`,
    });
  });
  return out;
};

export const scriptFindings = (script, recon) => [
  ...checkDrawnLabels(script, recon),
  ...checkThesisGrounded(script, recon),
  ...checkGenericCopy(script),
];

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const flagIndex = process.argv.indexOf("--project");
  const project = flagIndex > -1 ? process.argv[flagIndex + 1] : process.cwd();
  const read = (p) => {
    try { return JSON.parse(fs.readFileSync(path.join(project, p), "utf8")); } catch { return {}; }
  };

  const findings = scriptFindings(read("script.json"), read(".work/recon.json"));
  for (const f of findings) process.stderr.write(`script: ${f.message}\n  fix: ${f.target}\n`);
  if (findings.some((f) => f.severity === "fail")) process.exit(1);
  process.stdout.write("script: no findings\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 63 tests total.

- [ ] **Step 5: Run it against the shipped script**

Run: `node scripts/check-script.mjs --project template`
Expected: reports findings against `template/script.json`. If `thesis_grounded` fires because `template/.work/recon.json` does not exist, that is correct behaviour for a project with no recon — note it and move on; the pipeline always writes recon at step 1.

- [ ] **Step 6: Sync and commit**

```bash
npm run sync
git add scripts/check-script.mjs template/scripts/check-script.mjs tests/check-script.test.mjs
git commit -m "Check the script before voicing: invented labels, ungrounded thesis, marketing register"
```

---

### Task 12: The pre-render persona pass

The judges move earlier. `/judge-vc` and `/judge-user` stay exactly as they are — manual, post-render, one pass. This adds a text-only pass on `script.json` before `gen-voice.mjs`.

**Files:**
- Modify: `skills/pitchframe-director/SKILL.md` (append a closing section)
- Modify: `skills/pitchframe/SKILL.md` (pipeline table, between steps 6 and 7)

**Interfaces:**
- Consumes: `scripts/check-script.mjs` from Task 11, `scripts/check-conformance.mjs` from Task 9.
- Produces: no new files. The Director rewrites `script.json` in place before capture.

- [ ] **Step 1: Add the gate to the Director skill**

Append to `skills/pitchframe-director/SKILL.md`:

```markdown
## Before you hand the script on

Two checks, in this order. Both run before capture and voicing, which is the
only reason they are cheap: a line rewritten here costs one regenerated clip,
and the same line rewritten after the render costs a re-voice and a re-render.

```bash
node pitchframe/scripts/check-conformance.mjs --project pitchframe
node pitchframe/scripts/check-script.mjs --project pitchframe
```

Neither is advisory. A non-zero exit means fix the script — or, for
conformance only, write the reason in `.work/director.md` naming the field you
overrode.

Then read your own script back once, as two people who are not you:

- **An investor.** Do they know, by the end, why this should exist rather than
  what it does? If any line would make them ask "so what?", rewrite that line.
- **Someone with the problem.** Do they recognise their own situation in the
  first two lines? If the opening is about the product rather than about them,
  rewrite it.

Rewrite at most the lines that fail. This is not a rewrite pass on the whole
script — you wrote it for reasons, and the personas are a check on the weakest
lines, not a mandate to start over.
```

- [ ] **Step 2: Add the row to the pipeline table**

In `skills/pitchframe/SKILL.md`, insert between the Director row (6) and capture row (7):

```markdown
| 6b | **Check the script** — conformance, grounding, register, personas | `pitchframe-director` | edited `script.json` |
```

- [ ] **Step 3: Verify both skills still parse as frontmatter documents**

Run:
```bash
node -e "
const fs = require('node:fs');
for (const p of ['skills/pitchframe-director/SKILL.md','skills/pitchframe/SKILL.md']) {
  const s = fs.readFileSync(p, 'utf8');
  if (!s.startsWith('---\n')) throw new Error(p + ': frontmatter missing');
  if (!/\nname: /.test(s.slice(0, 400))) throw new Error(p + ': no name field');
}
console.log('ok');
"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add skills/pitchframe-director/SKILL.md skills/pitchframe/SKILL.md
git commit -m "Move the persona pass before the voice, where a rewrite is cheap"
```

---

### Task 13: Reconcile the documentation and the schema

`docs/ARCHITECTURE.md` says nine pipeline steps; `skills/pitchframe/SKILL.md` says eleven, and after Task 12 it says thirteen. `plan.json` carries a `structure` key that `ScenePlan` in `types.ts` does not declare — live schema drift in the reference plan, today.

**Files:**
- Modify: `docs/ARCHITECTURE.md:32-47` (the pipeline table)
- Modify: `template/src/lib/types.ts` (add `structure` to `ScenePlan`)
- Modify: `CLAUDE.md` (the invariants table)
- Create: `tests/schema-drift.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `planKeys(planJson): string[]` and `scenePlanKeys(typesSource): string[]`, both exported from `tests/schema-drift.test.mjs`'s helper — kept in the test because they exist only to compare two files.

- [ ] **Step 1: Write the failing test**

Create `tests/schema-drift.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** The top-level keys ScenePlan declares, read out of the type source. */
const scenePlanKeys = (src) => {
  const body = /export type ScenePlan = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
};

test("every key in the shipped plan.json is declared in ScenePlan", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "template", "plan.json"), "utf8"));
  const declared = new Set(scenePlanKeys(fs.readFileSync(path.join(root, "template", "src", "lib", "types.ts"), "utf8")));
  const undeclared = Object.keys(plan).filter((k) => !declared.has(k));
  assert.deepEqual(undeclared, [], `plan.json carries keys ScenePlan does not declare: ${undeclared.join(", ")}`);
});

test("the pipeline step count agrees between ARCHITECTURE.md and the skill", () => {
  const countRows = (src) => {
    const rows = src.match(/^\|\s*\d+[a-z]?\s*\|/gm) ?? [];
    return rows.length;
  };
  const arch = countRows(fs.readFileSync(path.join(root, "docs", "ARCHITECTURE.md"), "utf8"));
  const skill = countRows(fs.readFileSync(path.join(root, "skills", "pitchframe", "SKILL.md"), "utf8"));
  assert.equal(arch, skill, `ARCHITECTURE.md lists ${arch} steps, the skill lists ${skill}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL on both — `plan.json carries keys ScenePlan does not declare: structure`, and a step-count mismatch.

- [ ] **Step 3: Declare `structure` in the type**

In `template/src/lib/types.ts`, inside `export type ScenePlan = {`, after `hero_moment: string;`:

```ts
  /**
   * Which shape the Director chose — `thesis` builds to one moment, `mosaic`
   * gathers several serving one claim. Carried into the plan so conformance
   * can check the video against the direction that was handed to the Director,
   * without re-reading .work/direction.json at render time.
   */
  structure?: "thesis" | "mosaic";
```

- [ ] **Step 4: Rewrite the ARCHITECTURE.md pipeline table**

Replace the table at `docs/ARCHITECTURE.md:36-47` so it matches `skills/pitchframe/SKILL.md` exactly, including the steps added by Tasks 8, 9 and 12:

```markdown
| # | Step | Writes |
|---|---|---|
| 1 | Scout the live site | `.work/recon.json` |
| 2 | Fetch the real logo | `public/assets/logo.*` |
| 3 | Extract the palette | `palette.json` |
| 4 | Choose the look | `.work/direction.json` |
| 5 | Apply it | `src/theme.ts` |
| 6 | **Direct** — write the script *(Opus)* | `script.json`, `.work/director.md` |
| 6b | Check the script — conformance, grounding, register, personas | edited `script.json` |
| 7 | Record what the script names *(Sonnet)* | `assets/<name>/*.jpg` + cursor track |
| 8 | **Voice it** | `public/audio/vo/*.wav`, `.work/voice.json` |
| 9 | **Cut the picture to the voice** | `plan.json` |
| 10 | Score it | `public/audio/*.wav` |
| 11 | Render *(Opus)* | `output.mp4` |
| 12 | **Look at it**, repair once | `.work/inspection.json`, `.work/frames/` |
| 13 | File the run | `runs/<product>-<stamp>/` |
| — | Judge, on request | `.work/judgement.md` → edited `script.json` |
```

- [ ] **Step 5: Update the CLAUDE.md invariants table**

Two rows in the invariants table are now wrong or newly checkable. Replace the `Exactly one interaction beat per plan` row and add the new checks:

```markdown
| Exactly one hero *recording* (not one beat — a take spans several lines) | Two hero moments means neither gets proven | `npm test`, `checkOneHeroRecording` |
| Hero beat ≥ 30% of `total_frames` | Below that it's a feature, not a spine | `npm test`, `checkHeroShare` |
| Hero cut into ≥ `ceil(seconds/6)` shots | One framing held is the "this was generated" tell | `npm test`, `checkHeroShotFloor` |
| The script obeys `.work/direction.json` unless `director.md` names the field | A default that contradicts a skill wins silently | `node scripts/check-conformance.mjs` |
| `template/scripts/` matches `scripts/` | A stale copy runs the old script | `npm run sync` / `npm test` |
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 65 tests total.

- [ ] **Step 7: Typecheck the template**

Run: `cd template && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add docs/ARCHITECTURE.md template/src/lib/types.ts CLAUDE.md tests/schema-drift.test.mjs
git commit -m "Reconcile the docs, declare structure in ScenePlan, and guard both with a test"
```

---

### Task 14: End-to-end verification

The plan is not done until the checks are proven to fire on a real defect and stay quiet on a real success.

**Files:**
- Create: `tests/fixtures/broken-plan.json`
- Create: `tests/end-to-end.test.mjs`

**Interfaces:**
- Consumes: `runStaticChecks` from Task 5, every check from Tasks 2–4 and 10.
- Produces: nothing new.

- [ ] **Step 1: Write the fixture**

Create `tests/fixtures/broken-plan.json` — every defect this plan set out to catch, in one file:

```json
{
  "video_thesis": "Unlock unprecedented productivity at scale.",
  "hero_moment": "clicking scan",
  "duration_seconds": 10,
  "fps": 30,
  "total_frames": 300,
  "beats": [
    { "id": 1, "type": "typography", "frames": [0, 40], "surface": "light", "text": "Before" },
    { "id": 2, "type": "interaction", "frames": [50, 110], "recording": "scan", "framing": "bleed", "chrome": "macos", "zoom": 1, "zoom_blur": 4 },
    { "id": 3, "type": "interaction", "frames": [110, 170], "recording": "export" },
    { "id": 4, "type": "cta", "frames": [170, 280], "url": "https://acme.test" }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/end-to-end.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runStaticChecks } from "../scripts/inspect.mjs";

const root = path.resolve(import.meta.dirname, "..");
const theme = { TEXT: "#ffffff", TEXT_ON_LIGHT: "#ffffff", BACKGROUND: "#0a0a0a" };

test("the broken fixture trips every check it was built to trip", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/broken-plan.json"), "utf8"));
  const checks = new Set(runStaticChecks({ plan, theme, files: {} }).map((f) => f.check));

  for (const expected of [
    "contiguity",     // beat 2 starts at 50, beat 1 ended at 40; last ends at 280 of 300
    "one_hero",       // two recordings: scan and export
    "hero_share",     // 120 of 300 is 40% — passes, so this must NOT be present
    "payoff",         // no typography after the hero
    "contrast",       // TEXT_ON_LIGHT is white on a light surface
    "chrome_framing", // bleed with macos chrome
    "zoom_blur",      // zoom 1 with 4px of blur
    "hero_shots",     // 4 seconds of hero on 2 shots — passes, so must NOT be present
  ].filter((c) => !["hero_share", "hero_shots"].includes(c))) {
    assert.ok(checks.has(expected), `expected the fixture to trip ${expected}`);
  }
});

test("the shipped reference plan trips nothing structural", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "template/plan.json"), "utf8"));
  const themeSrc = fs.readFileSync(path.join(root, "template/src/theme.ts"), "utf8");
  const parsed = Object.fromEntries(
    [...themeSrc.matchAll(/export const ([A-Z_]+) = "(#[0-9a-fA-F]{3,8})"/g)].map((m) => [m[1], m[2]]),
  );
  const findings = runStaticChecks({ plan, theme: parsed, files: {} });
  const structural = findings.filter((f) =>
    ["contiguity", "one_hero", "hero_share", "payoff"].includes(f.check),
  );
  assert.deepEqual(structural, [], JSON.stringify(structural, null, 2));
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS, 67 tests total.

If the second test fails, the shipped reference plan has a real defect. Fix `template/plan.json`, not the check — the reference plan is what every founder's first video is measured against.

- [ ] **Step 4: Full verification sweep**

Run each, and paste the actual output into the commit message:

```bash
npm test
npm run sync && git diff --stat --exit-code
node --check scripts/*.mjs scripts/lib/*.mjs
cd template && npx tsc --noEmit
```

Expected: tests pass; `sync` produces no diff; `node --check` silent; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/broken-plan.json tests/end-to-end.test.mjs
git commit -m "Prove the checks fire on a broken plan and stay quiet on the reference one"
```

---

## Self-review notes

**Spec coverage.** Prerequisite → Task 1. Layer A static half → Tasks 2–5. Layer A frame half → Tasks 6–7. Layer A review step → Task 8. Layer B1 conformance → Task 9. Layer B2 direction widening and B3 shot floor → Task 10. Layer C mechanical checks → Task 11. Layer C persona pass → Task 12. Documentation → Task 13. "How we know it worked" → Task 14.

**Deviation from the spec, recorded here because it changes a check.** The spec said "exactly one `interaction` beat". The shipped `template/plan.json` has five, all sharing `recording: "scan"`, because one spoken line is one beat and a hero take spans several lines — `segment` exists for exactly this. Implemented as one distinct *recording*. Written as specified, the check would fail every real plan.

**Not implemented, and why.** The spec's Layer A lists "edge-region content occupancy" for detecting chrome cropped by `bleed`. It is absent: distinguishing "the toolbar was cropped away" from "this shot is deliberately a `component` lift" needs the source screenshot to compare against, and the comparison is unreliable enough that it would produce false failures on correct videos. The `chrome_framing` check in Task 4 catches the specific configuration that caused the real incident. Revisit with a source-image comparison if the failure recurs.
