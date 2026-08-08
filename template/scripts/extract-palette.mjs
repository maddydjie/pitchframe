#!/usr/bin/env node
/**
 * Palette extraction — data, not description.
 *
 * Three sources, in strict priority order. The first one that yields a usable
 * brand colour wins; later steps are not consulted. That ordering matters:
 * a Tailwind config is a *declaration* of intent, whereas computed styles are
 * an observation that can be confounded by a hero image or a dark section.
 *
 *   1. tailwind.config.{ts,js,mjs,cjs}  → theme.extend.colors      (authoritative)
 *   2. global CSS custom properties     → --primary/--accent/…     (declared)
 *   3. Playwright on the deployed URL   → computed styles          (observed)
 *
 * Output is strict JSON on stdout and written to pitchframe/palette.json:
 *
 *   { background, text, primary, accent, logo_color }
 *
 * No prose, no commentary, no "warm indigo". The renderer consumes hex.
 *
 * Usage:
 *   node pitchframe/scripts/extract-palette.mjs [--url https://example.com]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(PITCHFRAME_DIR, "..");

const argv = process.argv.slice(2);
const urlArg = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : null;

/* ------------------------------------------------------------------ colour */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const toHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

const parseHex = (hex) => {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** hsl() and the bare `222 47% 11%` triplet shadcn writes into :root. */
const hslToHex = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

/** Accepts hex, rgb(), hsl(), or a bare HSL triplet. Returns hex or null. */
const normalizeColor = (raw) => {
  if (!raw) return null;
  const v = String(raw).trim().replace(/;$/, "");

  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    return "#" + parseHex(v).map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  const rgb = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return toHex(+rgb[1], +rgb[2], +rgb[3]);

  const hsl = v.match(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (hsl) return hslToHex(+hsl[1], +hsl[2], +hsl[3]);

  // shadcn bare triplet: "222.2 47.4% 11.2%"
  const bare = v.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (bare) return hslToHex(+bare[1], +bare[2], +bare[3]);

  return null;
};

const saturation = (hex) => {
  const [r, g, b] = parseHex(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

const luminance = (hex) => {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Is this plausibly a brand colour? Neutrals, near-blacks and near-whites are
 * backgrounds and text — they are never the accent, however often they appear.
 */
const isBrandish = (hex) => hex && saturation(hex) >= 0.22 && luminance(hex) > 0.02;

/* ------------------------------------------------- step 1: tailwind config */

const findFile = (names) => {
  for (const n of names) {
    const p = path.join(PROJECT_ROOT, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

/**
 * Pulls colours out of a Tailwind config without executing it.
 *
 * Executing would be more accurate and is not worth it: the file is TypeScript
 * as often as not, it may import a preset, and running arbitrary code from the
 * repo you are making a video about is a bad trade for a few hex values.
 */
const fromTailwind = () => {
  const file = findFile([
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ]);
  if (!file) return null;

  const src = fs.readFileSync(file, "utf8");
  const start = src.search(/colors\s*:\s*\{/);
  if (start === -1) return null;

  // Walk braces from the colors block so nested scales don't truncate it.
  let depth = 0;
  let i = src.indexOf("{", start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = src.slice(from, i + 1);

  const pick = (names) => {
    for (const name of names) {
      // `primary: '#fff'` or `primary: { DEFAULT: '#fff', 500: '#eee' }`
      const direct = block.match(
        new RegExp(`['"\`]?${name}['"\`]?\\s*:\\s*['"\`]([^'"\`]+)['"\`]`, "i"),
      );
      if (direct) {
        const c = normalizeColor(direct[1]);
        if (c) return c;
      }
      const scale = block.match(
        new RegExp(`['"\`]?${name}['"\`]?\\s*:\\s*\\{([\\s\\S]*?)\\}`, "i"),
      );
      if (scale) {
        const inner = scale[1];
        for (const key of ["DEFAULT", "500", "600", "400"]) {
          const m = inner.match(
            new RegExp(`['"\`]?${key}['"\`]?\\s*:\\s*['"\`]([^'"\`]+)['"\`]`),
          );
          if (m) {
            const c = normalizeColor(m[1]);
            if (c) return c;
          }
        }
      }
    }
    return null;
  };

  const primary = pick(["primary", "brand"]);
  const accent = pick(["accent", "secondary"]);
  if (!primary && !accent) return null;

  return {
    source: `tailwind:${path.basename(file)}`,
    background: pick(["background", "bg", "surface"]),
    text: pick(["foreground", "text"]),
    primary,
    accent,
    logo_color: null,
  };
};

/* ------------------------------------------- step 2: CSS custom properties */

const CSS_CANDIDATES = [
  "app/globals.css", "src/app/globals.css", "styles/globals.css",
  "src/styles/globals.css", "app/global.css", "src/index.css",
  "src/App.css", "styles/index.css", "app/styles/globals.css",
  "src/styles/index.css", "assets/css/main.css",
];

const fromCssVars = () => {
  for (const rel of CSS_CANDIDATES) {
    const p = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const css = fs.readFileSync(p, "utf8");

    const readVar = (names) => {
      for (const n of names) {
        const m = css.match(new RegExp(`--${n}\\s*:\\s*([^;]+);`, "i"));
        if (m) {
          const c = normalizeColor(m[1]);
          if (c) return c;
        }
      }
      return null;
    };

    const primary = readVar(["primary", "color-primary", "brand", "color-brand"]);
    const accent = readVar(["accent", "color-accent", "brand-accent"]);
    if (!primary && !accent) continue;

    return {
      source: `css:${rel}`,
      background: readVar(["background", "color-background", "bg"]),
      text: readVar(["foreground", "color-foreground", "text", "color-text"]),
      primary,
      accent,
      logo_color: null,
    };
  }
  return null;
};

/* ------------------------------------------ step 3: computed styles on live */

const fromLiveUrl = async (url) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return null;
  }

  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] ?? [];

  const executablePath =
    process.env.PITCHFRAME_BROWSER ?? candidates.find((p) => fs.existsSync(p));
  if (!executablePath) return null;

  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);

    return await page.evaluate(() => {
      const out = { background: null, text: null, primary: null, accent: null, logo_color: null };
      out.background = getComputedStyle(document.body).backgroundColor;

      /**
       * User-agent defaults. These appear on any page with an unstyled link and
       * are never anybody's brand — but they are frequent and saturated, so a
       * naive frequency count ranks them first every time.
       */
      const UA_DEFAULTS = new Set(["#0000ee", "#0000ff", "#551a8b", "#ee0000", "#00e"]);

      /**
       * Declared custom properties, read off the live page.
       *
       * A site can declare its brand in CSS without any of it surviving into
       * this repo's files — a brand declared as `--color-blue: #4a38f5` is
       * unrecoverable by counting painted pixels when the colour is used
       * mostly on small decorative marks. A declaration beats an
       * observation, so check for one even at this step.
       */
      const declared = {};
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin stylesheet
        }
        for (const rule of Array.from(rules ?? [])) {
          const text = rule.cssText ?? "";
          if (!text.includes("--")) continue;
          const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/g;
          let m;
          while ((m = re.exec(text))) {
            const name = m[1].toLowerCase();
            if (!(name in declared)) declared[name] = m[2].trim();
          }
        }
      }

      const PREFERRED = [
        "primary", "color-primary", "brand", "color-brand", "brand-primary",
        "accent", "color-accent", "theme-primary", "color-blue", "blue",
      ];
      for (const name of PREFERRED) {
        if (declared[name]) {
          out.primary = out.primary ?? declared[name];
          out.accent = out.accent ?? declared[name];
          break;
        }
      }

      // Heading colour: the largest heading actually on the page.
      const heading = [...document.querySelectorAll("h1, h2")]
        .map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) || 0 }))
        .sort((a, b) => b.size - a.size)[0];
      if (heading) out.text = getComputedStyle(heading.el).color;

      /**
       * The primary CTA: the most prominent filled button-like element. Ranked
       * by painted area, because the hero call-to-action is nearly always the
       * biggest filled control above the fold.
       */
      const controls = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')]
        .map((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { el, bg: s.backgroundColor, color: s.color, area: r.width * r.height, top: r.top };
        })
        .filter((c) => c.area > 1500 && c.top < 1600 && !/rgba?\([^)]*,\s*0\s*\)/.test(c.bg));

      controls.sort((a, b) => b.area - a.area);
      const hexOf = (c) => {
        const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)/);
        if (!m) return null;
        return (
          "#" +
          [+m[1], +m[2], +m[3]].map((n) => n.toString(16).padStart(2, "0")).join("")
        );
      };
      const filled = controls.find((c) => {
        const m = c.bg.match(/rgba?\((\d+), ?(\d+), ?(\d+)/);
        if (!m) return false;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (UA_DEFAULTS.has(hexOf(c.bg))) return false;
        return mx > 0 && (mx - mn) / mx >= 0.2; // a coloured button, not a grey one
      });
      if (filled && !out.primary) out.primary = filled.bg;

      // Accent: the most-used saturated colour anywhere, weighted by area.
      const tally = {};
      document.querySelectorAll("*").forEach((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const area = Math.max(0, Math.min(r.width, 1920)) * Math.max(0, Math.min(r.height, 1080));
        for (const c of [s.backgroundColor, s.color]) {
          const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/);
          if (!m) continue;
          if (m[4] !== undefined && +m[4] < 0.5) continue;
          const [rr, gg, bb] = [+m[1], +m[2], +m[3]];
          const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
          if (mx === 0 || (mx - mn) / mx < 0.25) continue;
          const hex =
            "#" + [rr, gg, bb].map((n) => n.toString(16).padStart(2, "0")).join("");
          if (UA_DEFAULTS.has(hex)) continue;
          const key = `${rr},${gg},${bb}`;
          tally[key] = (tally[key] ?? 0) + 1 + area / 20000;
        }
      });
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      if (top && !out.accent) out.accent = `rgb(${top[0]})`;

      // A logo's own colour, when the mark is an inline SVG in the header.
      const logoSvg = document.querySelector("header svg, nav svg, a[href='/'] svg");
      if (logoSvg) {
        const filled2 = logoSvg.querySelector("[fill]:not([fill='none'])");
        if (filled2) out.logo_color = filled2.getAttribute("fill");
      }
      return out;
    });
  } finally {
    await browser.close();
  }
};

/* -------------------------------------------------------------------- main */

const readDeployedUrl = () => {
  if (urlArg) return urlArg;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
    if (typeof pkg.homepage === "string" && /^https?:/.test(pkg.homepage)) return pkg.homepage;
  } catch { /* no package.json is fine */ }
  return null;
};

const main = async () => {
  const attempts = [];

  let result = fromTailwind();
  if (result) attempts.push(result.source);

  if (!result) {
    result = fromCssVars();
    if (result) attempts.push(result.source);
  }

  if (!result) {
    const url = readDeployedUrl();
    if (url) {
      const live = await fromLiveUrl(url);
      if (live) {
        result = { source: `live:${url}`, ...live };
        attempts.push(result.source);
      }
    }
  }

  /**
   * Fallbacks are neutral on purpose. A wrong brand colour is worse than no
   * brand colour: neutral reads as deliberate, wrong reads as a template
   * somebody forgot to configure.
   */
  const norm = (v) => {
    const c = normalizeColor(v);
    return c && c !== "#000000" ? c : null;
  };

  const primary = norm(result?.primary);
  const accent = norm(result?.accent) ?? (isBrandish(primary) ? primary : null);

  const palette = {
    background: norm(result?.background) ?? "#0a0a0f",
    text: norm(result?.text) ?? "#ffffff",
    primary: primary ?? accent ?? "#ffffff",
    accent: isBrandish(accent) ? accent : null,
    logo_color: norm(result?.logo_color),
  };

  const out = path.join(PITCHFRAME_DIR, "palette.json");
  fs.writeFileSync(out, JSON.stringify(palette, null, 2) + "\n");

  process.stderr.write(
    `source: ${attempts.length ? attempts.join(" -> ") : "none (neutral fallback)"}\n`,
  );
  process.stdout.write(JSON.stringify(palette, null, 2) + "\n");
};

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
