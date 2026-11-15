// Two sidebars around the editor: each can be hidden, resized from its inner edge, and the two
// can trade sides. Sizes belong to the content (nav / side), not to the screen edge.

const KEY = "trust:layout";

// Phones get one column instead of three: tabs pick what fills it (Change = the middle, Tests and Decide = the side).
export const MOBILE = "(max-width: 720px)";
export function showPane(p) {
  document.body.dataset.pane = p;
  document.querySelectorAll("[data-pane-tab]").forEach((b) => {
    b.classList.toggle("on", b.dataset.paneTab === p);
    b.setAttribute("aria-selected", b.dataset.paneTab === p);
  });
  document.getElementById(p === "change" ? "main" : "side")?.scrollTo(0, 0);
}
const MIN = 180, MAX = 620;
const L = Object.assign({ nav: { w: 270, open: true }, side: { w: 340, open: true }, swap: false },
                        JSON.parse(localStorage.getItem(KEY) || "{}"));
const store = () => localStorage.setItem(KEY, JSON.stringify(L));

let app, empty = { nav: false, side: false };

// which content sits on the physical left / right
const at = (edge) => (edge === "left") !== L.swap ? "nav" : "side";
const shown = (p) => L[p].open && !empty[p];

export function apply() {
  const left = at("left"), right = at("right");
  const lw = shown(left) ? L[left].w : 0, rw = shown(right) ? L[right].w : 0;
  app.style.gridTemplateColumns = `${lw}px minmax(0, 1fr) ${rw}px`;
  app.style.setProperty("--lw", lw + "px");
  app.style.setProperty("--rw", rw + "px");
  for (const p of ["nav", "side"]) {
    const el = document.getElementById(p);
    el.style.gridColumn = p === left ? "1" : "3";
    el.hidden = !shown(p);
    el.dataset.edge = p === left ? "left" : "right";
  }
  app.querySelector(".grip.left").hidden = !shown(left);
  app.querySelector(".grip.right").hidden = !shown(right);
  document.querySelectorAll("[data-panel]").forEach((b) => {
    const p = b.dataset.panel;
    if (p === "swap") return b.classList.toggle("on", L.swap);
    b.classList.toggle("on", shown(at(p)));
    b.disabled = empty[at(p)];
  });
}

// a pane with nothing to show takes no room, without changing the saved choice
export function setEmpty(p, isEmpty) { empty[p] = isEmpty; apply(); }

export const toggle = (edge) => { const p = at(edge); if (empty[p]) return; L[p].open = !L[p].open; store(); apply(); };
export const swap = () => { L.swap = !L.swap; store(); apply(); };

export const controls = () => `<div class="panels">
  <button data-panel="left" title="Left panel  [" aria-label="Toggle left panel"><i></i></button>
  <button data-panel="swap" title="Swap panels" aria-label="Swap panels">⇄</button>
  <button data-panel="right" title="Right panel  ]" aria-label="Toggle right panel"><i></i></button></div>`;

export function mountPanels(el) {
  app = el;
  for (const edge of ["left", "right"]) {
    const g = Object.assign(document.createElement("div"), { className: "grip " + edge });
    g.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const p = at(edge), r = app.getBoundingClientRect();
      g.setPointerCapture(ev.pointerId);
      document.body.classList.add("dragging");
      const move = (e) => {
        const w = edge === "left" ? e.clientX - r.left : r.right - e.clientX;
        L[p].w = Math.round(Math.max(MIN, Math.min(MAX, w)));
        apply();
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", () => {
        g.removeEventListener("pointermove", move);
        document.body.classList.remove("dragging");
        store();
      }, { once: true });
    });
    g.addEventListener("dblclick", () => toggle(edge));
    app.append(g);
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-panel]");
    if (!b) return;
    b.dataset.panel === "swap" ? swap() : toggle(b.dataset.panel);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.target.closest?.("input, textarea, [contenteditable]")) return;
    if (document.body.classList.contains("home")) return;
    if (ev.key === "[") toggle("left");
    else if (ev.key === "]") toggle("right");
  });
  apply();
}
