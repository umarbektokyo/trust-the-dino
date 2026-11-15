// First-visit walkthrough on the REQ-V7 leak. Each step cuts a hole around the real element;
// a step whose element is not on screen is skipped.

const KEY = "trust:tour";
const enc = encodeURIComponent;
const V7 = `#/c/v7/${enc("backend/main.go:handleBrowse")}`;
const V7B = `#/c/v7b/${enc("backend/main.go:handleBrowse")}`;
const BRANCH = `#/p/vault/b/${enc("agent/req-v7-glob")}`;

const $$ = (s) => [...document.querySelectorAll(s)];
const q = (text) => $$(".q").filter((el) => el.querySelector("h4")?.textContent.startsWith(text));

const STEPS = [
  { hash: "#/", find: () => $$(".home-in section").slice(0, 1).filter((s) => s.querySelector(".dot.hot")),
    text: "Agent-written commits that need a person. The orange name is who must decide." },
  { hash: V7, find: () => $$("#nav .commit"),
    text: "The commits on this branch. An orange dot means someone still has to decide something." },
  { hash: V7, find: () => $$("#nav .units"),
    text: "Every function this commit changed, grouped by layer: data, logic, visual, test. Click one to review it." },
  { hash: V7, find: () => $$("#main .head p"),
    text: "One sentence on what this function does now." },
  { hash: V7, find: () => $$("#main .sect").slice(0, 1),
    text: "Called by: what goes in. Every line in the code that calls this function." },
  { hash: V7, find: () => $$("#main .code"),
    text: "What changed: the function itself, with the diff. Green is added, red is removed." },
  { hash: V7, find: () => $$("#main .code ~ .sect"),
    text: "Where it goes: what it calls, and which lines read its result." },
  { hash: V7, find: () => $$("#main .ln.guard"),
    text: "The leak. The rule that hides dotfiles ran on every request; now it runs only without a filter. ?match=* lists the secrets file." },
  { hash: V7, find: () => $$("#side .ask"),
    text: "The one decision a person must make: who decides, and the three lines that make it matter. The secrets file sits in the folder this function lists." },
  { hash: V7, find: () => $$("#side .boxes"),
    text: "One box per test: ✓ passes now, ✗ fails now. Under each row it says how many were written for this commit and how many were saved from earlier ones. Pick a box to read the test." },
  { hash: V7, find: () => $$("#side .q h4"),
    text: "Tests answer two questions: does it do what the requirement asks, and does everything that worked still work." },
  { hash: V7, find: () => $$("#side .box.fail").slice(0, 1).map((b) => b.closest(".q")), hover: () => $$("#side .box.fail")[0],
    text: "Hover a box to light up the lines that test runs. Hover a line to see which tests run it." },
  { hash: V7, find: () => $$("#main .code"), rect: (r) => ({ ...r, width: 62 }),
    text: "Beside the line numbers: grey means a test ran that line, orange means no test ever reached it." },
  { hash: V7, find: () => $$("#side .failed"),
    text: "Every failing test: what it expected, and whether it passed before this commit." },
  { hash: BRANCH, find: () => $$("[data-merge]").map((b) => b.closest(".row")),
    text: "When no function is left for its owner, the approver merges. A commit that was sent back cannot be merged." },
  { hash: null, find: () => $$(".peek-body"),
    text: "The dino has read this commit. Click it to ask about it, or drag it somewhere else." },
  { hash: V7B, find: () => q("Does it do what").filter((el) => el.querySelector('.box[data-test^="TestTrustGuard_"]')),
    text: "The agent's fix. The three tests that caught the leak were kept from REQ-V7 and run again on this commit: they pass now." },
];

let root = null, i = 0, dir = 1;

function close() {
  localStorage.setItem(KEY, "done");
  root?.remove(); root = null;
  removeEventListener("resize", place); document.removeEventListener("scroll", place, true);
  document.body.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

async function waitFor(step) {
  for (let t = 0; t < 25; t++) {
    const els = step.find().filter((e) => e && e.getClientRects().length);
    if (els.length) return els;
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

let current = null;
function place() {
  if (!root || !current) return;
  const rs = current.els.map((e) => e.getBoundingClientRect());
  let r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)),
            right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
  r.width = r.right - r.left; r.height = r.bottom - r.top;
  if (current.step.rect) { r = current.step.rect(r); r.right = r.left + r.width; }
  // keep the hole inside the window
  const top = Math.max(r.top, 38), bottom = Math.min(r.top + r.height, innerHeight - 6);
  const pad = 5, hole = root.querySelector(".tour-hole"), card = root.querySelector(".tour-card");
  Object.assign(hole.style, { left: r.left - pad + "px", top: top - pad + "px", width: r.width + pad * 2 + "px", height: Math.max(0, bottom - top) + pad * 2 + "px" });
  const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
  let x, y;
  if (innerWidth - (r.left + r.width) > cw + gap * 2) { x = r.left + r.width + gap; y = top; }
  else if (r.left > cw + gap * 2) { x = r.left - cw - gap; y = top; }
  else if (innerHeight - bottom > ch + gap * 2) { x = r.left; y = bottom + gap; }
  else { x = r.left; y = top - ch - gap; }
  card.style.left = Math.max(12, Math.min(x, innerWidth - cw - 12)) + "px";
  card.style.top = Math.max(44, Math.min(y, innerHeight - ch - 12)) + "px";
}

async function show(n) {
  if (!root) return;
  if (n < 0) n = 0;
  if (n >= STEPS.length) return close();
  i = n;
  const step = STEPS[n];
  document.body.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  if (step.hash && location.hash !== step.hash && !(step.hash === "#/" && location.hash === "")) location.hash = step.hash;
  root.classList.add("moving");
  const els = await waitFor(step);
  if (!root || i !== n) return;
  if (!els.length) return show(n + dir);
  els[0].scrollIntoView({ block: els[0].offsetHeight > innerHeight * .6 ? "start" : "center" });
  await new Promise((r) => requestAnimationFrame(r));
  current = { step, els };
  root.querySelector(".tour-n").textContent = `${n + 1} / ${STEPS.length}`;
  root.querySelector(".tour-text").textContent = step.text;
  root.querySelector("[data-back]").hidden = n === 0;
  root.querySelector("[data-next]").textContent = n === STEPS.length - 1 ? "Done" : "Next";
  place();
  root.classList.remove("moving");
  const h = step.hover?.();
  if (h) {
    const b = h.getBoundingClientRect();
    h.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: b.left + b.width / 2, clientY: b.bottom }));
  }
  window.trustDino?.say?.(step.text);
}

export function startTour() {
  if (root) return;
  root = document.createElement("div");
  root.className = "tour moving";
  root.innerHTML = `<div class="tour-hole"></div>
    <div class="tour-card" role="dialog" aria-label="Walkthrough">
      <div class="tour-n label"></div><p class="tour-text"></p>
      <div class="tour-acts"><button data-skip>Skip</button><span><button data-back>Back</button><button class="main" data-next>Next</button></span></div>
    </div>`;
  root.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-skip]")) return close();
    if (ev.target.closest("[data-next]")) { dir = 1; return show(i + 1); }
    if (ev.target.closest("[data-back]")) { dir = -1; return show(i - 1); }
  });
  document.body.append(root);
  addEventListener("resize", place); document.addEventListener("scroll", place, true);
  const follow = () => { if (!root) return; place(); requestAnimationFrame(follow); };  // targets can move (the dino walks)
  requestAnimationFrame(follow);
  dir = 1; show(0);
}

document.addEventListener("keydown", (ev) => {
  if (!root) return;
  if (ev.key === "Escape") close();
  else if (ev.key === "ArrowRight" || ev.key === "Enter") { ev.preventDefault(); dir = 1; show(i + 1); }
  else if (ev.key === "ArrowLeft") { dir = -1; show(i - 1); }
}, true);
document.addEventListener("click", (ev) => { if (ev.target.closest?.("[data-tour]")) startTour(); });

export const firstVisit = () => !localStorage.getItem(KEY);
