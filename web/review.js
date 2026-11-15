// One changed function: middle = who calls it, what changed, what reads its result;
// side = who decides, what the tests say.

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const short = (id) => id.split(":").slice(1).join(":");

import { decided, decide } from "./decisions.js";
import { canDiff, pixelDiff } from "./pixeldiff.js";
export { decided, isOpen } from "./decisions.js";

export const tests = (u) => u.tests?.tests || [];

/* ---------- text helpers ---------- */

const KW = new RegExp("\\b(" + [
  "func", "return", "if", "else", "for", "range", "continue", "break", "var", "const", "let", "async", "await", "function",
  "import", "package", "type", "struct", "nil", "true", "false", "while", "defer", "go", "map", "chan", "interface", "switch",
  "case", "default", "public", "private", "protected", "static", "final", "class", "extends", "implements", "new", "void",
  "int", "long", "boolean", "double", "float", "char", "byte", "short", "try", "catch", "finally", "throw", "throws", "this",
  "super", "null", "instanceof", "enum", "record", "abstract", "synchronized", "export", "from", "of", "in", "each",
].join("|") + ")\\b", "g");
export function hl(text) {
  return text.split(/("(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*'|\/\/.*$|\/\*.*?(?:\*\/|$))/).map((p, i) => i % 2
    ? `<span class="${p.startsWith("/") ? "c" : "s"}">${esc(p)}</span>`
    : esc(p).replace(KW, '<span class="k">$1</span>')).join("");
}
const simplify = (c) => (c || "").replace(/^!\((\w+) != ("[^"]*")\)$/, "$1 == $2");
const sentence = (name) => {
  const s = name.replace(/^(Test)?Trust(Guard)?_/, "").replace(/^test_?/i, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function runs(lines) {
  const out = [];
  for (const n of lines) out.length && n === out.at(-1)[1] + 1 ? (out.at(-1)[1] = n) : out.push([n, n]);
  return out;
}
const span = (r) => r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;

/* ---------- middle ---------- */

const ref = (where, text) => `<div class="ref"><div class="where">${where}</div><div class="what">${hl(text)}</div></div>`;

// how a before/after pair can be shown; "changes" needs WebGL (pixeldiff.js) and is left out without it
const VIEWS = [["pair", "side by side", "Before and after next to each other"],
               ["overlay", "compare", "One image, drag to move the divider"],
               ["changes", "changes", "The after image with every changed pixel in orange"]].filter(([v]) => v !== "changes" || canDiff());

function scene(s, i) {
  return `<div class="scene" data-scene="${i}">
    <div class="scene-head"><span class="label">${esc(s.name)}</span>
      <span class="views" role="group" aria-label="How to show before and after">${VIEWS.map(([v, label, tip], j) =>
        `<button class="label${j ? "" : " on"}" data-view="${v}" aria-pressed="${!j}" title="${tip}">${label}</button>`).join("")}</span></div>
    <div class="pair">
      <figure><figcaption class="label">before</figcaption><img src="../dossier/${esc(s.before)}" alt="before: ${esc(s.name)}"></figure>
      <figure><figcaption class="label">after</figcaption><img src="../dossier/${esc(s.after)}" alt="after: ${esc(s.name)}"></figure>
    </div>
    <div class="overlay" hidden style="--x:50%">
      <img src="../dossier/${esc(s.after)}" alt="after: ${esc(s.name)}">
      <img class="before" src="../dossier/${esc(s.before)}" alt="before: ${esc(s.name)}">
      <i class="divider"></i><span class="label l">before</span><span class="label r">after</span>
    </div>
    <div class="changes" hidden><span class="label">changed pixels</span></div>
  </div>`;
}

async function showView(sc, v) {
  for (const b of sc.querySelectorAll("[data-view]")) {
    b.classList.toggle("on", b.dataset.view === v);
    b.setAttribute("aria-pressed", b.dataset.view === v);
  }
  for (const k of ["pair", "overlay", "changes"]) sc.querySelector("." + k).hidden = k !== v;
  const box = sc.querySelector(".changes");
  if (v !== "changes" || box.querySelector("canvas")) return;
  const [before, after] = sc.querySelectorAll(".pair img");
  const canvas = await pixelDiff(before, after);
  if (canvas) { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "changed pixels: " + after.alt); box.prepend(canvas); }
  else box.querySelector(".label").textContent = "couldn't compare these images";
}

export function renderMain(el, u) {
  const guards = new Map(u.guards.filter((g) => g.head).map((g) => [g.head.line, g]));
  const ran = new Set(tests(u).flatMap((t) => t.lines));
  const never = new Set(u.tests?.uncovered || []);
  const keep = u.lines.map((l, i) => l.op !== " " || guards.has(l.n) || never.has(l.n) ? i : -1).filter((i) => i >= 0);
  const near = (i) => keep.some((k) => Math.abs(k - i) <= 4);
  const fold = u.lines.length > 40;

  let code = "", folded = 0;
  const flush = () => { if (folded) code += `<div class="ln"><div class="fold">⋯ ${folded} unchanged lines</div></div>`; folded = 0; };
  u.lines.forEach((l, i) => {
    if (fold && l.op === " " && !near(i)) { folded++; return; }
    flush();
    const live = l.op !== "-";
    const g = live && guards.get(l.n);
    const wide = g && g.kind === "widened";
    const cls = [l.op === "+" ? "add" : l.op === "-" ? "del" : "", g ? (wide ? "guard wide" : "guard") : "",
                 live && never.has(l.n) ? "never" : live && ran.has(l.n) ? "run" : ""].join(" ");
    code += `<div class="ln ${cls}" ${live ? `data-line="${l.n}" id="L${l.n}"` : ""}><span class="cov"></span><span class="n">${l.n || ""}</span><span class="op">${l.op.trim()}</span><span class="tx">${hl(l.text)}</span>${g ? `<div class="note">${wide ? `before: only when ${esc(simplify(g.removed))} · now on every request` : `before: on every request · now only when ${esc(simplify(g.added))}`}</div>` : ""}</div>`;
  });
  flush();

  const byTo = new Map();
  for (const e of u.out) byTo.has(e.to) ? byTo.get(e.to).push(e) : byTo.set(e.to, [e]);
  const ins = u.in.map((e) => ref(`<b>${esc(short(e.from))}</b> :${e.line}`, e.text)).join("");
  const outs = [...byTo.values()].map((es) => ref(`<b>${esc(short(es[0].to))}</b> :${es[0].line}${es.length > 1 ? ` ×${es.length}` : ""}`, es[0].text)).join("");
  const cons = u.consumers.map((c) => ref(`<b>${esc(c.file.split("/").pop())}</b> :${c.line}`, c.text)).join("");
  const shots = (u.shots || []).map(scene).join("");
  const tag = [u.layer, u.route, u.layer !== "test" && u.layer !== "visual" && !tests(u).length ? "no tests" : ""].filter(Boolean).join(" · ");

  el.innerHTML = `
    <div class="head"><div class="title"><b>${esc(u.name)}</b><span class="file">${esc(u.file)}</span><span class="label">${esc(tag)}</span></div>
      ${u.explain ? `<p>${esc(u.explain)}</p>` : ""}</div>
    ${shots ? `<div class="shots">${shots}</div>` : ""}
    ${ins ? `<div class="sect"><span class="label">called by</span>${ins}</div>` : ""}
    <div class="code">${code}</div>
    ${outs ? `<div class="sect"><span class="label">calls</span>${outs}</div>` : ""}
    ${cons ? `<div class="sect"><span class="label">result read by</span>${cons}</div>` : ""}
    <div class="end"></div>`;
}

/* ---------- side ---------- */

// Which question a test answers comes from where it passes:
// fails before + passes after = new behaviour; passed before = old behaviour.
const QUESTIONS = [
  ["Does it do what %REQ% asks?", (t) => t.meaning === "proves requirement"],
  ["Does everything that worked still work?", (t) => t.meaning === "kept" || t.meaning === "regression"],
  ["Fails before and after", (t) => t.meaning === "fails on both"],
];

export function renderSide(el, d, caseId, u) {
  let h = "";
  if (u.routed) {
    const g = u.guards[0];
    const secret = u.secret.find((e) => e.to.startsWith("resource:"))?.to.slice(9);
    const dec = decided(caseId, u.id);
    h += `<div class="ask"><div class="who">${esc(u.owner.owner)} · ${esc(u.owner.team)}</div>
      ${g ? `<p>The check <code>${esc(g.cond)}</code> ran on every request. Now it runs only when <code>${esc(simplify(g.added))}</code>.${secret ? ` Its caller names <code>${esc(secret)}</code>, a secret.` : ""}</p>` : u.owner.why ? `<p>${esc(u.owner.why)}</p>` : ""}
      <div class="ev">${u.secret.map((e) => `<div><span>${esc(short(e.from))}:${e.line}</span> ${esc(e.text)}</div>`).join("")}</div>
      ${dec ? `<div class="decided">${esc(dec.by)} ${esc(dec.decision)}</div>`
            : `<div class="acts"><button class="main" data-dec="sent it back">Send back</button><button data-dec="accepted the risk">Accept risk</button></div>`}
    </div>`;
  }
  const ts = tests(u);
  if (ts.length) {
    h += `<div class="tests"><div class="label"><span>tests</span><span>by nemotron</span></div>`;
    for (const [q, pick] of QUESTIONS) {
      const group = ts.filter(pick);
      if (!group.length) continue;
      const bad = group.filter((t) => !t.head).length;
      h += `<div class="q"><h4>${esc(q.replace("%REQ%", d.case.id))}<span class="${bad ? "bad" : ""}">${bad ? `${bad} of ${group.length} fail` : `${group.length} pass`}</span></h4>
        <div class="boxes">${group.map((t) => `<button class="box ${t.head ? "" : "fail"} ${t.origin === "kept" ? "kept" : "new"}" data-test="${esc(t.name)}" aria-label="${esc(sentence(t.name))}"></button>`).join("")}</div></div>`;
    }
    const cov = u.tests.coverage;
    if (cov != null) {
      const gaps = runs(u.tests.uncovered || []);
      h += `<div class="cov-line">${Math.round(cov)}% of lines run${gaps.length ? " · never: " + gaps.map((r) => `<button data-jump="${r[0]}">${span(r)}</button>`).join(", ") : ""}</div>`;
    }
    const failed = ts.filter((t) => !t.head).sort((a, b) => (b.base - a.base));
    if (failed.length) {
      h += `<div class="failed">${failed.map((t) => `<div class="fcard" data-card="${esc(t.name)}"><b>${esc(sentence(t.name))}</b>
        ${t.message?.length ? `<div class="why">${esc(t.message[0])}</div>` : ""}
        <div class="was"><span>${t.base ? "passed before this commit" : "failed before too"}</span>${t.source ? `<button data-src="${esc(t.name)}">code</button>` : ""}</div>
        <pre class="src" hidden>${esc(t.source || "")}</pre></div>`).join("")}</div>`;
    }
    h += `</div>`;
  }
  el.innerHTML = h;
  return !!h;
}

/* ---------- interactions inside the review ---------- */

// ctx() returns { d, caseId, unit, label(caseId) } of the open review, or null.
export function wireReview(ctx, rerender) {
  const tip = Object.assign(document.createElement("div"), { className: "tip", hidden: true });
  document.body.append(tip);
  const showTip = (ev, html) => {
    tip.innerHTML = html; tip.hidden = false;
    tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + "px"; tip.style.top = ev.clientY + 14 + "px";
  };
  const clearLit = () => { document.querySelectorAll(".lit").forEach((x) => x.classList.remove("lit")); tip.hidden = true; };

  document.addEventListener("mouseover", (ev) => {
    const c = ctx();
    if (!c || ev.target.closest?.(".tour")) return;
    const u = c.unit;
    const box = ev.target.closest(".box");
    if (box) {
      clearLit();
      const t = tests(u).find((x) => x.name === box.dataset.test);
      t.lines.forEach((n) => document.getElementById("L" + n)?.classList.add("lit"));
      box.classList.add("lit");
      const kept = (t.origin === "kept" ? ` · kept, written for ${esc(c.label(t.written_for))}` : " · new, written for this commit")
        + (t.status === "pending" ? " · trusted after merge" : "");
      showTip(ev, `${esc(sentence(t.name))}<span>${t.head ? "passes" : "fails"} now · ${t.base ? "passed" : "failed"} before · runs ${t.lines.length} lines${kept}</span>`);
      return;
    }
    const line = ev.target.closest(".ln[data-line]");
    if (line && tests(u).length) {
      clearLit();
      const n = +line.dataset.line;
      tests(u).filter((t) => t.lines.includes(n))
        .forEach((t) => document.querySelector(`.box[data-test="${CSS.escape(t.name)}"]`)?.classList.add("lit"));
      line.classList.add("lit");
      return;
    }
    if (!ev.target.closest(".boxes, .code")) clearLit();
  });

  const jump = (n) => {
    const el = document.getElementById("L" + n);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };

  // before/after overlay: drag anywhere on the image to move the divider
  document.addEventListener("pointerdown", (ev) => {
    const ov = ev.target.closest(".overlay");
    if (!ov) return;
    ev.preventDefault();
    const move = (e) => {
      const r = ov.getBoundingClientRect();
      ov.style.setProperty("--x", Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)) + "%");
    };
    move(ev);
    ov.setPointerCapture(ev.pointerId);
    ov.addEventListener("pointermove", move);
    ov.addEventListener("pointerup", () => ov.removeEventListener("pointermove", move), { once: true });
  });

  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.closest(".zoom")) return t.closest(".zoom").remove();
    const c = ctx();
    if (!c) return;
    const view = t.closest("[data-view]");
    if (view) return showView(view.closest(".scene"), view.dataset.view);
    const img = t.closest(".pair img");
    if (img) return document.body.append(Object.assign(document.createElement("div"), { className: "zoom", innerHTML: `<img src="${img.src}" alt="">` }));
    const j = t.closest("[data-jump]");
    if (j) return jump(+j.dataset.jump);
    const s = t.closest("[data-src]");
    if (s) { const pre = s.closest(".fcard").querySelector("pre"); pre.hidden = !pre.hidden; return; }
    const box = t.closest(".box");
    if (box) {
      const card = document.querySelector(`.fcard[data-card="${CSS.escape(box.dataset.test)}"]`);
      if (card) return card.scrollIntoView({ block: "center", behavior: "smooth" });
      const first = tests(c.unit).find((x) => x.name === box.dataset.test)?.lines[0];
      return first && jump(first);
    }
    const dec = t.closest("[data-dec]");
    if (dec && !dec.disabled) {
      dec.disabled = true;
      decide({ case: c.caseId, unit: c.unit.id, decision: dec.dataset.dec, by: c.unit.owner.owner }).then(rerender);
    }
  });
}
