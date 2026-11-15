// Records the demo video of trust the dino by driving the real app with Playwright.
//
//   node video/record.mjs            # needs the app on http://localhost:8290 and ffmpeg
//
// Output: video/trust-the-dino.mp4, video/stills/*.png, video/scenes.json (scene start times).
// The app is reset before and after recording (POST /api/reset).

import { chromium } from "../node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP || "http://localhost:8290";
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const W = 1600, H = 900;               // recorded at this size, scaled to 1920×1080 on encode
const RAW = join(HERE, "raw");
const enc = encodeURIComponent;

const reset = () => fetch(APP + "/api/reset", { method: "POST", body: "{}" });

/* ---------- in-page helpers: a visible cursor, the caption bar, the end card ---------- */

function pageHelpers() {
  const css = `
    #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 26px; height: 26px;
      transform: translate(-3px, -2px); transition: opacity .2s; }
    #demo-cursor.down svg { transform: scale(.88); transform-origin: 3px 2px; }
    .demo-ring { position: fixed; z-index: 2147483646; pointer-events: none; width: 36px; height: 36px; margin: -18px 0 0 -18px;
      border: 2px solid #ff5a1f; border-radius: 50%; animation: demo-ring .45s ease-out forwards; }
    @keyframes demo-ring { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.3); opacity: 0 } }
    #demo-cap { position: fixed; left: 50%; bottom: 26px; z-index: 2147483645; pointer-events: none;
      transform: translate(-50%, 8px); opacity: 0; transition: opacity .35s, transform .35s;
      background: #141414; color: #fff; font: 500 25px/1.2 "Helvetica Neue", Helvetica, Arial, sans-serif;
      letter-spacing: -.005em; padding: 13px 24px 14px; border-radius: 9px; white-space: nowrap;
      box-shadow: 0 6px 24px rgba(20,20,20,.25); }
    #demo-cap.on { opacity: 1; transform: translate(-50%, 0); }
    body.demo-nodino .peek { visibility: hidden; }
    #demo-end { position: fixed; inset: 0; z-index: 2147483646; background: #f3f2ee; color: #141414; display: grid;
      place-content: center; text-align: left; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      opacity: 0; transition: opacity .6s; }
    #demo-end.on { opacity: 1; }
    #demo-end h1 { font-size: 88px; letter-spacing: -.035em; margin: 0 0 34px; font-weight: 700; }
    #demo-end h1 i { display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #ff5a1f;
      margin-left: 14px; vertical-align: 14px; }
    #demo-end p { font: 26px/1.6 ui-monospace, "SF Mono", Menlo, monospace; margin: 0; color: #141414; }
    #demo-end p.dim { color: #8a8981; margin-top: 30px; font-size: 20px; letter-spacing: .12em; text-transform: uppercase; }`;
  const add = () => {
    if (document.getElementById("demo-style")) return;
    document.head.append(Object.assign(document.createElement("style"), { id: "demo-style", textContent: css }));
    const cur = Object.assign(document.createElement("div"), { id: "demo-cursor" });
    cur.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.5 15 L18 15 Z"
      fill="#141414" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    cur.style.opacity = "0";
    document.body.append(cur);
    const cap = Object.assign(document.createElement("div"), { id: "demo-cap" });
    document.body.append(cap);
    addEventListener("mousemove", (e) => { cur.style.opacity = "1"; cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      cur.classList.add("down");
      const r = Object.assign(document.createElement("div"), { className: "demo-ring" });
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.append(r); setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
  };
  window.demo = {
    caption(text) {
      const cap = document.getElementById("demo-cap");
      if (!text) return cap.classList.remove("on");
      if (cap.classList.contains("on") && cap.textContent !== text) {
        cap.classList.remove("on");
        setTimeout(() => { cap.textContent = text; cap.classList.add("on"); }, 300);
      } else { cap.textContent = text; cap.classList.add("on"); }
    },
    dino(show) { document.body.classList.toggle("demo-nodino", !show); },
    end() {
      const el = Object.assign(document.createElement("div"), { id: "demo-end" });
      el.innerHTML = `<div><h1>trust the dino<i></i></h1>
        <p>github.com/umarbektokyo/trust-the-dino</p><p>dino.umarbek.dev</p><p class="dim">Built at Junction 2026</p></div>`;
      document.body.append(el);
      document.getElementById("demo-cursor").style.opacity = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
    },
  };
  localStorage.setItem("trust:tour", "done");
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
}

/* ---------- driving the page at a watchable pace ---------- */

let page, t0 = 0;
const mouse = { x: W / 2, y: H / 2 };
const scenes = [];
const now = () => (Date.now() - t0) / 1000;
const wait = (ms) => page.waitForTimeout(ms);
const scene = (name) => { scenes.push({ t: now(), name }); console.log(`${now().toFixed(1)}s  ${name}`); };

// caption on, then hold so it can be read
async function say(text, ms = 3500) { await page.evaluate((t) => window.demo.caption(t), text); if (ms) await wait(ms); }
const dino = (show) => page.evaluate((s) => window.demo.dino(s), show);

// glide the cursor (ease in-out, ~60 fps) to a point or to the center of an element
async function glide(target, { ms = 650, dx = 0, dy = 0 } = {}) {
  let x, y;
  if (typeof target === "string" || target?.boundingBox) {
    const loc = typeof target === "string" ? page.locator(target).first() : target;
    await loc.waitFor({ state: "visible", timeout: 15000 });
    const b = await loc.boundingBox();
    x = b.x + b.width / 2 + dx; y = b.y + b.height / 2 + dy;
  } else [x, y] = target;
  const from = { ...mouse }, n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const k = i / n, e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(16);
  }
  Object.assign(mouse, { x, y });
}
async function click(target, opts) {
  await glide(target, opts);
  await wait(180);
  await page.mouse.down(); await wait(90); await page.mouse.up();
  await wait(350);
}
async function type(text, delay = 45) { await page.keyboard.type(text, { delay }); }
// smooth-scroll a container (or an element into the middle of its container)
async function scrollTo(sel, opts = { block: "center" }) {
  await page.locator(sel).first().evaluate((el, o) => el.scrollIntoView({ ...o, behavior: "smooth" }), opts);
  await wait(900);
}
async function still(name) { await page.screenshot({ path: join(HERE, "stills", name + ".png") }); }

/* ---------- the story ---------- */

async function story() {
  // 1. Home
  scene("Home");
  await dino(true);
  await glide([W * 0.42, H * 0.30], { ms: 900 });
  await say("trust the dino: review agent code as a graph, not a diff.", 3200);

  // 2. Connect vault-demo
  scene("Connect a repository");
  await click("[data-add]");
  await page.locator(".addrepo input[name=url]").fill("");
  await page.locator(".addrepo input[name=url]").focus();
  await say("Connect a repo. Every function becomes a node.", 0);
  await type("https://github.com/umarbektokyo/vault-demo", 40);
  await wait(500);
  await click(".addrepo button.main");
  await page.waitForURL(/#\/p\/vault-demo/, { timeout: 120000 });
  await wait(1200);
  await dino(false);

  // 3. REQ-V8: a visual change, nothing routed
  scene("REQ-V8: a UI change");
  await say("", 0);
  await click(`#nav a.branch[href*="${enc("agent/req-v8-preview-size")}"]`);
  await wait(900);
  await click("#main a.row");
  await wait(900);
  await click(`#nav a.unit[href*="${enc("Preview.svelte:markup")}"]`);
  await say("A UI change: the real app at both commits.", 2000);
  await glide(".scene .pair figure:nth-child(2) img", { ms: 800 });
  await wait(1200);
  await still("1-before-after");
  await click(".scene [data-flip]");
  const ov = page.locator(".scene .overlay").first();
  const b = await ov.boundingBox();
  const oy = b.y + b.height / 2;
  await glide([b.x + b.width * 0.5, oy]);
  await page.mouse.down();
  for (const f of [0.08, 0.92, 0.5]) await glide([b.x + b.width * f, oy], { ms: 900 });
  await page.mouse.up();
  await wait(700);
  await click(`#nav a.branch[href*="${enc("agent/req-v8-preview-size")}"]`);
  await glide("#main a.row .msg", { ms: 700 });
  await say("Nothing risky, so no owner has to stop it.", 2600);

  // 4. REQ-V7: the moved check
  scene("REQ-V7: the moved check");
  await click(`#nav a.branch[href*="${enc("agent/req-v7-glob")}"]`);
  await glide('#main a.row:has-text("server-side glob") .who', { ms: 700 });
  await say("This one waits on Security.", 2600);
  await click('#main a.row:has-text("server-side glob") .msg');
  await page.locator("#main .ln.guard").waitFor();
  await wait(600);
  await scrollTo("#main .ln.guard");
  await glide("#main .ln.guard .note", { ms: 800 });
  await say("One moved check. Its caller names a secrets file.", 3800);
  await still("2-moved-check");
  await glide("#side .ask .ev", { ms: 800 });
  await say("Routed to Aino Virtanen, Team Security, with three lines.", 3800);

  scene("REQ-V7: the tests");
  await glide("#side .box.fail", { ms: 800 });
  await page.mouse.move(mouse.x + 1, mouse.y + 1);           // make sure mouseover fires for the tip
  await say("Nemotron's tests: passed before, fail now.", 3800);
  await still("3-failing-tests");
  await page.locator("#side").evaluate((el) => el.scrollBy({ top: 330, behavior: "smooth" }));
  await wait(700);
  await glide("#side .fcard b", { ms: 800 });
  await say("Each failure says what it expected.", 2400);

  scene("REQ-V7: the leak in the app");
  await click(`#nav a.unit[href*="${enc("FileBrowser.svelte:markup")}"]`);
  await say("The leak, in the real app.", 0);
  await scrollTo('.scene[data-scene="1"]', { block: "start" });
  await click('.scene[data-scene="1"] .pair figure:nth-child(2) img', { ms: 800 });
  await wait(600);
  const z = await page.locator(".zoom img").boundingBox();     // point at .vault-secrets.json in the screenshot
  await glide([z.x + z.width * 0.175, z.y + z.height * 0.345], { ms: 900 });
  await wait(2000);
  await still("4-leak");
  await click(".zoom");
  await say("", 400);

  scene("REQ-V7: sent back");
  await click(`#nav a.unit[href*="${enc("main.go:handleBrowse")}"]`);
  await page.locator("#side").evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(700);
  await glide('#side [data-dec="sent it back"]', { ms: 800 });
  await say("Security sends it back. A human decides, not the model.", 1600);
  await click('#side [data-dec="sent it back"]', { ms: 200 });
  await page.locator("#side .decided").waitFor();
  await wait(1600);

  // 5. The fix
  scene("The fix commit");
  await click('#nav a.commit:has-text("never list dotfiles")');
  await page.locator('#side .box[data-test^="TestTrustGuard_"]').first().waitFor();
  await wait(500);
  await glide('#side .box[data-test^="TestTrustGuard_"]', { ms: 900 });
  await page.mouse.move(mouse.x + 1, mouse.y + 1);
  await say("The fix is proven by the tests written for the bug.", 4200);
  await glide("#bar [data-merge]", { ms: 900 });
  await say("Nothing routed. The approver merges.", 1400);
  await click("#bar [data-merge]", { ms: 200 });
  await page.locator("#bar .done").waitFor();
  await wait(1400);

  // 6. Ask the dino
  scene("Ask the dino");
  await say("", 0);
  await click('#nav a.commit:has-text("server-side glob")');
  await page.locator("#main .ln.guard").waitFor();
  await page.locator("#main").evaluate((el) => el.scrollTo({ top: 0 }));
  await dino(true);
  await wait(400);
  // carry the dino to the right of the caption, then click it
  const body = page.locator(".peek-body");
  const db = await body.boundingBox();
  await glide([db.x + db.width / 2, db.y + db.height / 2], { ms: 900 });
  await glide(body, { ms: 120 });                            // it may have walked a little
  await page.mouse.down();
  await glide([W - 220, H - 160], { ms: 1100 });
  await page.mouse.up();
  await wait(1100);
  await click(".peek-body", { ms: 400 });
  await page.locator(".peek-input").waitFor({ state: "visible" });
  await say("Ask the dino. It answers from the review, never decides.", 0);
  await type("Why did the first commit wait on someone?", 40);
  await wait(300);
  await page.keyboard.press("Enter");
  let answered = true;
  try {
    await page.waitForFunction(() => {
      const m = [...document.querySelectorAll(".peek-msg.assistant")].at(-1);
      return m && !m.classList.contains("pending") && m.textContent !== "…";
    }, null, { timeout: 30000 });
  } catch { answered = false; console.log("dino did not answer in 30 s"); }
  await glide(".peek-log", { ms: 600, dy: 60 });
  await wait(answered ? 4500 : 1500);
  await still("5-dino");
  await page.keyboard.press("Escape");
  await dino(false);

  // 8. End card
  scene("End card");
  await page.evaluate(() => window.demo.end());
  await wait(3500);
  await still("6-end");
}

/* ---------- run, trim, encode ---------- */

async function main() {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(join(HERE, "stills"), { recursive: true });
  await reset();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: RAW, size: { width: W, height: H } } });
  await ctx.addInitScript(pageHelpers);
  const started = Date.now();
  page = await ctx.newPage();
  await page.goto(APP + "/web/#/");
  await page.locator(".home-in h1").waitFor();
  await wait(1200);
  t0 = Date.now();
  const lead = (t0 - started) / 1000;
  try { await story(); }
  catch (e) { await page.screenshot({ path: join(HERE, "raw", "error.png") }).catch(() => {}); throw e; }
  finally {
    await ctx.close(); await browser.close();
    await reset();
  }
  const webm = join(RAW, readdirSync(RAW).find((f) => f.endsWith(".webm")));
  renameSync(webm, join(HERE, "trust-the-dino.webm"));
  const out = join(HERE, "trust-the-dino.mp4");
  execFileSync(FFMPEG, ["-y", "-v", "error", "-ss", lead.toFixed(2), "-i", join(HERE, "trust-the-dino.webm"),
    "-vf", "scale=1920:1080:flags=lanczos,fps=30", "-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-crf", "20", "-movflags", "+faststart", "-an", out], { stdio: "inherit" });
  rmSync(RAW, { recursive: true, force: true });
  writeFileSync(join(HERE, "scenes.json"), JSON.stringify(scenes.map((s) => ({ ...s, t: +s.t.toFixed(1) })), null, 2) + "\n");
  console.log("wrote", out, `(${now().toFixed(1)} s recorded)`);
}

await main();
