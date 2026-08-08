import { chromium } from "playwright-core";

const exe = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);

const out = await page.evaluate(() => {
  const counts = {};
  const bump = (c, weight) => {
    if (!c) return;
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/);
    if (!m) return;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    const alpha = m[4] === undefined ? 1 : +m[4];
    if (alpha < 0.5) return;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.25 || mx < 40) return; // neutrals and near-blacks are not brand colors
    const key = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    counts[key] = (counts[key] || 0) + weight;
  };

  document.querySelectorAll("*").forEach((el) => {
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    // Weight by painted area: a big filled block says more than a stray icon.
    const area = Math.max(0, Math.min(rect.width, 2000)) * Math.max(0, Math.min(rect.height, 2000));
    bump(s.backgroundColor, 1 + area / 20000);
    bump(s.color, 1);
    bump(s.borderTopColor, 0.5);
  });

  const root = getComputedStyle(document.documentElement);
  const vars = {};
  for (const n of ["--primary", "--accent", "--brand", "--color-primary", "--color-blue"]) {
    const v = root.getPropertyValue(n).trim();
    if (v) vars[n] = v;
  }

  return {
    top: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex, score]) => ({ hex, score: Math.round(score) })),
    vars,
    title: document.title,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
