// Re-shoots docs/review.png, docs/walkthrough.png and docs/fix-commit.png (1440×900 @2x).
//   node tools/screenshots.mjs        # needs the app (vault-demo connected) on APP, default http://localhost:8290/web/
import { chromium } from "../node_modules/playwright/index.mjs";
const APP = process.env.APP || "http://localhost:8290/web/", OUT = new URL("../docs/", import.meta.url).pathname;
const enc = encodeURIComponent, U = enc("backend/main.go:handleBrowse");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript((k) => localStorage.setItem(k, "done"), "trust:tour");
const wait = (ms) => page.waitForTimeout(ms);
// review: v7, hover the first failing box
await page.goto(APP + `#/c/v7/${U}`); await page.locator("#side .box").first().waitFor(); await wait(800);
await page.hover("#side .box.fail"); await wait(500);
await page.screenshot({ path: OUT + "review.png" });
// walkthrough: the step about boxes
await page.mouse.move(700, 450);
await page.click("[data-tour]");
for (let i = 0; i < 30; i++) {
  await wait(450);
  if ((await page.locator(".tour").innerText().catch(() => "")).includes("One box per test")) break;
  await page.click("[data-next]");
}
await wait(900);
await page.screenshot({ path: OUT + "walkthrough.png" });
await page.click("[data-skip]");
// fix commit
await page.goto(APP + `#/c/v7b/${U}`); await page.reload(); await page.locator("#side .box").first().waitFor(); await wait(900);
await page.mouse.move(1300, 700); await wait(400);
await page.screenshot({ path: OUT + "fix-commit.png" });
await b.close();
