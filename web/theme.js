// Day and night. A pixel sun in the corner; pressed, it sets, a moon rises and stars come out, while the
// page itself changes in widening pixel rings from the button. Light is the default; the choice is kept.
//
//   themeButton()  -> the button's HTML (put it anywhere; any number of them stay in sync)
//   initTheme()    -> once, wires the clicks; dispatches "themechange" on document after each switch

const KEY = "trust:theme";

// 12 x 12 pixel art
const cells = (test) => { const out = []; for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (test(x + 0.5, y + 0.5)) out.push([x, y]); return out; };
const SUN = cells((x, y) => Math.hypot(x - 6, y - 6) < 3.3 ||
  [[6, 0.5], [6, 11.5], [0.5, 6], [11.5, 6], [2, 2], [10, 2], [2, 10], [10, 10]].some(([a, b]) => Math.hypot(x - a, y - b) < 0.8));
const MOON = cells((x, y) => Math.hypot(x - 6, y - 6.5) < 4 && Math.hypot(x - 8.2, y - 4.8) >= 3.2);
const STARS = [[1, 1], [10, 2], [2, 10], [11, 9], [8, 11]];
const px = ([x, y], extra = "") => `<rect x="${x}" y="${y}" width="1" height="1"${extra}/>`;

const ICON = `<svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
  <g class="sun">${SUN.map((p) => px(p)).join("")}</g>
  <g class="moon">${MOON.map((p) => px(p)).join("")}</g>
  <g class="stars">${STARS.map((p, i) => px(p, ` class="st" style="--i:${i}"`)).join("")}</g></svg>`;

const isDark = () => document.documentElement.dataset.theme === "dark";
const label = () => (isDark() ? "Switch to day" : "Switch to night");

export const themeButton = () =>
  `<button class="theme" data-theme-toggle aria-label="${label()}" title="${label()}">${ICON}</button>`;

function apply(dark) {
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch { /* private mode */ }
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => { b.title = label(); b.setAttribute("aria-label", label()); });
  document.dispatchEvent(new CustomEvent("themechange", { detail: { dark } }));
}

function toggle(button) {
  const dark = !isDark();
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || still) return apply(dark);
  // the new theme spreads from the button in stepped rings, wide enough to reach the farthest corner
  const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const root = document.documentElement.style;
  root.setProperty("--vt-x", x + "px");
  root.setProperty("--vt-y", y + "px");
  root.setProperty("--vt-r", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
  document.startViewTransition(() => apply(dark));
}

export function initTheme() {
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("[data-theme-toggle]");
    if (b) toggle(b);
  });
}

// The home page's sky: pixel clouds drift across by day, pixel stars twinkle by night. Seeded, so a
// re-render keeps every star where it was.
const CLOUDS = [
  ["......####.......", "....########.....", "..###########.##.", ".################", "#################", ".###############."],
  [".....###....", "...#######..", ".##########.", "############", ".##########."],
  ["....#####.........", "..#########.####..", ".################.", "##################", ".################."],
];
const cloud = (rows) => `<svg viewBox="0 0 ${rows[0].length} ${rows.length + 1}" width="${rows[0].length * 4}" height="${(rows.length + 1) * 4}" shape-rendering="crispEdges">${
  rows.map((r, y) => [...r].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "")).join("")).join("")
}${[...rows.at(-1)].map((c, x) => (c === "#" ? `<rect class="under" x="${x}" y="${rows.length}" width="1" height="1"/>` : "")).join("")}</svg>`;

export function skyLayer() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clouds = [[0, 6, 95], [1, 15, 70], [2, 24, 120], [1, 9, 150]].map(([k, top, secs], i) =>
    `<div class="cloud" style="top:${top}vh;animation-duration:${secs}s;animation-delay:-${Math.round(secs * rnd())}s;--s:${i % 2 ? 1 : 1.5}">${cloud(CLOUDS[k])}</div>`).join("");
  const stars = Array.from({ length: 46 }, () => {
    const big = rnd() > 0.85;
    return `<i class="star${big ? " big" : ""}" style="left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 42).toFixed(1)}vh;--o:${(0.35 + rnd() * 0.65).toFixed(2)};animation-delay:-${(rnd() * 5).toFixed(1)}s;animation-duration:${(3 + rnd() * 4).toFixed(1)}s"></i>`;
  }).join("");
  return `<div class="sky" aria-hidden="true">${clouds}${stars}</div>`;
}
