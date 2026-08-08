#!/usr/bin/env node
/**
 * Get the product's real logo.
 *
 * Earlier versions screenshotted the mark off the page. That was the wrong
 * instinct twice over: an 8× element capture of a 28px header image is an
 * upscale of an upscale, and it fails outright when the mark sits inside a
 * collapsed drawer — which on one real site produced a crisp, confident
 * capture of the hamburger icon instead.
 *
 * Sites *declare* their mark in several places, and almost all of them beat a
 * screenshot. So this fetches the asset rather than photographing it, trying
 * the highest-fidelity source first:
 *
 *   1. Inline <svg> in the header  → vector. Infinite resolution, exact.
 *   2. Web app manifest icons      → commonly 512px PNG, made to be scaled.
 *   3. <img> whose alt is the brand → its real src, often itself an SVG.
 *   4. apple-touch-icon            → usually 180px+, always present-ish.
 *   5. Element screenshot          → last resort, and only if on screen.
 *
 *   node scripts/fetch-logo.mjs https://example.com
 *
 * Writes public/assets/logo.(svg|png) and .work/logo.json. Never exits
 * non-zero — a video without a mark still ships.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");
const ASSETS_DIR = path.join(PITCHFRAME_DIR, "public", "assets");

const target = process.argv[2] ?? process.env.PITCHFRAME_URL;
if (!target) {
  process.stdout.write("  Usage: node scripts/fetch-logo.mjs <url>\n");
  process.exit(0);
}
const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
const log = (msg) => process.stdout.write(`  ${msg}\n`);

const CANDIDATES = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"],
};
const findBrowser = () =>
  (process.env.PITCHFRAME_BROWSER && fs.existsSync(process.env.PITCHFRAME_BROWSER)
    ? process.env.PITCHFRAME_BROWSER
    : (CANDIDATES[process.platform] ?? []).find((p) => fs.existsSync(p))) ?? null;

const write = (result) => {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, "logo.json"), JSON.stringify(result, null, 2));
};

/* --------------------------------------------------------------- in-page */

/**
 * Collects every declared mark, ranked. Runs in the page so it can read the
 * DOM, resolve relative URLs against the document, and serialize inline SVG.
 */
const COLLECT = (brandHint) => {
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const out = [];

  /* 1. Inline SVG in the header — the best possible source. */
  const svgHosts = [
    'header a[href="/"] svg',
    "header svg",
    '[class*="logo" i] svg',
    'a[href="/"] svg',
    "nav svg",
  ];
  for (const sel of svgHosts) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      // Icons under ~20px are UI glyphs (menus, chevrons), not brand marks.
      if (r.width < 20 || r.height < 12) continue;
      let markup = el.outerHTML;
      if (!/xmlns=/.test(markup)) {
        markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      // `currentColor` resolves to nothing once the SVG leaves the page, so
      // bake in whatever colour it was actually inheriting.
      if (/currentColor/.test(markup)) {
        markup = markup.replace(/currentColor/g, getComputedStyle(el).color);
      }
      if (!/viewBox=/.test(markup) && r.width && r.height) {
        markup = markup.replace(
          "<svg",
          `<svg viewBox="0 0 ${Math.round(r.width)} ${Math.round(r.height)}"`,
        );
      }
      out.push({
        rank: 1,
        kind: "inline-svg",
        markup,
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
      break;
    }
    if (out.length) break;
  }

  /* 2. Web app manifest — icons are authored to be scaled. */
  const manifest = document.querySelector('link[rel="manifest"]')?.href ?? null;

  /* 3. An <img> that names the brand. */
  const imgs = [...document.querySelectorAll("img")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r, alt: el.getAttribute("alt") ?? "", src: el.currentSrc || el.src };
    })
    .filter((c) => c.src && c.r.width >= 24 && c.r.height >= 12);

  const named = imgs.find(
    (c) =>
      (brandHint && c.alt.toLowerCase().includes(brandHint.toLowerCase())) ||
      /logo|wordmark|brand/i.test(c.alt) ||
      /logo|wordmark/i.test(c.src),
  );
  const inHeader = imgs.find((c) => c.el.closest("header, nav") || c.r.top < 140);
  const chosen = named ?? inHeader;
  if (chosen) {
    out.push({
      rank: named ? 3 : 4,
      kind: "img",
      href: abs(chosen.src),
      alt: chosen.alt,
      width: Math.round(chosen.r.width),
      height: Math.round(chosen.r.height),
    });
  }

  /* 4. Touch icon — square, decent size, nearly always present. */
  const touch =
    document.querySelector('link[rel="apple-touch-icon"]') ??
    document.querySelector('link[rel="icon"][sizes]') ??
    document.querySelector('link[rel="icon"]');
  if (touch?.href) {
    out.push({
      rank: 5,
      kind: "touch-icon",
      href: abs(touch.getAttribute("href")),
      sizes: touch.getAttribute("sizes") ?? null,
    });
  }

  return { candidates: out, manifest, brand: document.title };
};

/* ------------------------------------------------------------------ main */

const EXT = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

async function download(href) {
  const res = await fetch(href, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = EXT[type] ?? path.extname(new URL(href).pathname) ?? ".png";
  return { buffer, ext, type };
}

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) {
    write({ status: "failed", url, reason: "no browser" });
    return;
  }
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    write({ status: "failed", url, reason: "playwright-core missing" });
    return;
  }

  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    // Light scheme on purpose: most brands ship their *dark* mark as the
    // default and swap to a light one only under a dark-mode media query. The
    // dark mark on a light plate is the lockup brands actually use.
    colorScheme: "light",
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2500);

    const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    const found = await page.evaluate(COLLECT, host);

    /* Manifest icons are fetched here rather than in-page, so a CORS-blocked
       manifest costs nothing. */
    if (found.manifest) {
      try {
        const res = await fetch(found.manifest, { signal: AbortSignal.timeout(12_000) });
        const manifest = await res.json();
        const icons = (manifest.icons ?? [])
          .map((i) => ({
            href: new URL(i.src, found.manifest).href,
            size: Math.max(...String(i.sizes ?? "0").split(/[x\s]/).map(Number).filter(Boolean), 0),
          }))
          .filter((i) => i.size >= 128)
          .sort((a, b) => b.size - a.size);
        if (icons[0]) {
          found.candidates.push({ rank: 2, kind: "manifest-icon", ...icons[0] });
        }
      } catch {
        /* no manifest, unreadable, or blocked — one rung of five */
      }
    }

    found.candidates.sort((a, b) => a.rank - b.rank);
    if (found.candidates.length === 0) {
      log("No declared logo found.");
      write({ status: "missing", url, reason: "no declared logo on the page" });
      return;
    }

    for (const candidate of found.candidates) {
      try {
        let file;
        let bytes;

        if (candidate.kind === "inline-svg") {
          file = path.join(ASSETS_DIR, "logo.svg");
          fs.writeFileSync(file, candidate.markup, "utf8");
          bytes = Buffer.byteLength(candidate.markup);
        } else {
          const { buffer, ext } = await download(candidate.href);
          // An .ico is a favicon, not a mark — usually 32px and unusable.
          if (ext === ".ico") throw new Error("favicon .ico is too small to use");
          if (buffer.length < 400) throw new Error("asset too small to be a logo");
          file = path.join(ASSETS_DIR, `logo${ext}`);
          fs.writeFileSync(file, buffer);
          bytes = buffer.length;
        }

        const aspect =
          candidate.width && candidate.height ? candidate.width / candidate.height : null;
        const result = {
          status: "ok",
          url,
          file: path.basename(file),
          source: candidate.kind,
          bytes,
          width: candidate.width ?? null,
          height: candidate.height ?? null,
          /**
           * A wide mark is a wordmark — it already contains the product name.
           * Rendering the text wordmark under it prints the name twice, which
           * is the most common way a logo beat looks amateur.
           */
          is_wordmark: aspect !== null && aspect > 2.4,
        };
        write(result);
        log(
          `logo: ${result.file} via ${candidate.kind}` +
            (result.is_wordmark ? " (wordmark — omit the text wordmark)" : "") +
            ` [${(bytes / 1024).toFixed(1)}KB]`,
        );
        return;
      } catch (err) {
        log(`  ${candidate.kind} failed: ${err?.message ?? err}`);
      }
    }

    write({ status: "missing", url, reason: "every candidate failed to download" });
  } catch (err) {
    write({ status: "failed", url, reason: String(err?.message ?? err) });
    log(`Failed: ${err?.message ?? err}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  write({ status: "failed", url, reason: String(err?.stack ?? err) });
  process.exit(0);
});
