// Renders the promo frame by frame: video/promo/promo.mp4 (1920x1080, 30 fps, H.264 + AAC).
//   node video/promo/music.mjs && node video/promo/render.mjs          full film
//   node video/promo/render.mjs --at 1.5,20,33                         test stills into stills/
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..", "..");
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg", FPS = 30;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(req.url.split("?")[0])));
  if (!p.startsWith(ROOT)) return res.writeHead(403).end();
  try { res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }).end(await readFile(p)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page:", e.message));
await page.goto(`http://localhost:${port}/video/promo/index.html`);
await page.waitForFunction(() => window.ready === true);
const shot = () => page.locator("#c").screenshot({ type: "png" });

const at = process.argv.indexOf("--at");
if (at > 0) {
  mkdirSync(join(HERE, "stills"), { recursive: true });
  for (const s of process.argv[at + 1].split(",").map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.locator("#c").screenshot({ path: join(HERE, "stills", `test-${s}.png`) });
  }
} else {
  const dur = await page.evaluate(() => window.DUR), n = Math.round(dur * FPS);
  const ff = spawn(FFMPEG, ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-i", join(HERE, "music.wav"), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", join(HERE, "promo.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("promo.mp4", n, "frames");
}
await browser.close(); server.close();
