import { chromium } from "playwright";
const out = new URL("./shots/", import.meta.url).pathname, U = "http://localhost:8290/web/";
const b = await chromium.launch();
async function shot(name, theme, vp = { width: 1600, height: 1000 }, wait = 2500, early = false, path = "") {
  try {
    const c = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
    await c.addInitScript((t) => { Object.defineProperty(navigator, "webdriver", { get: () => false }); try { localStorage.setItem("trust:theme", t); localStorage.setItem("trust:tour", "done"); } catch {} }, theme);
    const p = await c.newPage();
    await p.goto(U + path, { waitUntil: early ? "commit" : "networkidle", timeout: 15000 });
    await p.waitForTimeout(wait);
    await p.screenshot({ path: out + name + ".png" });
    await c.close(); console.log("ok", name);
  } catch (e) { console.log("fail", name, e.message.slice(0, 80)); }
}
await shot("loading", "light", undefined, 250, true);
await shot("home-day", "light");
await shot("home-night", "dark");
await shot("phone", "light", { width: 390, height: 844 }, 2500, false, "#/c/w3");
await b.close();
