// node core/shots.mjs '<json>'  ->  screenshots of scenes; json: {url, out, scenes:[{name, file, steps, path}]}
import { chromium } from "playwright";

const job = JSON.parse(process.argv[2]);
const browser = await chromium.launch();
for (const s of job.scenes) {
  // fresh context per scene: the app keeps the last folder in a cookie
  const [w, h] = s.viewport || [1200, 720];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(job.url + "/");
  await page.waitForLoadState("networkidle");
  if (s.path && s.path !== "/") {  // open the folder the way a user would: double-click each part
    for (const part of s.path.split("/").filter(Boolean)) {
      await page.getByText(part, { exact: true }).first().dblclick();
      await page.waitForLoadState("networkidle");
    }
  }
  for (const st of s.steps) {
    if (st.click) await page.getByText(st.click, { exact: true }).first().click();
    if (st.fill) await page.fill(st.fill, st.text);
    if (st.press) await page.keyboard.press(st.press);
    await page.waitForTimeout(400);
  }
  await page.waitForLoadState("networkidle");
  // focus: an element (selector) or a region [x, y, w, h] in CSS pixels; default the whole window
  if (s.focus) await page.locator(s.focus).first().screenshot({ path: `${job.out}/${s.file}` });
  else await page.screenshot({ path: `${job.out}/${s.file}`, clip: s.clip ? { x: s.clip[0], y: s.clip[1], width: s.clip[2], height: s.clip[3] } : undefined });
  await ctx.close();
}
await browser.close();
