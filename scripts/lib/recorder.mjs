/**
 * Screen recording for the hero moment.
 *
 * The hero beat used to be two screenshots — a before and an after — dissolved
 * into each other. That reads as a slideshow, because it is one. This module
 * records the real thing instead: Chrome paints, we collect every painted
 * frame over CDP, and the beat plays back footage of the product actually
 * moving. The app's own easing, its own hover states, its own loading spinner.
 *
 * Two outputs, and the second one is the interesting half:
 *
 *   frames/0001.jpg …   the footage, resampled to an exact fps
 *   <name>.track.json   where the cursor was on every one of those frames
 *
 * The track exists because **a CDP screencast does not contain the cursor**.
 * `mouse.move()` moves an invisible pointer; nothing about it reaches the
 * pixels. The alternative — injecting a fake cursor div into the page — bakes
 * it into the footage at a fixed size, so it goes soft the moment the video
 * zooms, and it can trip the site's own hover handlers. Recording coordinates
 * instead lets Remotion draw the cursor as a real layer: sharp at any zoom,
 * restyleable without recapturing, and the click ripple lands on the exact
 * frame the mouse went down.
 */

import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The cursor decelerates into its target and never travels at constant speed.
 * Linear cursor movement is the single clearest tell that a video was
 * generated rather than recorded, so the tween is eased here, at the source —
 * the recorded track is already correct and Remotion just draws it.
 */
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Max raw frames held in memory. ~300KB each, so this is a ~360MB ceiling. */
const MAX_RAW_FRAMES = 1200;

/* ------------------------------------------------------------------ track */

class Track {
  constructor() {
    this.points = [];
    this.events = [];
    this.startedAt = 0;
  }
  mark(x, y) {
    this.points.push({ t: Date.now(), x, y });
  }
  event(type, x, y) {
    this.events.push({ t: Date.now(), type, x, y });
  }
  /** Last known position, so a new action starts where the last one ended. */
  get last() {
    return this.points.length ? this.points[this.points.length - 1] : null;
  }
}

/* ---------------------------------------------------------------- driving */

/**
 * Moves the pointer along an eased arc, recording as it goes.
 *
 * The arc matters as much as the easing: a human hand does not travel in a
 * straight line between two points. The perpendicular offset peaks mid-travel
 * and returns to zero, so the path bows without ever missing the target.
 */
async function glide(page, track, to, { duration = 750, steps = 30, arc = 26 } = {}) {
  const from = track.last ?? { x: to.x, y: to.y - 260 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular to the direction of travel, so the bow reads the same
  // regardless of which way the cursor is going.
  const perp = { x: -dy / len, y: dx / len };

  for (let i = 1; i <= steps; i++) {
    const e = easeOut(i / steps);
    const bow = Math.sin((i / steps) * Math.PI) * arc;
    const x = from.x + dx * e + perp.x * bow;
    const y = from.y + dy * e + perp.y * bow;
    await page.mouse.move(x, y);
    track.mark(x, y);
    await sleep(duration / steps);
  }
}

/** Viewport-pixel coordinates for an action, from a selector or a percentage. */
async function resolvePoint(page, action, viewport) {
  if (action.selector) {
    const el = page.locator(action.selector).first();
    await el.waitFor({ state: "visible", timeout: action.timeout ?? 15_000 });
    const box = await el.boundingBox();
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  if (action.at) {
    return {
      x: (action.at.x / 100) * viewport.width,
      y: (action.at.y / 100) * viewport.height,
    };
  }
  return null;
}

/**
 * Runs the action script against the live page while the screencast is rolling.
 *
 * Every action is best-effort except `waitFor`: a selector that has moved
 * should cost one beat of the choreography, not the whole recording. But a
 * `waitFor` that times out means the screen we came for never appeared, and
 * recording the wait is worse than failing.
 */
async function performAction(page, track, action, viewport) {
  const timeout = action.timeout ?? 15_000;

  switch (action.type) {
    case "move": {
      const p = await resolvePoint(page, action, viewport);
      if (p) await glide(page, track, p, action);
      break;
    }

    case "click": {
      const p = await resolvePoint(page, action, viewport);
      if (!p) break;
      await glide(page, track, p, action);
      // A beat of stillness on the target before the press. Clicking the
      // instant the cursor lands looks robotic and gives the site's hover
      // state no time to show, which is often half the visible feedback.
      await sleep(action.settleMs ?? 220);
      track.event("down", p.x, p.y);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      track.event("up", p.x, p.y);
      await sleep(action.afterMs ?? 900);
      break;
    }

    case "hover": {
      const p = await resolvePoint(page, action, viewport);
      if (!p) break;
      await glide(page, track, p, action);
      await sleep(action.holdMs ?? 1200);
      break;
    }

    case "drag": {
      const from = await resolvePoint(page, action, viewport);
      const to = action.to
        ? await resolvePoint(page, { selector: action.to.selector, at: action.to }, viewport)
        : null;
      if (!from || !to) break;
      await glide(page, track, from, action);
      await sleep(200);
      track.event("down", from.x, from.y);
      await page.mouse.down();
      // Slower than a move: a drag carries weight, and the whole point of the
      // shot is usually watching the thing being carried.
      await glide(page, track, to, { duration: action.duration ?? 1100, steps: 40, arc: 14 });
      await sleep(180);
      await page.mouse.up();
      track.event("up", to.x, to.y);
      await sleep(action.afterMs ?? 900);
      break;
    }

    case "type": {
      const p = await resolvePoint(page, action, viewport);
      if (p) {
        await glide(page, track, p, action);
        track.event("down", p.x, p.y);
        await page.mouse.down();
        await sleep(70);
        await page.mouse.up();
        track.event("up", p.x, p.y);
        await sleep(260);
      }
      // Per-character, with jitter. A constant delay types like a machine;
      // the variance is what makes the caret look driven by a person.
      const text = action.text ?? "";
      const base = action.delay ?? 55;
      for (const ch of text) {
        await page.keyboard.type(ch);
        await sleep(base + Math.round((ch === " " ? 40 : 0) + Math.abs(hash(ch) % 45)));
      }
      await sleep(action.afterMs ?? 700);
      break;
    }

    case "press":
      await page.keyboard.press(action.key ?? "Enter").catch(() => {});
      await sleep(action.afterMs ?? 900);
      break;

    case "scroll": {
      // Stepped rather than jumped, so the screencast has frames to record.
      // `window.scrollTo` in one call paints once and the tour is a cut.
      const total = action.by ?? 600;
      const steps = action.steps ?? 30;
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, total / steps);
        await sleep((action.duration ?? 900) / steps);
      }
      await sleep(action.afterMs ?? 500);
      break;
    }

    case "waitFor":
      // Deliberately not swallowed — see the note above.
      await page.waitForSelector(action.selector, { timeout, state: "visible" });
      break;

    case "wait":
      await sleep(action.ms ?? 800);
      break;

    default:
      break;
  }
}

/** Cheap deterministic jitter — same text types the same way on every run. */
const hash = (ch) => {
  const c = ch.charCodeAt(0);
  return (c * 2654435761) % 97;
};

/* -------------------------------------------------------------- resampling */

/**
 * Chrome emits a screencast frame when it paints, not on a clock — bursts
 * during animation, nothing at all while the page is still. Remotion needs an
 * exact frame per tick, so we resample: for output frame n, take the last
 * captured frame at or before its timestamp. Static stretches hold, which is
 * exactly right, because the screen really was static.
 */
function resample(raw, fps, startMs, endMs) {
  if (raw.length === 0) return [];
  const out = [];
  const step = 1000 / fps;
  let cursor = 0;
  for (let t = startMs; t <= endMs; t += step) {
    while (cursor + 1 < raw.length && raw[cursor + 1].t <= t) cursor++;
    out.push(raw[cursor]);
  }
  return out;
}

/**
 * Maps the cursor track onto output frames.
 *
 * Between recorded points we interpolate rather than hold: the track is
 * sampled at whatever rate the action loop managed, which is not the video's
 * rate, and holding would make the cursor visibly step.
 */
function resampleTrack(points, fps, startMs, endMs, viewport) {
  const out = [];
  const step = 1000 / fps;
  let i = 0;
  for (let t = startMs; t <= endMs; t += step) {
    while (i + 1 < points.length && points[i + 1].t <= t) i++;
    const a = points[i];
    const b = points[i + 1];
    if (!a) {
      out.push(null);
      continue;
    }
    let x = a.x;
    let y = a.y;
    if (b && b.t > a.t) {
      const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
    }
    // Percentages of the viewport, so the beat can place the cursor over the
    // footage at any panel size or zoom level.
    out.push({
      x: +((x / viewport.width) * 100).toFixed(3),
      y: +((y / viewport.height) * 100).toFixed(3),
    });
  }
  return out;
}

/* ------------------------------------------------------------------- main */

/**
 * Records a page while an action script drives it.
 *
 * Returns a manifest describing the footage, or throws. The caller decides
 * what a failure costs — in capture.mjs, one shot.
 */
export async function record(page, context, options) {
  const {
    name,
    actions = [],
    fps = 30,
    outDir,
    viewport,
    quality = 92,
    leadMs = 400,
    tailMs = 700,
    maxSeconds = 20,
  } = options;

  const framesDir = path.join(outDir, name);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const cdp = await context.newCDPSession(page);
  const raw = [];
  let dropped = 0;

  /**
   * Frames are timestamped on arrival, not by `metadata.timestamp`.
   *
   * The metadata clock is `Network.TimeSinceEpoch` and should agree with
   * `Date.now()`, but the cursor track is stamped with `Date.now()` and a
   * disagreement between the two clocks desynchronises the pointer from the
   * pixels — the most visible possible failure. One clock for both is worth
   * more than a few ms of accuracy on frame timing.
   */
  cdp.on("Page.screencastFrame", (evt) => {
    if (raw.length < MAX_RAW_FRAMES) {
      raw.push({ t: Date.now(), data: evt.data });
    } else {
      dropped++;
    }
    // Chrome stops sending if frames go unacknowledged, so this must happen
    // for every frame including the ones we throw away.
    cdp.send("Page.screencastFrameAck", { sessionId: evt.sessionId }).catch(() => {});
  });

  const track = new Track();
  // Park the pointer off the target before recording starts, so the first
  // move is a real approach rather than a jump from wherever Playwright left
  // the mouse on the previous shot.
  const parkX = viewport.width * 0.5;
  const parkY = viewport.height * 0.88;
  await page.mouse.move(parkX, parkY);
  track.mark(parkX, parkY);

  /**
   * maxWidth/maxHeight are a ceiling, not a request — Chrome emits at the
   * viewport's CSS-pixel size and only ever scales *down* to fit these. Asking
   * for double the viewport does not produce a 2× capture; it just guarantees
   * nothing gets shrunk. Footage resolution is set by the viewport, upstream.
   */
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth: viewport.width * 2,
    maxHeight: viewport.height * 2,
    everyNthFrame: 1,
  });

  const startMs = Date.now();
  // A moment of the resting state before anything moves. Without it the video
  // opens mid-action and the viewer never sees what changed.
  await sleep(leadMs);

  const deadline = startMs + maxSeconds * 1000;
  const performed = [];
  for (const action of actions) {
    if (Date.now() > deadline) {
      performed.push({ ...action, skipped: "recording hit maxSeconds" });
      break;
    }
    try {
      await performAction(page, track, action, viewport);
      performed.push({ type: action.type, ok: true });
    } catch (err) {
      // `waitFor` is the only action that throws out of performAction, and it
      // throwing means the screen never arrived — that ends the recording.
      await cdp.send("Page.stopScreencast").catch(() => {});
      throw new Error(`action ${action.type} failed: ${err?.message ?? err}`);
    }
  }

  await sleep(tailMs);
  const endMs = Date.now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});

  if (raw.length === 0) {
    throw new Error("screencast produced no frames — the page never repainted");
  }

  const picked = resample(raw, fps, startMs, endMs);
  const cursor = resampleTrack(track.points, fps, startMs, endMs, viewport);

  // How much of the footage is genuinely distinct. A recording where every
  // output frame resolves to the same capture is a still, and the beat should
  // know that rather than playing 240 copies of one image.
  const distinct = new Set(picked.map((f) => f.t)).size;

  let width = 0;
  let height = 0;
  picked.forEach((frame, i) => {
    const buf = Buffer.from(frame.data, "base64");
    if (i === 0) ({ width, height } = jpegSize(buf));
    fs.writeFileSync(
      path.join(framesDir, `${String(i + 1).padStart(4, "0")}.jpg`),
      buf,
    );
  });

  const events = track.events.map((e) => ({
    type: e.type,
    frame: Math.max(0, Math.round(((e.t - startMs) / 1000) * fps)),
  }));

  const manifest = {
    name,
    fps,
    frame_count: picked.length,
    width,
    height,
    duration_seconds: +((endMs - startMs) / 1000).toFixed(2),
    distinct_frames: distinct,
    raw_frames: raw.length,
    dropped_frames: dropped,
    cursor,
    events,
    actions: performed,
  };

  fs.writeFileSync(
    path.join(outDir, `${name}.track.json`),
    JSON.stringify(manifest),
  );

  return manifest;
}

/**
 * Reads dimensions out of a JPEG header.
 *
 * Only needed so the composition knows the footage's aspect ratio without
 * decoding a frame, and pulling in an image library for two numbers is a poor
 * trade in a package whose install is meant to be near-instant. Walks the
 * segment markers to the start-of-frame.
 */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0–SOF15, excluding the non-frame markers in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0 };
}
