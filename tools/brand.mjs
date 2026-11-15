// The page icon and the link preview: the app's own dino, stargazing under the same dusk sky its shader draws.
//   node tools/brand.mjs   ->  web/favicon.svg, web/icon-180.png, web/og.png
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { frame } from "../web/creature.js";

const INK = "#141414", PLATE = "#9a998f", EYE = "#fbfbf8", PAPER = "#f3f2ee", HOT = "#ff5a1f";
const BANDS = ["#f5a885", "#b37385", "#545480", "#292b47"]; // horizon to top, as in dinofx.js
const bayer = (x, y) => { // 4x4 ordered dither, 0..1
  const b2 = (a, b) => ((a % 2) / 2 + ((b % 2) * (b % 2)) * 0.75) % 1;
  return b2(Math.floor(x / 2), Math.floor(y / 2)) * 0.25 + b2(x, y);
};
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// the sprite, sitting and looking up; its own grey stars are dropped, the sky gets real ones
const sprite = frame({ pose: "stars", t: 3 }).map((row) => row.map((c) => (c === "g" || c === "k" ? "." : c)));
const fill = { o: INK, p: PLATE, e: EYE, w: EYE };

// a pixel scene: w x h cells, the sprite standing on the bottom row at column x0; dome = the sky's shape
function scene(w, h, x0, { dome = true, ground = true } = {}) {
  const sw = sprite[0].length, sh = sprite.length, rects = [];
  const px = (x, y, c) => rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const up = h - 1 - y; // cells above the ground
    const m = dome ? 1 - Math.hypot((x - (x0 + sw / 2)) / (sw / 2 + 9), up / (h - 1)) : 1;
    if (m <= 0 || Math.min(1, m / 0.3) <= bayer(x, y)) continue;
    const t = up / (h - 1);
    const band = Math.max(0, Math.min(3, Math.floor(t * 3.4 + (bayer(x, y) - 0.5) * 0.9 + 0.5)));
    px(x, y, t > 0.38 && hash(x, y) > 0.955 ? EYE : BANDS[band]);
  }
  const top = h - sh - (ground ? 1 : 0); // feet on the ground line, not under it
  sprite.forEach((row, y) => row.forEach((c, x) => { if (fill[c]) px(x0 + x, top + y, fill[c]); }));
  if (ground) for (let x = 0; x < w; x++) px(x, h - 1, INK);
  return { w, h, rects: rects.join("") };
}

const svg = ({ w, h, rects }, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${extra}${rects}</svg>`;

// icon: a square of sky with the dino, cropped tight so it still reads at 16 px
const s = sprite[0].length;
const icon = scene(26, 26, 26 - s + 5, { dome: false, ground: false });
writeFileSync("web/favicon.svg", svg(icon, `<rect width="26" height="26" fill="${BANDS[3]}"/>`));

// link preview, 1200 x 630: the scene on the right, the words on the left
const og = scene(52, 40, 9);
const html = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:${PAPER};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${INK};position:relative;overflow:hidden">
  <div style="position:absolute;right:24px;bottom:0;width:620px;height:625px">${svg(og).replace("<svg ", '<svg width="620" height="625" preserveAspectRatio="xMidYMax meet" ')}</div>
  <div style="position:absolute;left:72px;top:92px;width:500px">
    <div style="font:500 20px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#8a8981">trust the dino</div>
    <div style="font:700 56px/1.05 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-.02em;margin-top:22px">Your agent changed 800 lines.<br>You read <span style="color:${HOT}">3</span>.</div>
    <div style="font:400 24px/1.4 'Helvetica Neue',Helvetica,Arial,sans-serif;color:#4a4a44;margin-top:28px">The dino checks every change, proves the safe ones with tests, and hands you only what needs a human. It never decides for you.</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: "web/og.png" });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<body style="margin:0">${svg(icon, `<rect width="26" height="26" fill="${BANDS[3]}"/>`).replace("<svg ", '<svg width="180" height="180" ')}</body>`);
await page.screenshot({ path: "web/icon-180.png" });
await browser.close();
console.log("web/favicon.svg, web/icon-180.png, web/og.png");
