#!/usr/bin/env node
/**
 * Site reconnaissance — the scout.
 *
 * Pitchframe normally learns what a product is by reading its codebase. Given
 * only a URL there is no codebase, so it has to learn the same things by
 * looking at the site: what it claims to be, and what can actually be done to
 * it in a browser.
 *
 * The second half is the one that matters. The hero moment needs a real
 * element to act on, and until now those selectors were found by reading
 * source. On a site whose source you do not have, they have to be discovered
 * live — which is also strictly more reliable than reading source, because a
 * selector that exists in the DOM right now is a selector that will still
 * exist when the recorder runs a minute later. This runs in codebase mode too
 * for exactly that reason.
 *
 * Judgment stays with the agent. This writes evidence, ranked, and never
 * decides what the video is about.
 *
 *   node scripts/recon.mjs https://example.com
 *
 * Writes .work/recon.json. Never exits non-zero — a partial read is a normal
 * outcome and the pipeline has fallbacks for all of it.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");

const VIEWPORT = { width: 1920, height: 1080 };
const log = (msg) => process.stdout.write(`  ${msg}\n`);

const target = process.argv[2] ?? process.env.PITCHFRAME_URL;
if (!target) {
  log("Usage: node scripts/recon.mjs <url>");
  process.exit(0);
}
const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;

/* ------------------------------------------------------ browser discovery */

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
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
  ],
};

const findBrowser = () => {
  if (process.env.PITCHFRAME_BROWSER && fs.existsSync(process.env.PITCHFRAME_BROWSER)) {
    return process.env.PITCHFRAME_BROWSER;
  }
  return (CANDIDATES[process.platform] ?? []).find((p) => fs.existsSync(p)) ?? null;
};

const write = (result) => {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, "recon.json"), JSON.stringify(result, null, 2));
};

/* ---------------------------------------------------------- in-page probe */

/**
 * Everything below runs inside the page.
 *
 * One `evaluate` rather than many round-trips: each round-trip is a chance for
 * the page to re-render underneath us and invalidate what the last one found.
 */
const PROBE = () => {
  const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const meta = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.content ??
    document.querySelector(`meta[property="${name}"]`)?.content ??
    null;

  /* ------------------------------------------------------------- identity */

  const identity = {
    title: document.title || null,
    site_name: meta("og:site_name"),
    description: meta("description") ?? meta("og:description"),
    theme_color: meta("theme-color"),
    h1: text(document.querySelector("h1")) || null,
    canonical: document.querySelector("link[rel=canonical]")?.href ?? null,
  };

  /**
   * The copy a visitor actually reads first. Headings in document order,
   * capped — a long marketing page has fifty and the tail says nothing the
   * first five did not.
   */
  const headings = [...document.querySelectorAll("h1, h2")]
    .map((el) => text(el))
    .filter((t) => t.length > 2 && t.length < 140)
    .slice(0, 12);

  const nav = [...document.querySelectorAll("nav a, header a")]
    .map((el) => text(el))
    .filter((t) => t && t.length < 30)
    .slice(0, 16);

  /* ------------------------------------------------------------ obstacles */

  const bodyText = (document.body.innerText || "").slice(0, 4000).toLowerCase();
  const obstacles = {
    // A password field on the landing page means the product is behind a wall
    // and the recorder will not get past it without credentials.
    auth_wall: Boolean(document.querySelector('input[type="password"]')),
    consent_banner: /cookie|consent|gdpr/.test(bodyText) &&
      Boolean(
        [...document.querySelectorAll("button, a")].find((el) =>
          /accept|agree|allow|got it/i.test(text(el)),
        ),
      ),
    paywall: /start (your )?free trial|subscribe to continue|upgrade to view/.test(bodyText),
  };

  /* -------------------------------------------------------------- selector */

  /**
   * The most durable selector available for an element.
   *
   * Ordered by how likely each is to survive the site shipping tomorrow.
   * React and CSS-in-JS generate ids like `:r3:` and classes like `css-1x9f`,
   * which change on every build — those are worse than useless because they
   * look specific.
   */
  const selectorFor = (el) => {
    const testid = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id");
    if (testid) return `[data-testid="${testid}"]`;

    /**
     * Framework-generated ids are worse than no id: they look specific and are
     * regenerated on every build.
     *
     * This filter has now been wrong twice, each time by being too literal.
     * First it only excluded React's colon form `:r3:`, and GitHub's Code
     * button came back as `#_r_d_`. Then it excluded leading underscores, and
     * Linear returned `#base-ui-_R_3b9ai86nab6lqa_` — generated, but with a
     * human-looking prefix and no long hex run.
     *
     * So the test is now about *shape* rather than about known prefixes.
     * Hand-written ids are short, mostly alphabetic, and carry at most a digit
     * or two. Anything else is a build artefact whatever it is called.
     */
    const id = el.id ?? "";
    const digits = (id.match(/\d/g) ?? []).length;
    const generated =
      /^[:_]|^\d/.test(id) || // framework prefixes, numeric starts
      /_[rR]_/.test(id) || //    React's internal marker, anywhere
      /[0-9a-f]{6,}/i.test(id) || // hashes
      digits >= 4 || //           hand-written ids do not count that high
      id.length > 30;
    if (id.length > 2 && !generated) return `#${CSS.escape(id)}`;

    const aria = el.getAttribute("aria-label");
    if (aria && aria.length < 40) return `[aria-label="${aria}"]`;

    const label = text(el);
    if (label && label.length < 32) {
      // Playwright's text engine, which the recorder speaks.
      return `${el.tagName.toLowerCase()}:has-text("${label.replace(/"/g, '\\"')}")`;
    }
    return null;
  };

  /* ----------------------------------------------------- interactive scan */

  const inRegion = (el, sel) => Boolean(el.closest(sel));

  const NOISE =
    /sign in|log ?in|sign ?up|register|cookie|privacy|terms|accept|subscribe|newsletter|twitter|linkedin|facebook|github\.com\/?$/i;

  const candidates = [];
  const nodes = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), textarea, [role="button"], [role="tab"], summary',
  );

  for (const el of nodes) {
    const box = el.getBoundingClientRect();
    // Collapsed or invisible elements cannot be filmed.
    if (box.width < 24 || box.height < 16) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    if (box.top > window.innerHeight * 2.5) continue;

    /**
     * Parked off-screen, which `visibility` and `opacity` do not catch.
     *
     * Closed drawers, off-canvas navs and skip-links are laid out at negative
     * coordinates rather than hidden — they are visible in every sense the DOM
     * reports, and a real site returned five of them ranked above its actual
     * content, with coordinates like x = -12.6%. A negative percentage is not
     * a position the recorder can click or the composition can zoom to.
     */
    if (box.right < 8 || box.left > window.innerWidth - 8) continue;
    if (box.bottom < 0) continue;

    const selector = selectorFor(el);
    if (!selector) continue;

    /**
     * The element's *name*, not its text dump.
     *
     * `textContent` concatenates every descendant, so a button showing "Open"
     * with a shortcut badge comes back as "OpenCtrl+O", and an icon button
     * comes back as its tooltip or a keyboard hint. Both are unusable as a
     * label — and once components are rebuilt as vector rather than cropped,
     * an unusable label renders as literal garbage in the video.
     *
     * `aria-label` is authored for exactly this purpose, so it wins when it
     * exists; text is the fallback, with shortcut noise stripped.
     */
    const aria = (el.getAttribute("aria-label") ?? "").trim();
    const raw = aria || text(el) || el.placeholder || "";
    const label = raw
      // "Ctrl+O", "⌘K", "Cmd + Shift + P" trailing a real label.
      .replace(/\s*(?:ctrl|cmd|command|alt|option|shift|⌘|⌥|⇧)\s*\+\s*\S+\s*$/i, "")
      // Single-digit tool hints, as drawing apps put on their toolbars.
      .replace(/\s*\d\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const tag = el.tagName.toLowerCase();
    const isField = tag === "input" || tag === "textarea";

    let score = 0;
    const why = [];

    /**
     * `aria-expanded` and `aria-haspopup` are the strongest signal available.
     * They mean the element's whole purpose is to reveal something — which is
     * the definition of a visible state change, which is the definition of a
     * hero moment. A repo page's Code button is the canonical case.
     */
    if (el.hasAttribute("aria-expanded") || el.hasAttribute("aria-haspopup")) {
      score += 4;
      why.push("opens a panel");
    }
    if (isField) {
      score += 3;
      why.push("accepts typing");
    }
    if (tag === "button" || el.getAttribute("role") === "button") {
      score += 2;
      why.push("button");
    }
    if (el.getAttribute("role") === "tab" || tag === "summary") {
      score += 2;
      why.push("switches view");
    }
    // Main content beats chrome. A nav link navigates away, which ends the
    // shot rather than being the shot.
    if (inRegion(el, "nav, header, footer")) {
      score -= 4;
      why.push("in page chrome");
    }
    if (inRegion(el, "main, [role=main], article")) {
      score += 2;
      why.push("in main content");
    }
    if (box.width * box.height > 12000) score += 1;
    if (box.top < window.innerHeight) {
      score += 1;
      why.push("above the fold");
    }
    if (NOISE.test(label)) {
      score -= 5;
      why.push("boilerplate");
    }

    candidates.push({
      label: label.slice(0, 60),
      tag,
      selector,
      score,
      why,
      // Percentages of the viewport — the same units the plan uses for
      // zoom_target, so these can be copied across without conversion.
      at: {
        x: +(((box.left + box.width / 2) / window.innerWidth) * 100).toFixed(1),
        y: +(((box.top + box.height / 2) / window.innerHeight) * 100).toFixed(1),
      },
      below_fold: box.top > window.innerHeight,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  /* ------------------------------------------------------------ the logo */

  const logoEl =
    document.querySelector('[class*="logo" i] img, [class*="logo" i] svg') ??
    document.querySelector('header a[href="/"] img, header a[href="/"] svg') ??
    document.querySelector("header img, header svg");

  const logo = logoEl
    ? {
        selector: selectorFor(logoEl) ??
          (logoEl.tagName.toLowerCase() === "img" ? "header img" : "header svg"),
        kind: logoEl.tagName.toLowerCase(),
      }
    : null;

  /* --------------------------------------------------------- other routes */

  const routes = [
    ...new Set(
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && h.startsWith("/") && !h.startsWith("//") && h.length < 40),
    ),
  ].slice(0, 20);

  return {
    identity,
    headings,
    nav: [...new Set(nav)],
    obstacles,
    logo,
    routes,
    candidates: candidates.slice(0, 25),
  };
};

/* ------------------------------------------------------------------- main */

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) {
    log("No Chrome, Edge or Chromium found.");
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

  const browser = await chromium.launch({ executablePath, args: ["--hide-scrollbars"] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  try {
    log(`Reading ${url}`);
    // `domcontentloaded`, not `networkidle`: any site with a websocket, an
    // analytics beacon or a streaming response never goes idle.
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const status = response?.status() ?? 0;

    // Client-rendered sites serve an empty shell; wait for real content.
    await page
      .waitForFunction(
        () => document.body && document.body.innerText.trim().length > 60,
        { timeout: 25_000 },
      )
      .catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(1200);

    /**
     * Bot protection, detected before anything else is believed.
     *
     * A challenge page is a real page: it has a title, headings, a button, and
     * it parses perfectly. Recon happily reported `status: "ok"` for
     * claude.ai and handed back "Cloudflare" as the top candidate interaction.
     * Everything downstream would then have planned a video around a security
     * interstitial.
     *
     * The status code alone is not enough — some challenges return 200 — so
     * this checks the code *and* the page's own words.
     */
    const challenged = await page.evaluate(() => {
      const title = document.title || "";
      const body = (document.body?.innerText || "").slice(0, 600);
      const signals = [
        /just a moment/i,
        /attention required/i,
        /checking your browser/i,
        /verify(ing)? you are (a )?human/i,
        /security verification/i,
        /access denied/i,
        /enable javascript and cookies to continue/i,
      ];
      return signals.some((re) => re.test(title) || re.test(body));
    });

    if (challenged || [403, 429, 503].includes(status)) {
      log(`Blocked by bot protection (HTTP ${status}).`);
      write({
        status: "blocked",
        url,
        http_status: status,
        reason:
          "The site is behind bot protection and refuses an automated browser. This is the site working as intended, not a fault to route around.",
        hint:
          "If you own the site, allowlist your IP or run recon against a staging URL or local dev server. If you do not own it, this site cannot be filmed — pick a public surface that permits automation, such as its docs, changelog, or open-source repository.",
      });
      return;
    }

    const found = await page.evaluate(PROBE);

    /**
     * A second pass with the banner dismissed.
     *
     * A consent overlay covers the page and suppresses everything behind it,
     * so the first scan of a site with one is a scan of the banner. Worth the
     * extra few seconds — the alternative is filming a cookie notice.
     */
    let dismissed = null;
    if (found.obstacles.consent_banner) {
      for (const label of ["Accept all", "Accept All", "Allow all", "I agree", "Got it", "Accept"]) {
        try {
          const button = page.getByRole("button", { name: label, exact: false }).first();
          if (await button.isVisible({ timeout: 700 })) {
            await button.click({ timeout: 2500 });
            await page.waitForTimeout(900);
            dismissed = label;
            break;
          }
        } catch {
          /* not this label */
        }
      }
    }
    const result = dismissed ? await page.evaluate(PROBE) : found;

    const best = result.candidates.filter((c) => c.score > 0).slice(0, 8);
    write({
      status: "ok",
      url,
      http_status: status,
      consent_dismissed: dismissed,
      ...result,
      candidates: best,
      /**
       * Deliberately not a decision. The agent picks the hero moment against
       * the thesis; this only reports what the page makes possible, and a
       * script choosing the story is how every video ends up the same.
       */
      note:
        best.length === 0
          ? "No drivable interaction found. This is likely a static marketing page — the video will have to be built from typography and a scroll, which is weaker. Say so rather than pretending a scroll is a hero moment."
          : `${best.length} candidate interactions ranked. Highest: "${best[0].label}" (${best[0].why.join(", ")}).`,
    });

    log(`Found ${best.length} candidate interactions, ${result.headings.length} headings.`);
    if (result.obstacles.auth_wall) log("  warning: password field on the landing page — product may be behind a login.");
    if (best.length === 0) log("  warning: nothing drivable found — static marketing page.");
  } catch (err) {
    log(`Recon failed: ${err?.message ?? err}`);
    write({ status: "failed", url, reason: String(err?.message ?? err) });
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  write({ status: "failed", url, reason: String(err?.stack ?? err) });
  process.exit(0);
});
