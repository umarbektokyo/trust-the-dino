// node presentation/build.mjs -> presentation/index.html, presentation/trust-the-dino.pdf
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { frame } from "../web/creature.js";

const INK = "#141414", PLATE = "#9a998f", EYE = "#fbfbf8", HOT = "#ff5a1f";
const BANDS = ["#f5a885", "#b37385", "#545480", "#292b47"];
const bayer = (x, y) => { const b2 = (a, b) => ((a % 2) / 2 + ((b % 2) * (b % 2)) * 0.75) % 1; return b2(Math.floor(x / 2), Math.floor(y / 2)) * 0.25 + b2(x, y); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const fill = { o: INK, p: PLATE, e: EYE, w: EYE };
function scene(w, h, x0, pose = "stars", sky = true) {
  const sprite = frame({ pose, t: 3 }).map((r) => r.map((c) => (c === "g" || c === "k" ? "." : c)));
  const sw = sprite[0].length, sh = sprite.length, R = [];
  const px = (x, y, c) => R.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
  if (sky) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const up = h - 1 - y, m = 1 - Math.hypot((x - (x0 + sw / 2)) / (sw / 2 + 9), up / (h - 1));
    if (m <= 0 || Math.min(1, m / 0.3) <= bayer(x, y)) continue;
    const t = up / (h - 1), band = Math.max(0, Math.min(3, Math.floor(t * 3.4 + (bayer(x, y) - 0.5) * 0.9 + 0.5)));
    px(x, y, t > 0.38 && hash(x, y) > 0.955 ? EYE : BANDS[band]);
  }
  const top = h - sh - 1;
  sprite.forEach((row, y) => row.forEach((c, x) => { if (fill[c]) px(x0 + x, top + y, fill[c]); }));
  for (let x = 0; x < w; x++) px(x, h - 1, INK);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" width="100%" height="100%" preserveAspectRatio="xMidYMax meet">${R.join("")}</svg>`;
}
const small = (pose) => { const s = frame({ pose, t: 0 }); const R = [];
  s.forEach((row, y) => row.forEach((c, x) => { if (fill[c]) R.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill[c]}"/>`); }));
  return `<svg viewBox="0 0 ${s[0].length} ${s.length}" shape-rendering="crispEdges" width="100%" height="100%">${R.join("")}</svg>`; };

// ---------- pixel backgrounds, 96 x 54 cells of 20 px, as in the promo film ----------
const dfill = { o: INK, p: PLATE, e: EYE, w: EYE, "!": HOT, g: "#8a8981", k: "#8a8981" };
const dino = (pose, { t = 0, signal = false, legs = "stand", col } = {}) => {
  const g = frame({ pose, t, signal, legs }); const R = [];
  g.forEach((row, y) => row.forEach((c, x) => { if (c !== ".") R.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${col && c === "o" ? col : dfill[c] || INK}"/>`); }));
  return `<svg viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges" width="100%" height="100%" preserveAspectRatio="xMidYMax meet">${R.join("")}</svg>`;
};
const CLOUD = ["..xxxx......", ".xxxxxxx.xx.", "xxxxxxxxxxxx"];
function bg(kind, seed = 1) {
  const W = 96, H = 54, R = [], night = kind === "night";
  const px = (x, y, c, w = 1) => R.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`);
  const rnd = (i) => hash(i * 3.1 + seed * 17.7, seed * 5.3 + i);
  if (kind === "dusk") for (let y = 44; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - 44) / 9; if (t * 0.8 <= bayer(x, y)) continue;
    const band = Math.max(0, Math.min(3, Math.floor((1 - t) * 3.4 + (bayer(x, y) - 0.5) * 0.9 + 0.5)));
    px(x, y, BANDS[band]);
  }
  if (night) for (let i = 0; i < 70; i++) { const x = Math.floor(rnd(i) * W), y = Math.floor(rnd(i + 500) * H), c = rnd(i + 900) > 0.9 ? "#8a8981" : "#33332f";
    px(x, y, c); if (rnd(i + 1300) > 0.93) { px(x - 1, y, "#262624"); px(x + 1, y, "#262624"); px(x, y - 1, "#262624"); px(x, y + 1, "#262624"); } }
  const cc = night ? "#1f1f1d" : kind === "dusk" ? "#e8e7e1" : "#e3e2dc";
  for (let i = 0; i < 4; i++) { const cx = Math.floor(rnd(i + 40) * 84), cy = 2 + Math.floor(rnd(i + 60) * 22);
    CLOUD.forEach((row, dy) => [...row].forEach((c, dx) => c === "x" && px(cx + dx, cy + dy, cc))); }
  // rain of diff lines
  const rc = night ? ["#1d1d1b", "#2a1a12"] : ["#e9e8e2", "#f9e2d6"];
  for (let i = 0; i < 26; i++) { const x = Math.floor(rnd(i + 2000) * W), y = Math.floor(rnd(i + 2100) * (kind === "dusk" ? 30 : H));
    px(x, y, rnd(i + 2200) > 0.85 ? rc[1] : rc[0], 2 + Math.floor(rnd(i + 2300) * 6)); }
  if (kind === "day") { const sx = 88, sy = 4; [[1,0,2],[0,1,4],[0,2,4],[1,3,2]].forEach(([dx, dy, w]) => px(sx + dx, sy + dy, "#c9c8c0", w)); }
  return `<svg class="bg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" preserveAspectRatio="none">${R.join("")}</svg>`;
}

const h = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const slides = [];
const S = (cls, body, { n = true, sky = null, seed } = {}) => slides.push(`<section class="${cls}${sky === "night" ? " night" : ""}">${sky ? bg(sky, seed ?? slides.length + 1) : ""}<div class="in">${body}</div>${n ? `<div class="pg">${String(slides.length + 1).padStart(2, "0")}</div>` : ""}</section>`);
const THREE = [["215", 'filepath.Join(absContentRoot, ".vault-secrets.json"),'], ["216", "cfg.HMACSecret,"], ["221", 'mux.HandleFunc("/api/browse", handleBrowse(absContentRoot, secrets))']];

// ===== opening =====
S("title", `<div class="lbl">trust the dino</div>
<h1 class="xl">Your agent changed<br>800 lines.<br>You read <b class="hot">3</b>.</h1>
<p class="sub">A code-understanding engine that checks every change, proves the safe ones with tests, and hands you only what needs a human.</p>
<div class="sky">${scene(60, 46, 14)}</div>`, { n: false, sky: "dusk" });

S("center", `<div class="type">code review.<span class="cur"></span></div>`, { sky: "day" });

S("", `<div class="lbl">how review used to look</div>
<h1>The diff grew. The reader didn't.</h1>
<div class="three"><figure><img src="../video/promo/stills/02-eras-a.png"><figcaption>terminal diff</figcaption></figure>
<figure><img src="../video/promo/stills/02-eras-b.png"><figcaption>web diff</figcaption></figure>
<figure><img src="../video/promo/stills/02-eras-c.png"><figcaption>a wall of bot comments</figcaption></figure></div>`, { sky: "day" });

S("", `<div class="lbl">REQ-V7 · add a glob filter</div>
<h1>Every test green.<br><span class="hot">Still leaked.</span></h1>
<div class="cols"><div><p class="body">Eight lines in one handler. Every existing test passes, including the one that says hidden files are never listed.</p>
<pre class="code">GET /api/browse?match=*
→ <span class="hot">.vault-secrets.json</span></pre>
<p class="body m">No test ever sent a <code>*</code>.</p></div>
<img class="shot" src="../dossier/shots/v7/after-filter_star.png"></div>`, { sky: "day" });

S("", `<div class="lbl">what reaches you</div>
<h1>Read <span class="hot">3</span> lines, not 800.</h1>
<div class="three-lines">${THREE.map(([n, l]) => `<div><span class="ln">newMux:${n}</span>${h(l)}</div>`).join("")}</div>
<p class="body">The caller names a secret. The check that hid it now runs in fewer cases. That is all a person needs to see.</p>`, { sky: "dusk" });

S("", `<div class="lbl">meet the dino</div>
<h1>It reads the code so you don't.</h1>
<div class="poses">${[["stand", "walk", { legs: "a" }], ["type", "type", { t: 1 }], ["read", "read", { t: 1 }], ["coffee", "coffee", { t: 1 }], ["stars", "stargaze", { t: 3 }], ["sleep", "sleep", { t: 1 }], ["wave", "wave", { t: 1 }], ["sit", "sit", {}]]
  .map(([p, l, o]) => `<figure><div class="pd">${(() => { try { return dino(p, o); } catch { return dino(p, {}); } })()}</div><figcaption>${l}</figcaption></figure>`).join("")}</div>`, { sky: "day" });

// ===== the beautiful UI =====
S("center", `<div class="lbl">part one</div><h1 class="xl">A review you<br>want to open.</h1>`, { sky: "day" });

S("", `<div class="lbl">ui · loading</div>
<h1>It starts with a walk.</h1>
<div class="frame"><img src="shots/loading.png"></div>`, { sky: "day" });

S("", `<div class="lbl">ui · home</div>
<h1>Clouds by day. Stars by night.</h1>
<div class="cols2"><figure><img class="pane" src="shots/home-day.png"><figcaption>day · pixel sun</figcaption></figure>
<figure><img class="pane" src="shots/home-night.png"><figcaption>night · pixel moon, stepped-ring switch</figcaption></figure></div>`, { sky: "day" });

S("", `<div class="lbl">ui · review</div>
<h1>Function, callers, diff,<br>consumers, tests.</h1>
<div class="frame"><img src="../docs/review.png"></div>`, { sky: "day" });

S("", `<div class="lbl">ui · tests</div>
<h1>✓ and ✗, on both commits.</h1>
<div class="cols"><img class="shot" src="../video/promo/stills/06-run.png"><div>
<p class="body">Each test is a pair of boxes: base and head. Grey while running, then a burst of ✓. A key keeps each mark with its word; pick a test and its card shows what it proves.</p>
<img class="shot" src="../video/promo/stills/06-run-end.png"></div></div>`, { sky: "day" });

S("", `<div class="lbl">ui · before / after</div>
<h1>Built, run and replayed<br>at both commits.</h1>
<p class="body">Side by side, a compare slider, and a pixel "changes" diff.</p>
<img class="wide tall" src="../docs/before-after.png">`, { sky: "day" });

S("", `<div class="lbl">ui · the dino</div>
<h1>A shader with a mood.</h1>
<div class="moods">
<figure><div class="pd big">${dino("type", { t: 1 })}</div><figcaption>rim light while it works</figcaption></figure>
<figure><div class="pd big duskbox">${scene(40, 30, 8)}</div><figcaption>dusk sky when stargazing</figcaption></figure>
<figure><div class="pd big">${dino("stand", { signal: true })}</div><figcaption class="hot">orange when you're needed</figcaption></figure></div>
<p class="body">Click it and it chats: ask why a change was routed, and it answers from the evidence.</p>`, { sky: "day" });

S("", `<div class="lbl">ui · phone + link preview</div>
<h1 class="sm1">Change. Tests. Decide.</h1>
<div class="cols phone"><img class="ph" src="shots/phone.png"><div><p class="body">On a phone the review becomes tabs; Decide appears when a person must decide.</p><img class="shot og" src="../web/og.png"><p class="body m">The link preview: the same dino, the same sky.</p></div></div>`, { sky: "day" });

// ===== the engine =====
S("center", `<div class="lbl">part two · what we actually built</div>
<h1 class="xl">The UI is the<br>easy part.</h1>
<p class="sub c">Underneath is an IDE-like engine that reads the code semantically: functions, layers, calls, data, secrets. Across two commits.</p>
<div class="pipe"><span>repo</span>→<span>graph</span>→<span>graph diff</span>→<span>guards</span>→<span class="o">rules</span>→<span>tests</span>→<span>pixels</span></div>`, { sky: "night" });

S("", `<div class="lbl">01 · code → graph</div>
<h1>Functions, not files.</h1>
<div class="cols"><div>
<p class="body">Language adapters parse the repo: Go via <code>go/ast</code>, Java, Svelte split by function. Each node gets a layer. Each edge is a call, a data read or write, or a literal.</p>
<div class="tags"><span>logic</span><span>data</span><span>visual</span><span>test</span><span class="o">secret</span></div>
<p class="body m">Resources like <code>.vault-secrets.json</code> and fields like <code>Config.HMACSecret</code> are labelled secret.</p></div>
<div class="panel"><svg class="graph" viewBox="0 0 760 560" font-family="Menlo, ui-monospace, monospace" font-size="20">
<g stroke="#141414" stroke-width="2" fill="none">
<line x1="190" y1="94" x2="190" y2="250"/><line x1="190" y1="294" x2="190" y2="450"/>
<line x1="300" y1="72" x2="400" y2="72" stroke="#ff5a1f" stroke-width="3"/>
<line x1="300" y1="94" x2="460" y2="450" stroke="#ff5a1f" stroke-width="3"/>
<line x1="300" y1="272" x2="400" y2="272" stroke-dasharray="6 6"/></g>
<g font-size="16" fill="#8a8981"><text x="200" y="175">calls</text><text x="200" y="380">calls</text><text x="315" y="62" fill="#ff5a1f">literal</text><text x="385" y="200" fill="#ff5a1f">reads</text><text x="310" y="262">fetch()</text></g>
<g><rect x="80" y="50" width="220" height="44" fill="#f3f2ee" stroke="#141414" stroke-width="2"/><text x="96" y="80">newMux</text>
<rect x="80" y="250" width="220" height="44" fill="#141414"/><text x="96" y="280" fill="#f3f2ee">handleBrowse</text>
<rect x="400" y="250" width="280" height="44" fill="#f3f2ee" stroke="#141414" stroke-width="2"/><text x="416" y="280">FileBrowser.svelte</text>
<rect x="40" y="450" width="300" height="44" fill="#f3f2ee" stroke="#141414" stroke-width="2"/><text x="56" y="480">TestBrowseGlobMatch</text>
<rect x="400" y="50" width="300" height="44" fill="#ff5a1f"/><text x="416" y="80" fill="#141414">.vault-secrets.json</text>
<rect x="400" y="450" width="300" height="44" fill="#ff5a1f"/><text x="416" y="480" fill="#141414">Config.HMACSecret</text></g>
<g font-size="14" fill="#8a8981"><text x="80" y="240">DATA</text><text x="400" y="240">VISUAL</text><text x="40" y="440">TEST</text><text x="400" y="40" fill="#ff5a1f">SECRET</text><text x="560" y="440" fill="#ff5a1f">SECRET</text></g></svg></div></div>`, { sky: "night" });

S("", `<div class="lbl">02 · graph diff + guard analysis</div>
<h1>A check that runs in<br><span class="hot">fewer cases</span>.</h1>
<div class="cols"><div><div class="mono m">base · runs on every entry</div>
<pre class="code">${h(`if strings.HasPrefix(e.Name(), ".") {
    continue
}`)}</pre>
<div class="mono m">head · only when there is no filter</div>
<pre class="code">${h(`if match != "" {
    if ok, _ := filepath.Match(match, e.Name()); !ok {
        continue
    }
} `)}<span class="hot">else</span>${h(` if strings.HasPrefix(e.Name(), ".") {
    continue
}`)}</pre></div>
<div><p class="body">Base and head become two graphs. Each changed node comes with its callers' lines, its diff, and its consumers' lines, down to the frontend <code>fetch()</code> of a Go route.</p>
<p class="body">Conditions with early exits are matched across commits. Same condition, more in front of it:</p>
<pre class="code big">kind: <span class="hot">"narrowed"</span>
added: match == ""</pre></div></div>`, { sky: "night" });

S("", `<div class="lbl">03 · routing · reasons()</div>
<h1>Four rules decide what<br>isn't the model's call.</h1>
<ol class="rules"><li><b>01</b>A narrowed check next to a secret</li><li><b>02</b>Changed lines that read or write a secret</li><li><b>03</b>Fewer calls to an auth function</li><li><b>04</b>Security code, by name</li></ol>
<p class="body">Anything that matches goes to a named owner from <code>owners.json</code>, with the lines that show why. Everything else merges on evidence.</p>`, { sky: "night" });

S("", `<div class="lbl">04 · tests that mean something</div>
<h1>Every test runs on<br>both commits.</h1>
<table class="cls"><tr><th>base</th><th>head</th><th></th></tr>
<tr><td>✗</td><td>✓</td><td>proves the requirement</td></tr>
<tr><td>✓</td><td>✓</td><td>kept</td></tr>
<tr class="o"><td>✓</td><td>✗</td><td>regression</td></tr>
<tr class="mute"><td>✗</td><td>✗</td><td>proves nothing · shown, not counted</td></tr></table>
<p class="body sm">Tests are grounded in real call sites and the requirement. Guard tests come from the old rule. Per-test line coverage. The suite is saved per project and re-runs on later commits only if they contain the code.</p>`, { sky: "night" });

S("", `<div class="lbl">05 · the test run · REQ-V9</div>
<h1>Nemotron writes the tests.<br>Both commits run them.</h1>
<div class="rounds"><div><div class="mono">round 1</div><div class="big2 m">didn't compile</div><p>the error goes back</p></div>
<div><div class="mono">round 2</div><div class="big2">32 tests</div><p>written against the call sites</p></div>
<div><div class="mono">proves it</div><div class="big2">26</div><p>fail on base, pass on head</p></div>
<div><div class="mono">coverage</div><div class="big2">100%</div><p>of the new function</p></div></div>
<p class="body sm">Compile and coverage feedback for up to 3 rounds; the best compiling round is kept.</p>`, { sky: "night" });

S("", `<div class="lbl">06 · the catch · REQ-V7</div>
<h1>Every test green. <span class="hot">Sent back.</span></h1>
<div class="cols"><img class="shot" src="../dossier/shots/v7/after-filter_star.png">
<div class="card"><div class="mono hot">AINO VIRTANEN · TEAM SECURITY</div>
<p>The check <code>strings.HasPrefix(e.Name(), ".")</code> ran on every request. Now it runs only when <code>match == ""</code>. Its caller names <code>.vault-secrets.json</code>, a secret.</p>
${THREE.map(([n, l]) => `<div class="cl"><span>newMux:${n}</span> ${h(l)}</div>`).join("")}
<p>3 tests passed before and fail now.</p></div></div>`, { sky: "night" });

S("", `<div class="lbl">07 · the demo · four commits</div>
<h1>Two merge. One is caught.<br>The fix merges.</h1>
<div class="tl">
<div><i></i><div class="mono">REQ-V8</div><div class="big2">merge</div></div>
<div><i></i><div class="mono">REQ-V9</div><div class="big2">26/32</div><p>tests prove it · 100% of the new function</p></div>
<div class="o"><i></i><div class="mono">REQ-V7</div><div class="big2">sent back</div><p>Aino Virtanen, Team Security · newMux:215/216/221 · 3 tests passed before, fail now</p></div>
<div><i></i><div class="mono">fix</div><div class="big2">merge</div><p>on the same saved tests</p></div></div>`, { sky: "night" });

S("", `<div class="lbl">day and night</div>
<h1>Review code with ease<br>all day … <span class="dim">and night.</span></h1>
<div class="cols2"><img class="pane" src="../video/promo/stills/08-night-a.png"><img class="pane" src="../video/promo/stills/08-night-b.png"></div>`, { sky: "night" });

S("", `<div class="lbl">08 · measurement · 25 seeded mistakes, 17 risky</div>
<h1>Risky changes caught.</h1>
<div class="bars">
<div><span>repo's own tests</span><i style="width:${5/17*100}%"></i><b>5/17</b></div>
<div><span>first rules</span><i style="width:${9/17*100}%"></i><b>9/17</b></div>
<div class="o"><span>later rules</span><i style="width:100%"></i><b>17/17</b></div></div>
<p class="body sm">False alarms: 2 of 8 harmless changes. The later rules were written after seeing the misses, so they are fitted to this set. An unbiased number needs a fresh set.</p>`, { sky: "night" });

S("center", `<div class="lbl">09 · what Nemotron does, and doesn't</div>
<h1>It once wrote a test<br>asserting the <span class="hot">leak was correct</span>.</h1>
<p class="sub c">Now a test counts as evidence only when its intent comes from the old code. Nemotron writes tests and summaries. It never decides what is safe.</p>`, { sky: "night" });

S("", `<div class="lbl">10 · architecture</div>
<h1>From repo to review.</h1>
<div class="pipe left"><span>language adapters</span>→<span>graph</span>→<span>dossier JSON</span>→<span>review UI</span></div>
<div class="facts"><div><b>adapters</b>Go via go/ast · Java · Svelte by function</div>
<div><b>engine</b>graph diff · guard analysis · reasons() · owners.json</div>
<div><b>tests</b>Nemotron 3.5 Super · runners on base and head · saved suite per project</div>
<div><b>model calls</b>cached by input hash</div>
<div><b>ships as</b>Docker · live at dino.umarbek.dev</div></div>`, { sky: "night" });

S("", `<div class="lbl">11 · limits and next</div>
<h1>What we'd do next.</h1>
<ol class="rules"><li><b>01</b>A fresh, unseen set of mistakes</li><li><b>02</b>Spot checks of cleared changes</li><li><b>03</b>Owners per route, not per team</li><li><b>04</b>More languages</li></ol>
<p class="body">Today the rules are coarse: any narrowed check under a caller that names a secret goes to Security. Safe for a file server, noisy elsewhere.</p>`, { sky: "night" });

S("title", `<div class="lbl">trust the dino</div>
<h1 class="xl">The dino reads<br>the 800.<br>You read the <b class="hot">3</b>.</h1>
<p class="url">dino.umarbek.dev</p>
<div class="sky">${scene(60, 46, 14)}</div>`, { n: false, sky: "dusk" });

const css = `@page{size:1920px 1080px;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#f3f2ee}
section{width:1920px;height:1080px;position:relative;overflow:hidden;background:#f3f2ee;color:#141414;padding:120px 140px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;page-break-after:always;break-after:page}
.lbl{font:500 24px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#8a8981;margin-bottom:36px}
h1{font-weight:700;font-size:96px;line-height:1.02;letter-spacing:-.03em;margin:0 0 48px}h1.xl{font-size:140px}
.hot{color:#ff5a1f}b.hot{font-weight:700}
.sub{font-size:36px;line-height:1.35;color:#4a4a44;max-width:900px;margin:0}.sub.c{margin:0 auto;max-width:1300px}
.body{font-size:32px;line-height:1.4;color:#33332f;margin:0 0 28px;max-width:1500px}.body.sm{font-size:28px;max-width:1640px}.m{color:#8a8981}
code,.mono,pre{font-family:ui-monospace,Menlo,monospace}code{font-size:.85em;background:#e6e5df;padding:2px 8px}
.mono{font-size:22px;letter-spacing:.06em;margin:10px 0}
pre.code{font-size:26px;line-height:1.45;background:#141414;color:#f3f2ee;padding:26px 32px;margin:0 0 24px;white-space:pre}pre.code.big{font-size:32px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start}
.shot{width:100%;border:2px solid #d6d5ce;max-height:620px;object-fit:cover;object-position:top}
.title .sub{max-width:820px;margin-top:20px}.title h1{margin-bottom:40px}
.sky{position:absolute;right:60px;bottom:0;width:900px;height:900px}
.url{font:500 44px ui-monospace,Menlo,monospace;color:#141414;border-bottom:4px solid #ff5a1f;display:inline-block}
.center{text-align:center}.center .in{display:flex;flex-direction:column;justify-content:center;height:100%}
.pipe{margin-top:80px;font:500 30px ui-monospace,Menlo,monospace;color:#8a8981;display:flex;gap:18px;justify-content:center;align-items:center}
.pipe span{color:#141414;border:2px solid #141414;padding:14px 22px}.pipe span.o,.tags span.o{background:#ff5a1f;border-color:#ff5a1f}
.tags{display:flex;gap:16px;margin:10px 0 36px}.tags span{font:500 24px ui-monospace,Menlo,monospace;border:2px solid #141414;padding:10px 20px}
.graph{width:100%;height:auto}
.rules{list-style:none;padding:0;margin:0 0 56px;display:grid;grid-template-columns:1fr 1fr;gap:0 80px}
.rules li{font-size:40px;font-weight:500;padding:26px 0;border-top:2px solid #d6d5ce}.rules b{font:500 24px ui-monospace,Menlo,monospace;color:#ff5a1f;margin-right:28px;vertical-align:middle}
.cls{border-collapse:collapse;margin-bottom:44px;font-size:36px}.cls th{font:500 22px ui-monospace,Menlo,monospace;color:#8a8981;text-align:left;padding:0 40px 12px 0;text-transform:uppercase;letter-spacing:.1em}
.cls td{padding:14px 56px 14px 0;border-top:2px solid #d6d5ce}.cls td:nth-child(-n+2){font-family:ui-monospace,Menlo,monospace}.cls tr.o td{color:#ff5a1f;font-weight:700}.cls tr.mute td{color:#8a8981}
.four{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin:-10px 0 28px}.four>div{border-top:4px solid #141414;padding-top:14px}.four>div.o{border-color:#ff5a1f}
.big2{font-size:52px;font-weight:700;letter-spacing:-.02em}.four .o .big2{color:#ff5a1f}.four p{font-size:22px;line-height:1.35;color:#4a4a44;margin:10px 0 0}
.wide{width:100%;height:330px;object-fit:cover;object-position:top;border:2px solid #d6d5ce}.wide.tall{height:500px;object-fit:contain;background:#f3f2ee;border:0}
.bars{margin:20px 0 60px}.bars>div{display:grid;grid-template-columns:360px 1fr 180px;align-items:center;gap:30px;margin-bottom:34px}
.bars span{font:500 26px ui-monospace,Menlo,monospace;color:#4a4a44}.bars i{display:block;height:64px;background:#141414}.bars .o i{background:#ff5a1f}.bars b{font-size:64px;letter-spacing:-.02em}
.bg{position:absolute;inset:0;width:100%;height:100%;z-index:0}.in{position:relative;z-index:1;height:100%}.sky,.pg{z-index:2}
.night{background:#141414;color:#f3f2ee}.night .body{color:#d6d5ce}.night .sub{color:#c9c8c0}.night .m,.night .lbl{color:#8a8981}.night code{background:#2a2a27;color:#f3f2ee}
.night pre.code{background:#1f1f1d;border:1px solid #33332f}.night .pipe span,.night .tags span{color:#f3f2ee;border-color:#f3f2ee}.night .pipe span.o,.night .tags span.o{color:#141414;border-color:#ff5a1f}
.night .rules li{border-color:#33332f}.night .cls td{border-color:#33332f}.night .bars i{background:#f3f2ee}.night .bars .o i{background:#ff5a1f}.night .bars span{color:#c9c8c0}
.panel{background:#f3f2ee;padding:20px;color:#141414}
.type{font:500 150px ui-monospace,Menlo,monospace;letter-spacing:-.02em}.cur{display:inline-block;width:80px;height:140px;background:#ff5a1f;vertical-align:-14px;margin-left:12px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}.three img,.cols2 img{width:100%;border:2px solid #d6d5ce;display:block}
figure{margin:0}figcaption{font:500 22px ui-monospace,Menlo,monospace;color:#8a8981;margin-top:14px;letter-spacing:.06em}
.three-lines{background:#141414;color:#f3f2ee;font:500 34px/1.7 ui-monospace,Menlo,monospace;padding:36px 44px;margin-bottom:44px}.three-lines .ln{color:#ff5a1f;margin-right:36px}
.poses{display:grid;grid-template-columns:repeat(4,1fr);gap:30px 40px}.pd{height:240px;background:rgba(243,242,238,.85)}.poses figcaption{text-align:center}
.frame{background:#f3f2ee;border:2px solid #d6d5ce}.frame img{width:100%;height:640px;object-fit:cover;object-position:top;display:block}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:40px}.cols2 .pane{height:500px;object-fit:cover;object-position:top}
.moods{display:grid;grid-template-columns:repeat(3,1fr);gap:50px;margin-bottom:40px}.pd.big{height:400px}.duskbox{background:none}
.phone{grid-template-columns:420px 1fr}.ph{height:700px;border:2px solid #d6d5ce;display:block;margin-top:-20px}.og{max-height:420px;object-fit:contain}
.rounds{display:grid;grid-template-columns:repeat(4,1fr);gap:30px;margin-bottom:44px}.rounds>div{border-top:4px solid #f3f2ee;padding-top:14px}.rounds p{font-size:24px;color:#c9c8c0;margin:8px 0 0}.rounds .m{color:#8a8981}
.card{border:3px solid #ff5a1f;background:#1b1b19;padding:32px;font-size:28px;line-height:1.4}.card p{margin:14px 0}.card .cl{font:500 20px/1.6 ui-monospace,Menlo,monospace;color:#c9c8c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .cl span{color:#8a8981}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:30px;margin-top:60px;position:relative}.tl:before{content:"";position:absolute;left:0;right:0;top:11px;height:3px;background:#4a4a44}
.tl>div{position:relative;padding-top:50px}.tl i{position:absolute;top:0;left:0;width:24px;height:24px;background:#f3f2ee}.tl .o i{background:#ff5a1f}.tl .o .big2{color:#ff5a1f}.tl p{font-size:26px;line-height:1.35;color:#c9c8c0}
.dim{color:#8a8981}h1.sm1{font-size:80px;margin-bottom:40px}.three-lines{font-size:28px!important;white-space:nowrap}.three img{height:300px;object-fit:cover;object-position:top}.three{margin-top:40px}.pipe.left{justify-content:flex-start;margin:0 0 60px}
.facts>div{display:grid;grid-template-columns:260px 1fr;font-size:32px;padding:18px 0;border-top:2px solid #33332f}.facts b{font:500 22px ui-monospace,Menlo,monospace;color:#ff5a1f;text-transform:uppercase;letter-spacing:.1em;padding-top:8px}
.pg{position:absolute;right:60px;bottom:44px;font:500 20px ui-monospace,Menlo,monospace;color:#8a8981}`;

writeFileSync(new URL("./index.html", import.meta.url), `<!doctype html><html><head><meta charset="utf-8"><title>trust the dino</title><style>${css}</style></head><body>${slides.join("\n")}</body></html>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(new URL("./index.html", import.meta.url).href, { waitUntil: "networkidle" });
await page.pdf({ path: new URL("./trust-the-dino.pdf", import.meta.url).pathname, width: "1920px", height: "1080px", printBackground: true });
const out = process.argv[2];
if (out) { const n = await page.locator("section").count();
  for (let i = 0; i < n; i++) await page.locator("section").nth(i).screenshot({ path: `${out}/s${i + 1}.png`, scale: "css" }); }
// overflow check
console.log(JSON.stringify(await page.$$eval("section", (ss) => ss.map((s, i) => [i + 1, s.scrollHeight > 1080 || [...s.querySelectorAll("*")].some((e) => e.getBoundingClientRect().bottom > (i + 1) * 1080 + 2 && !e.closest(".sky"))]))));
await browser.close();
