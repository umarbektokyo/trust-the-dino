// Captures the real app for the promo: the v9 test run, the v7 routing card, the theme flip.
//   node video/promo/capture.mjs   (app on http://localhost:8290)
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "clips");
const APP = process.env.APP || "http://localhost:8290";
const W = 1600, H = 900;
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

async function ctx(record) {
  const dir = join(OUT, "raw-" + Date.now());
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
    ...(record ? { recordVideo: { dir, size: { width: W, height: H } } } : {}) });
  await c.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { sessionStorage.clear(); if (!localStorage.getItem("promo")) { localStorage.setItem("promo", "1"); localStorage.setItem("trust:tour", "done"); localStorage.setItem("trust:theme", "light"); } } catch {} });
  return { c, dir };
}
async function save({ c, dir }, name) {
  await c.close();
  const f = readdirSync(dir).find((x) => x.endsWith(".webm"));
  renameSync(join(dir, f), join(OUT, name + ".webm"));
  rmSync(dir, { recursive: true, force: true });
}

// 1. connect vault-demo unless it is already there
{
  const { c } = await ctx(false);
  const p = await c.newPage();
  await p.goto(APP + "/web/#/");
  await wait(2500);
  const has = await p.locator('a[href*="#/p/vault-demo"]').count();
  console.log("connected already:", has > 0);
  if (!has) {
    await p.click("[data-add]");
    await p.locator(".addrepo input[name=url]").fill("https://github.com/umarbektokyo/vault-demo");
    await p.click(".addrepo button.main");
    await p.waitForURL(/#\/p\/vault-demo/, { timeout: 180000 });
    await wait(3000);
  }
  await c.close();
}

// 2. the v9 test run
{
  const r = await ctx(true);
  const p = await r.c.newPage();
  await p.goto(APP + "/web/#/c/v9/backend%2Fmain.go%3AsortEntries");
  await wait(16000);
  await p.screenshot({ path: join(OUT, "v9-end.png") });
  await save(r, "v9");
}

// 3. the v7 routing card
{
  const r = await ctx(true);
  const p = await r.c.newPage();
  await p.goto(APP + "/web/#/c/v7/backend%2Fmain.go%3AhandleBrowse");
  await wait(14000);
  await p.screenshot({ path: join(OUT, "v7.png") });
  await save(r, "v7");
}

// 4. the theme flip
{
  const r = await ctx(true);
  const p = await r.c.newPage();
  await p.goto(APP + "/web/#/");
  await wait(3000);
  await p.click("[data-theme-toggle]");
  await wait(4000);
  await p.screenshot({ path: join(OUT, "dark.png") });
  await save(r, "theme");
}
await browser.close();
console.log("done");
