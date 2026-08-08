#!/usr/bin/env node
/**
 * Pitchframe UI capture.
 *
 * Reads pitchframe/.work/capture.json, boots the founder's dev server if nothing is
 * already serving, screenshots each requested route, and shuts the server down.
 *
 * Design constraint that shapes everything here: this script must never be the
 * reason a run fails. A partial capture is a normal outcome — the composition
 * renders an abstracted surface for any beat whose screenshot is missing. So every
 * failure below is caught, recorded in capture-result.json, and exited 0.
 *
 * Copied into the founder's project at pitchframe/scripts/capture.mjs.
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { record } from "./lib/recorder.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(PITCHFRAME_DIR, "..");
const WORK_DIR = path.join(PITCHFRAME_DIR, ".work");
const ASSETS_DIR = path.join(PITCHFRAME_DIR, "public", "assets");

const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE = 2;

/**
 * Recording gets its own viewport, and its size is not a style choice.
 *
 * **A CDP screencast emits frames at the CSS-pixel size of the viewport,**
 * ignoring `deviceScaleFactor` entirely — asking for maxWidth 2880 on a 1440
 * viewport still returns 1440. So the viewport is the only lever on footage
 * resolution, and it has to be read as one.
 *
 * 1920×1080 is sized against the composition's default framing, which is
 * `bleed` — the panel is oversized to 2360px so its edges leave the frame,
 * because a screenshot centred in a rounded card with margin on all four sides
 * is the clearest tell that a video was generated. Bleeding costs resolution:
 * 2360 from 1920 is a 1.23× upscale, mild enough that motion hides it.
 *
 * It was 1728 when the panel was a contained 1660px card, which was very
 * slightly *downscaled* and therefore sharper. That was the right number for
 * the wrong composition.
 *
 * 1920 is also the most common desktop width there is, which matters because
 * responsive layouts break at invented sizes.
 *
 * `deviceScaleFactor` stays at 2 even though it does not change the output
 * size: the page renders at 2× and Chrome downsamples into the screencast, so
 * text and icons arrive supersampled instead of aliased, and sites serve their
 * retina image assets.
 */
const RECORD_VIEWPORT = { width: 1920, height: 1080 };
const RECORD_SCALE = 2;
const RECORD_QUALITY = 88;
/**
 * Generous by design. A cold Vite start on a large dependency tree routinely takes
 * two minutes before it opens a port — and a timeout here costs the founder the
 * real-UI capture that is the entire point of the tool.
 */
const SERVER_BOOT_TIMEOUT_MS = 180_000;
const MIN_VALID_PNG_BYTES = 10_000;

const log = (msg) => process.stdout.write(`  ${msg}\n`);

/* ------------------------------------------------------------------ config */

const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

const manifest = readJson(path.join(WORK_DIR, "capture.json"));
if (!manifest || !Array.isArray(manifest.shots) || manifest.shots.length === 0) {
  log("No .work/capture.json with shots — nothing to capture.");
  writeResult({ status: "skipped", reason: "no capture manifest", shots: [] });
  process.exit(0);
}

const pkg = readJson(path.join(PROJECT_ROOT, "package.json"), {});

/* --------------------------------------------------- dev server detection */

/** Framework defaults, checked against the dependency list. */
const FRAMEWORK_PORTS = [
  [/^next$/, 3000],
  [/^nuxt/, 3000],
  [/^@remix-run/, 3000],
  [/^react-scripts$/, 3000],
  [/^@sveltejs\/kit$/, 5173],
  [/^vite$/, 5173],
  [/^astro$/, 4321],
  [/^@angular\/core$/, 4200],
  [/^vue-cli-service$/, 8080],
];

const detectPort = (devScript) => {
  // An explicit --port in the script always wins.
  const explicit = devScript?.match(/(?:--port[= ]|-p )(\d{2,5})/);
  if (explicit) return Number(explicit[1]);

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const [pattern, port] of FRAMEWORK_PORTS) {
    if (Object.keys(deps).some((d) => pattern.test(d))) return port;
  }
  return 3000;
};

const detectDevScript = () => {
  const scripts = pkg.scripts ?? {};
  for (const name of ["dev", "develop", "start:dev", "serve", "start"]) {
    if (scripts[name]) return { name, command: scripts[name] };
  }
  return null;
};

const detectPackageManager = () => {
  const has = (f) => fs.existsSync(path.join(PROJECT_ROOT, f));
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("bun.lockb") || has("bun.lock")) return "bun";
  return "npm";
};

const canConnect = (port, host) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });

/**
 * Checks both stacks, because "localhost" is not one address.
 *
 * Vite binds `localhost`, which on modern Node resolves to ::1 only — a probe that
 * tries 127.0.0.1 alone concludes the server never started and throws away a
 * perfectly good dev server.
 */
const isPortOpen = async (port) => {
  const [v4, v6] = await Promise.all([
    canConnect(port, "127.0.0.1"),
    canConnect(port, "::1"),
  ]);
  return v4 || v6;
};

/**
 * An open socket is not a working server.
 *
 * A crashed or half-shut-down dev server can leave a listener behind that accepts
 * connections and then refuses every request. Reusing one of those wastes the whole
 * capture, so anything we did not start ourselves has to answer an actual request
 * before we trust it.
 */
const respondsToHttp = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.status < 500;
  } catch {
    return false;
  }
};

/**
 * Waits for the dev server, trusting what it says over what we guessed.
 *
 * Dev servers move: Vite silently increments to 5174 when 5173 is taken, Next picks
 * 3001, and a monorepo can put the app somewhere else entirely. Watching stdout for
 * the URL the server prints is the only detection that survives all three, so the
 * guessed port is just the fallback.
 *
 * Returns the port that actually answered, or null.
 */
const waitForServer = async (guessedPort, timeoutMs, announced) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (announced.port && (await isPortOpen(announced.port))) return announced.port;
    if (await isPortOpen(guessedPort)) return guessedPort;
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
};

const URL_IN_OUTPUT = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})/;

/**
 * Dev servers colorize their banners, and Vite puts an escape sequence *inside* the
 * URL — `http://localhost:` ESC[1m `5173`. Strip the codes before matching or the
 * port is invisible.
 */
const ANSI = new RegExp(String.fromCharCode(27) + "\[[0-9;]*m", "g");
const stripAnsi = (s) => String(s).replace(ANSI, "");

/* ------------------------------------------------------ browser discovery */

/**
 * We use playwright-core and drive a browser that is already on the machine.
 * Downloading a 150MB Chromium on first run is the wrong trade for a tool whose
 * whole promise is "one command, three minutes" — and on the demo laptop, Edge
 * is always present.
 */
const CANDIDATE_BROWSERS = {
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
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ],
};

const findBrowser = () => {
  if (process.env.PITCHFRAME_BROWSER && fs.existsSync(process.env.PITCHFRAME_BROWSER)) {
    return process.env.PITCHFRAME_BROWSER;
  }
  for (const candidate of CANDIDATE_BROWSERS[process.platform] ?? []) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

/* -------------------------------------------------------------- readiness */

/**
 * Waits until the page has actually painted something.
 *
 * File size cannot detect a blank page: a solid-black 3840×2160 PNG still
 * compresses to ~29KB, comfortably over any byte threshold. And a cold Vite dev
 * server serves an empty shell immediately, then spends 30–60s optimising deps
 * before the client bundle hydrates — so "the response arrived" means nothing.
 *
 * Asking the DOM whether it has content is the check that actually correlates
 * with "there is something worth photographing".
 */
const waitForRendered = async (page, timeout) => {
  try {
    await page.waitForFunction(
      () => {
        const body = document.body;
        if (!body) return false;
        const text = (body.innerText || "").trim();
        const elements = body.querySelectorAll("*").length;
        const painted = body.getBoundingClientRect().height > 200;
        return painted && (text.length > 20 || elements > 40);
      },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * Decides whether a screenshot actually shows anything.
 *
 * The DOM check above can pass on a skeleton that paints nothing — an app whose
 * shell renders while the client bundle is still compiling has plenty of elements
 * and zero pixels. And file size is useless here: a solid-black 3840×2160 PNG
 * compresses to ~29KB.
 *
 * So we measure the pixels, using the browser we already have open. Downscaled to
 * a thumbnail first, because we want the gist, not accuracy.
 */
const analyzeImage = async (context, buffer) => {
  const page = await context.newPage();
  try {
    const stats = await page.evaluate(async (uri) => {
      const img = new Image();
      img.src = uri;
      await img.decode();

      const w = 200;
      const h = 112;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;

      let sum = 0;
      let sumSq = 0;
      let n = 0;
      const buckets = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += lum;
        sumSq += lum * lum;
        n++;
        buckets.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      }
      const mean = sum / n;
      return {
        mean,
        stdev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
        distinctColors: buckets.size,
      };
    }, `data:image/png;base64,${buffer.toString("base64")}`);
    return stats;
  } catch {
    // If the analysis itself fails, don't punish the shot for it.
    return { mean: 128, stdev: 99, distinctColors: 99 };
  } finally {
    await page.close();
  }
};

const looksBlank = (stats) => stats.stdev < 4 && stats.distinctColors < 10;

/* ---------------------------------------------------------------- actions */

/**
 * Drives the page into the state a shot needs.
 *
 * Every action is best-effort: a selector that no longer exists should cost you
 * one shot, not the run. The exception is `waitFor`, where timing out means the
 * screen you wanted never appeared — that one throws, so the shot is recorded as
 * failed instead of quietly capturing a loading spinner.
 */
async function runActions(page, actions) {
  for (const action of actions) {
    const timeout = action.timeout ?? 15_000;
    switch (action.type) {
      case "click":
        await page.click(action.selector, { timeout }).catch(() => {});
        break;
      case "fill":
        await page.fill(action.selector, action.text ?? "", { timeout }).catch(() => {});
        break;
      case "type":
        await page
          .type(action.selector, action.text ?? "", { delay: action.delay ?? 20, timeout })
          .catch(() => {});
        break;
      case "press":
        await page.keyboard.press(action.key ?? "Enter").catch(() => {});
        break;
      case "hover":
        await page.hover(action.selector, { timeout }).catch(() => {});
        break;
      case "scroll":
        await page.evaluate((y) => window.scrollTo(0, y), action.y ?? 0);
        break;
      case "setFiles": {
        // Feeds a folder or files into a file input, including the hidden
        // `webkitdirectory` inputs behind "Import project" buttons. This is
        // often the only way to show a product in a populated state without
        // signing in, seeding a database, or paying for a model call.
        const target = Array.isArray(action.path) ? action.path : [action.path];
        const resolved = target.map((p) =>
          path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p),
        );
        await page.setInputFiles(action.selector, resolved, { timeout });
        break;
      }
      case "waitFor":
        // Deliberately not swallowed — see the note above.
        await page.waitForSelector(action.selector, { timeout, state: "visible" });
        break;
      case "wait":
        await page.waitForTimeout(action.ms ?? 1000);
        break;
      default:
        break;
    }
  }
}

/**
 * Removes the things that are in the room but not in the product: dev-server
 * overlays, and whatever the founder listed in `hide`.
 *
 * Founder selectors go through Playwright's engine rather than a stylesheet so
 * `:has-text("Not Set")` works — empty-state warnings and "no API key" badges
 * are the most common thing that needs hiding and they are almost never
 * addressable by a clean CSS selector.
 */
async function suppressChrome(page, shot) {
  await page
    .addStyleTag({
      content: `nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
                #nuxt-devtools-anchor, .vite-error-overlay
                { display: none !important; }`,
    })
    .catch(() => {});

  /**
   * Arbitrary CSS, injected before the shot.
   *
   * `omitBackground` only drops the browser's *default* white backdrop. If the
   * page paints its own background — and a dark-themed app always does — that
   * colour is real content, so an element shot comes back opaque and the mark
   * lands in the video inside a visible rectangle of very-slightly-wrong
   * black. The logo beat is where this shows worst, because a wordmark is
   * mostly background.
   *
   * The fix has to be CSS rather than another flag: which ancestor paints the
   * colour differs per app (`html`, `body`, a `#root` wrapper, a theme class),
   * and only the person looking at the page knows which.
   */
  if (shot.css) {
    await page.addStyleTag({ content: shot.css }).catch(() => {});
  }

  for (const selector of shot.hide ?? []) {
    try {
      await page
        .locator(selector)
        .evaluateAll((els) =>
          els.forEach((el) => el.style.setProperty("display", "none", "important")),
        );
    } catch {
      /* a selector that matches nothing is not a failure */
    }
  }
}

/**
 * Dismisses the cookie banner.
 *
 * Recording a live marketing site means recording whatever consent wall the
 * site puts up, and it will sit over the hero moment for the entire take. The
 * text list is deliberately short and generic — this is a best-effort sweep,
 * not a CMP integration, and a founder with an unusual banner can put a real
 * selector in `hide`.
 */
const CONSENT_PATTERNS = [
  "Accept all",
  "Accept All",
  "Allow all",
  "I agree",
  "Got it",
  "Accept cookies",
  "Accept",
];

async function dismissConsent(page) {
  for (const text of CONSENT_PATTERNS) {
    try {
      const button = page.getByRole("button", { name: text, exact: false }).first();
      if (await button.isVisible({ timeout: 700 })) {
        await button.click({ timeout: 2500 });
        await page.waitForTimeout(500);
        return text;
      }
    } catch {
      /* no banner, or it doesn't answer to this label */
    }
  }
  return null;
}

/* -------------------------------------------------------------- reporting */

function writeResult(result) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(WORK_DIR, "capture-result.json"),
    JSON.stringify(result, null, 2),
  );
}

/* ------------------------------------------------------------------- main */

let devServer = null;

const stopDevServer = () => {
  if (!devServer) return;
  try {
    if (process.platform === "win32") {
      // The npm wrapper spawns the real server as a child; kill the tree.
      spawn("taskkill", ["/pid", String(devServer.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-devServer.pid, "SIGTERM");
    }
  } catch {
    /* the server is already gone, which is the outcome we wanted */
  }
  devServer = null;
};

process.on("exit", stopDevServer);
process.on("SIGINT", () => {
  stopDevServer();
  process.exit(0);
});

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  let baseUrl = manifest.baseUrl;
  let startedServer = false;
  const notes = [];

  if (!baseUrl) {
    const dev = detectDevScript();
    const guessedPort = manifest.port ?? detectPort(dev?.command);
    const bootTimeout = manifest.bootTimeoutMs ?? SERVER_BOOT_TIMEOUT_MS;

    const alreadyServing =
      (await isPortOpen(guessedPort)) &&
      (await respondsToHttp(`http://localhost:${guessedPort}`));

    if (alreadyServing) {
      log(`Found a server already running on :${guessedPort} — using it.`);
      notes.push(`reused existing server on :${guessedPort}`);
      baseUrl = `http://localhost:${guessedPort}`;
    } else if (dev || manifest.devCommand) {
      const pm = detectPackageManager();
      const command = manifest.devCommand ?? `${pm} run ${dev.name}`;
      log(`Starting dev server: ${command}`);

      devServer = spawn(command, {
        cwd: PROJECT_ROOT,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      startedServer = true;

      // Believe the server's own announcement over our guess.
      const announced = { port: null };
      const scan = (chunk) => {
        const match = stripAnsi(chunk).match(URL_IN_OUTPUT);
        if (match && !announced.port) {
          announced.port = Number(match[1]);
          log(`Server announced :${announced.port}`);
        }
      };
      devServer.stdout?.on("data", scan);
      devServer.stderr?.on("data", scan);

      const livePort = await waitForServer(guessedPort, bootTimeout, announced);
      if (!livePort) {
        stopDevServer();
        log(`Dev server did not come up within ${Math.round(bootTimeout / 1000)}s.`);
        writeResult({
          status: "failed",
          reason: "dev server did not start",
          hint: "Set baseUrl in .work/capture.json to a deployed URL, raise bootTimeoutMs, or start the server manually and re-run.",
          shots: manifest.shots.map((s) => ({ ...s, ok: false, reason: "no server" })),
        });
        return;
      }
      baseUrl = `http://localhost:${livePort}`;
      log(`Dev server up on :${livePort}`);
    } else {
      log("No dev script found in package.json and no baseUrl given.");
      writeResult({
        status: "failed",
        reason: "no dev server and no baseUrl",
        shots: manifest.shots.map((s) => ({ ...s, ok: false, reason: "no server" })),
      });
      return;
    }
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    log("No Chrome, Edge or Chromium found on this machine.");
    writeResult({
      status: "failed",
      reason: "no browser found",
      hint: "Install Chrome, or set PITCHFRAME_BROWSER to a Chromium executable.",
      shots: manifest.shots.map((s) => ({ ...s, ok: false, reason: "no browser" })),
    });
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    log("playwright-core is not installed in pitchframe/.");
    writeResult({
      status: "failed",
      reason: "playwright-core missing",
      hint: "Run: cd pitchframe && npm install",
      shots: manifest.shots.map((s) => ({ ...s, ok: false, reason: "no playwright" })),
    });
    return;
  }

  const browser = await chromium.launch({
    executablePath,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"],
  });
  /**
   * Cookies from the manifest, seeded into every context before the first
   * navigation.
   *
   * Some starting states are not reachable by URL or by clicking. An app that
   * remembers your model provider in a cookie opens on whichever one it
   * remembers, and driving its custom dropdown to change that is three fragile
   * clicks *before* the take even begins — each one a chance for the run to
   * end up filming a settings menu. Setting the cookie puts the app in the
   * right state on load, deterministically, and leaves `actions` for things
   * that are genuinely part of the story.
   *
   * `url` is filled in from the base URL, so the manifest only carries the
   * name and value.
   */
  const applyCookies = async (ctx) => {
    const cookies = manifest.cookies ?? [];
    if (!cookies.length) return;
    await ctx.addCookies(
      cookies.map((c) => ({ name: c.name, value: String(c.value), url: c.url ?? baseUrl })),
    );
  };

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await applyCookies(context);
  const page = await context.newPage();

  // Kept so a failed shot can say *why* the page was blank. Without this the
  // founder gets "capture failed" and no thread to pull on.
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message).slice(0, 300)));

  const results = [];

  // A cold dev server compiles on first request. Spend that cost on a throwaway
  // navigation so the first real shot isn't the one that photographs a spinner.
  if (startedServer && manifest.warmup !== false) {
    log("Warming the dev server (first compile)...");
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await waitForRendered(page, 90_000);
    } catch {
      /* the shots below will report this properly */
    }
  }

  for (const shot of manifest.shots) {
    const url = new URL(shot.path ?? "/", baseUrl).toString();
    const target = path.join(ASSETS_DIR, shot.name);

    try {
      log(`Capturing ${shot.name} <- ${url}`);
      // Deliberately not `networkidle`: any app with a websocket, an analytics
      // beacon, or a streaming response never goes idle, and waiting for it to
      // means timing out on exactly the modern SaaS products this tool targets.
      // `domcontentloaded` plus the per-shot waitMs is both faster and more robust.
      const response = await page.goto(url, {
        waitUntil: shot.waitUntil ?? "domcontentloaded",
        timeout: shot.gotoTimeoutMs ?? 45_000,
      });

      const status = response?.status() ?? 0;
      if (status >= 400) {
        results.push({ ...shot, ok: false, reason: `HTTP ${status}` });
        log(`  skipped: HTTP ${status}`);
        continue;
      }

      const rendered = await waitForRendered(page, shot.renderTimeoutMs ?? 60_000);
      if (!rendered) {
        results.push({ ...shot, ok: false, reason: "page never rendered content" });
        log("  skipped: page stayed blank");
        continue;
      }

      // Single-page apps keep their best screen behind an interaction — a prompt
      // typed, a tab opened, a scan started. Without this, capture can only ever
      // reach the landing page of exactly the products that most need a video.
      if (Array.isArray(shot.actions)) {
        await runActions(page, shot.actions);
      }

      if (shot.scrollY) {
        await page.evaluate((y) => window.scrollTo(0, y), shot.scrollY);
      }

      // Let fonts and entrance animations settle. Late-loading webfonts are the
      // single most common cause of a screenshot with the wrong typography.
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(shot.waitMs ?? 1200);

      // Hiding happens last, immediately before the shutter.
      //
      // It has to: actions re-render the app, and anything hidden beforehand is
      // rebuilt by React and back on screen by the time the screenshot is taken.
      await suppressChrome(page, shot);

      /**
       * Screen recording: the hero moment as footage.
       *
       * Gets its own context because the recording viewport is deliberately
       * different from the screenshot one (see RECORD_VIEWPORT), and because
       * `reducedMotion: "reduce"` — correct for a still, since it stops a
       * screenshot catching an entrance animation half-finished — would strip
       * out exactly the motion we are here to record.
       */
      if (shot.record) {
        const spec = shot.record === true ? {} : shot.record;
        const stem = shot.name.replace(/\.(png|jpg|mp4)$/i, "");
        const viewport = spec.viewport ?? RECORD_VIEWPORT;
        let recCtx;

        try {
          recCtx = await browser.newContext({
            viewport,
            deviceScaleFactor: spec.scale ?? RECORD_SCALE,
            colorScheme: "dark",
            // Deliberately not reduced: the product's own animation is the
            // thing being photographed.
            reducedMotion: "no-preference",
          });
          await applyCookies(recCtx);
          const recPage = await recCtx.newPage();
          await recPage.goto(url, {
            waitUntil: shot.waitUntil ?? "domcontentloaded",
            timeout: shot.gotoTimeoutMs ?? 45_000,
          });
          const recReady = await waitForRendered(recPage, shot.renderTimeoutMs ?? 60_000);
          if (!recReady) throw new Error("record page never rendered content");

          const consent = await dismissConsent(recPage);
          if (consent) log(`  dismissed consent banner ("${consent}")`);

          // Setup actions run before the shutter — they get the app into the
          // state the hero moment starts from, and nobody wants to watch a
          // login or a navigation.
          if (Array.isArray(shot.actions)) await runActions(recPage, shot.actions);

          await recPage.evaluate(() => document.fonts?.ready);
          await recPage.waitForTimeout(spec.settleMs ?? 900);
          await suppressChrome(recPage, shot);

          const manifest = await record(recPage, recCtx, {
            name: stem,
            actions: spec.actions ?? [],
            fps: spec.fps ?? 30,
            outDir: ASSETS_DIR,
            viewport,
            quality: spec.quality ?? RECORD_QUALITY,
            leadMs: spec.leadMs,
            tailMs: spec.tailMs,
            maxSeconds: spec.maxSeconds ?? 20,
          });

          /**
           * Footage where every output frame resolves to the same capture is a
           * screenshot with extra steps — and it means the actions did nothing
           * visible, which is the same failure the before/after path already
           * rejects. Better to fail here and fall back to stills than to ship
           * a hero beat where the product appears not to respond.
           */
          if (manifest.distinct_frames < 8) {
            throw new Error(
              `recording has only ${manifest.distinct_frames} distinct frames — the actions changed nothing on screen`,
            );
          }

          results.push({
            ...shot,
            ok: true,
            kind: "recording",
            recording: stem,
            frame_count: manifest.frame_count,
            fps: manifest.fps,
            distinct_frames: manifest.distinct_frames,
            dimensions: `${manifest.width}x${manifest.height}`,
            url,
          });
          log(
            `  recorded ${stem}: ${manifest.frame_count} frames @ ${manifest.fps}fps ` +
              `(${manifest.distinct_frames} distinct, ${manifest.duration_seconds}s)`,
          );
        } catch (err) {
          results.push({
            ...shot,
            ok: false,
            kind: "recording",
            reason: `recording: ${err?.message ?? err}`,
            consoleErrors: consoleErrors.slice(-5),
          });
          log(`  recording failed: ${err?.message ?? err}`);
        } finally {
          await recCtx?.close().catch(() => {});
        }
        continue;
      }

      /**
       * Element capture: the logo, cropped to itself.
       *
       * A brand mark screenshotted as part of the page carries the page's
       * background with it, which then sits as a pale rectangle on the video's
       * dark frame. Shooting the element alone with `omitBackground` gives a
       * transparent PNG that composites cleanly onto anything.
       */
      if (shot.element) {
        /**
         * Logos render small — a header mark is often 40px, which is 80px even
         * at 2× and looks soft the moment the video scales it up. So element
         * captures get their own high-DPI context: the browser rasterises the
         * mark at render size × scale, which for an SVG means genuinely more
         * detail rather than an upscale.
         */
        const scale = shot.scale ?? 8;
        let hiCtx;
        try {
          hiCtx = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: scale,
            colorScheme: "dark",
            reducedMotion: "reduce",
          });
          await applyCookies(hiCtx);
          const hiPage = await hiCtx.newPage();
          await hiPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await hiPage.waitForTimeout(shot.waitMs ?? 2000);

          /**
           * The element path had never run this, so `hide` and `css` were
           * silently ignored for exactly the shot that needs them most: a logo
           * comes back opaque unless the page's own background is turned off,
           * because `omitBackground` only drops the browser's default white.
           */
          await suppressChrome(hiPage, shot);

          // Marks are routinely behind something — a collapsed sidebar, a
          // menu, a cookie overlay. Without this the element path could only
          // ever reach logos that happen to be on screen at 1920px.
          if (Array.isArray(shot.actions)) await runActions(hiPage, shot.actions);

          const el = hiPage.locator(shot.element).first();
          await el.waitFor({ state: "visible", timeout: 15_000 });

          /**
           * Refuse to shoot an element parked off-canvas.
           *
           * Playwright reports a drawer's contents as `visible` — they are
           * rendered, just translated out of frame — and `element.screenshot()`
           * then returns whatever pixels occupy that clipped region. On a real
           * site that produced a crisp 8× capture of the hamburger icon
           * labelled as the brand mark: not an error, not blank, just wrong,
           * and it would have gone straight into the video.
           */
          const box = await el.boundingBox();
          if (!box || box.x + box.width < 4 || box.y + box.height < 4) {
            throw new Error(
              `element is off-canvas (x=${Math.round(box?.x ?? NaN)}) — it is probably inside a closed menu or drawer. Add an "actions" step to open it first.`,
            );
          }

          const elBuf = await el.screenshot({
            type: "png",
            omitBackground: shot.omitBackground !== false,
          });
          fs.writeFileSync(target, elBuf);
          results.push({
            ...shot,
            ok: true,
            kind: "element",
            scale,
            bytes: elBuf.length,
            url,
          });
          log(`  captured element ${shot.name} at ${scale}x`);
        } catch (err) {
          results.push({ ...shot, ok: false, reason: `element capture: ${err?.message ?? err}` });
          log(`  element capture failed: ${err?.message ?? err}`);
        } finally {
          await hiCtx?.close().catch(() => {});
        }
        continue;
      }

      // fullPage captures the whole scrollable document rather than the fold.
      // Pair it with a `scroll` spec on the beat: the composition then pans the
      // tall image inside the panel, which shows a whole page in one shot and
      // reads as the product being used rather than photographed.
      const buffer = await page.screenshot({
        type: "png",
        animations: "disabled",
        fullPage: shot.fullPage === true,
      });

      const stats = await analyzeImage(context, buffer);
      if (buffer.length < MIN_VALID_PNG_BYTES || looksBlank(stats)) {
        results.push({
          ...shot,
          ok: false,
          reason: `blank frame (stdev ${stats.stdev.toFixed(1)}, ${stats.distinctColors} colors)`,
          consoleErrors: consoleErrors.slice(-5),
        });
        log(`  discarded: photographed a blank frame`);
        continue;
      }

      /**
       * Interaction capture: the before frame, the action, the after frame.
       *
       * The hero moment of a launch video is almost always an interaction, and
       * the proof is the *change* — so a single screenshot can never carry it.
       * Both frames come from the same page in the same session, which is what
       * makes the state change real rather than two unrelated screens.
       */
      if (shot.interaction) {
        const stem = shot.name.replace(/\.png$/i, "");
        const beforePath = path.join(ASSETS_DIR, `${stem}_before.png`);
        const afterPath = path.join(ASSETS_DIR, `${stem}_after.png`);

        fs.writeFileSync(beforePath, buffer);

        const it = shot.interaction;
        const sel = it.selector;
        try {
          switch (it.type) {
            case "click":
              await page.click(sel, { timeout: 15_000 });
              break;
            case "type":
              await page.fill(sel, it.text ?? "", { timeout: 15_000 });
              break;
            case "hover":
              await page.hover(sel, { timeout: 15_000 });
              break;
            case "drag":
              await page.dragAndDrop(sel, it.to, { timeout: 20_000 });
              break;
            default:
              break;
          }
        } catch (err) {
          results.push({
            ...shot,
            ok: false,
            reason: `interaction failed: ${err?.message ?? err}`,
            consoleErrors: consoleErrors.slice(-5),
          });
          log(`  interaction failed: ${err?.message ?? err}`);
          fs.rmSync(beforePath, { force: true });
          continue;
        }

        await page.waitForTimeout(it.settleMs ?? 1200);
        const afterBuf = await page.screenshot({ type: "png", animations: "disabled" });

        // If nothing changed, the interaction did not do what the plan thinks.
        // A hero beat that dissolves between two identical frames is worse than
        // no hero beat, because it looks like the product did nothing.
        const afterStats = await analyzeImage(context, afterBuf);
        const identical = afterBuf.equals(buffer);
        if (identical || looksBlank(afterStats)) {
          results.push({
            ...shot,
            ok: false,
            reason: identical
              ? "after-state identical to before — the interaction changed nothing on screen"
              : "after-state blank",
          });
          log("  discarded: no visible state change");
          fs.rmSync(beforePath, { force: true });
          continue;
        }

        fs.writeFileSync(afterPath, afterBuf);
        results.push({
          ...shot,
          ok: true,
          kind: "interaction",
          before: `${stem}_before.png`,
          after: `${stem}_after.png`,
          bytes: buffer.length + afterBuf.length,
          url,
        });
        log(`  captured ${stem}_before.png + ${stem}_after.png`);
        continue;
      }

      fs.writeFileSync(target, buffer);
      results.push({ ...shot, ok: true, bytes: buffer.length, url });
    } catch (err) {
      results.push({ ...shot, ok: false, reason: String(err?.message ?? err) });
      log(`  failed: ${err?.message ?? err}`);
    }
  }

  await browser.close();
  stopDevServer();

  const ok = results.filter((r) => r.ok).length;
  log(`Captured ${ok}/${results.length} shots.`);

  writeResult({
    status: ok === results.length ? "ok" : ok > 0 ? "partial" : "failed",
    baseUrl,
    startedServer,
    browser: executablePath,
    notes,
    shots: results,
  });
}

main().catch((err) => {
  stopDevServer();
  writeResult({
    status: "failed",
    reason: String(err?.stack ?? err),
    shots: [],
  });
  // Still exit 0: a capture failure degrades the video, it does not end the run.
  process.exit(0);
});
