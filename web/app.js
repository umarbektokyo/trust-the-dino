// trust the dino: home (what waits for you, the projects) → project (branches, commits) → review (one function).
// Routes:  #/  ·  #/p/<project>  ·  #/p/<project>/b/<branch>  ·  #/c/<case>/<unit>

import { esc, renderMain, renderSide, wireReview } from "./review.js";
import { loadDecisions, decide, isOpen, commitState, needsHuman } from "./decisions.js";
import { mountPanels, setEmpty, apply as applyPanels, controls, MOBILE, showPane } from "./panels.js";
import { config, loadConfig, start, watch, token } from "./jobs.js";
import { startTour, firstVisit } from "./tour.js";

const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;
const LAYERS = ["data", "logic", "visual", "test"];

let projects = [];
const loadProjects = async () => { projects = (await (await fetch("../dossier/projects.json", { cache: "no-cache" })).json()).projects; };
await loadProjects();
const dossiers = {};
const load = (c) => (dossiers[c] ??= fetch(`../dossier/${c}.json`, { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null));

/* ---------- lookups ---------- */

const project = (id) => projects.find((p) => p.id === id);
const branches = (p) => [...p.branches].sort((a, b) => (b.name === p.default) - (a.name === p.default));
const branch = (p, name) => p.branches.find((b) => b.name === name) || p.branches.find((b) => b.name === p.default) || p.branches[0];
function where(caseId) {
  for (const p of projects) for (const b of p.branches) for (const c of b.commits) if (c.case === caseId) return { p, b, c };
  return null;
}
const label = (caseId) => where(caseId)?.c.req || caseId;
const subject = (c) => c.subject.replace(/^REQ-[\w-]+:\s*/, "");
const owners = (ws) => [...new Map(ws.map((w) => [w.owner, `${w.owner} · ${w.team}`])).values()].join(", ");
// what a commit row says on its right: who must act, or how it ended
function status(c) {
  if (!c.case) return "";
  const s = commitState(c);
  if (s.kind === "owners") return `<span class="who">${esc(owners(s.open))}</span>`;
  if (s.kind === "merge") return `<span class="who">${esc(s.by)} <button class="merge" data-merge="${esc(c.case)}">Merge</button></span>`;
  if (s.kind === "merged") return `<span class="done">merged by ${esc(s.by)}</span>`;
  if (s.kind === "sent back") return `<span class="done">sent back by ${esc(s.by)}</span>`;
  return "";
}
const commitHref = (c) => `#/c/${enc(c.case)}`;

/* ---------- routing ---------- */

function parse() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (parts[0] === "p" && project(parts[1])?.ready) return { screen: "project", pid: parts[1], branch: parts[2] === "b" ? parts.slice(3).join("/") : null };
  if (parts[0] === "c" && parts[1]) return { screen: "review", caseId: parts[1], unitId: parts.slice(2).join("/") || null };
  return { screen: "home" };
}

let view = null;          // { screen, p, b, c, d, caseId, unit }
let creature = null;

async function route() {
  const r = parse();
  if (r.screen === "home") view = { screen: "home" };
  else if (r.screen === "project") {
    const p = project(r.pid);
    view = { screen: "project", p, b: branch(p, r.branch) };
  } else {
    const w = where(r.caseId);
    const d = await load(r.caseId);
    if (!d) { view = { screen: "missing", ...w, caseId: r.caseId }; render(); return; }
    const unit = d.units.find((u) => u.id === r.unitId)
      || d.units.find((u) => isOpen(r.caseId, u))   // what waits on a person first,
      || d.units.find((u) => u.tests?.tests?.some((t) => t.meaning === "proves requirement"))  // else the proof
      || d.units[0];
    if (unit.id !== r.unitId) history.replaceState(null, "", `#/c/${enc(r.caseId)}/${enc(unit.id)}`);
    const same = view?.caseId === r.caseId && view?.unit?.id === unit.id;
    view = { screen: "review", ...w, d, caseId: r.caseId, unit };
    if (!same) $("main").scrollTop = 0;
  }
  render();
  creature?.setContext({
    screen: view.screen === "missing" ? "review" : view.screen,
    project: view.p?.id ?? null, branch: view.b?.name ?? null, caseId: view.caseId ?? null, unitId: view.unit?.id ?? null,
  });
}

/* ---------- home ---------- */

function renderHome() {
  const rows = [];
  for (const p of projects) for (const b of p.branches) for (const c of b.commits) {
    if (needsHuman(c)) rows.push({ p, b, c, s: commitState(c) });
  }
  const wait = rows.map(({ p, b, c, s }) => `
    <a class="row" href="${s.kind === "owners" ? `#/c/${enc(c.case)}/${enc(s.open[0].unit)}` : commitHref(c)}">
      <i class="dot hot"></i>
      <span class="msg">${esc(c.subject)}</span>
      ${status(c)}
      <span class="meta">${esc(p.name)} · ${esc(b.name)}</span>
    </a>`).join("");
  const projs = projects.map((p) => {
    const inner = `
      <span class="name">${esc(p.name)}</span>
      <span class="about">${esc(p.about)}</span>
      <span class="label">${esc(p.langs.join(" · "))}</span>
      <span class="meta">${p.ready ? `${p.branches.length} branch${p.branches.length === 1 ? "" : "es"}` : "not built"}</span>`;
    return p.ready ? `<a class="row proj" href="#/p/${enc(p.id)}">${inner}</a>` : `<div class="row proj off">${inner}</div>`;
  }).join("");
  $("main").innerHTML = `<div class="home-in">
    <div class="top"><h1>trust the dino</h1><button class="help" data-tour title="Walkthrough" aria-label="Walkthrough">?</button></div>
    ${wait ? `<section><div class="label">waiting for you</div>${wait}</section>` : ""}
    <section><div class="label sechead"><span>projects</span>${config.canAdd && !add.open ? `<button data-add>add repository</button>` : ""}</div>
      ${add.open ? addForm() : ""}${projs}</section>
    <button class="reset" data-reset title="Remove connected repositories, decisions and merges">reset demo</button>
  </div>`;
}

/* ---------- add a repository ---------- */

const add = { open: false, busy: false, error: "", line: "" };
function addForm() {
  const jl = add.error ? `<div class="jobline err">${esc(add.error)}</div>`
    : add.busy ? `<div class="jobline" data-jobline="add">${esc(add.line || "queued")}</div>` : "";
  return `<form class="addrepo" ${add.busy ? "inert" : ""}>
      <input name="url" type="url" placeholder="https://github.com/owner/repo.git" required value="${esc(add.url || config.demoRepos?.[0] || "")}">
      <input name="name" placeholder="name (optional)" value="${esc(add.name || "")}">
      ${config.needsToken ? `<input name="token" type="password" placeholder="token" autocomplete="off">` : ""}
      <button class="act main">Add</button><button type="button" class="act" data-add-cancel>Cancel</button>
    </form>${jl}`;
}
async function submitAdd(form) {
  const f = Object.fromEntries(new FormData(form));
  Object.assign(add, { url: f.url, name: f.name, busy: true, error: "", line: "" });
  token.set(f.token);
  const body = { url: f.url.trim() };
  if (f.name?.trim()) body.name = f.name.trim();
  if (config.needsToken) body.token = f.token || token.get();
  renderHome();
  const r = await start("/api/projects", body);
  if (r.error) { Object.assign(add, { busy: false, error: r.error }); return renderHome(); }
  watch(r.job, async (s) => {
    add.line = s.line;
    const el = document.querySelector('[data-jobline="add"]');
    if (el) el.textContent = s.line || s.state;
    if (s.state === "failed") { Object.assign(add, { busy: false, error: "Failed" + (s.line ? ": " + s.line : "") }); if (view.screen === "home") renderHome(); }
    if (s.state === "done") {
      await loadProjects();
      Object.assign(add, { open: false, busy: false, url: "", name: "" });
      if (s.project && project(s.project)) location.hash = `#/p/${enc(s.project)}`;
      else if (view.screen === "home") renderHome();
    }
  });
}

/* ---------- top bar ---------- */

function renderBar() {
  const crumbs = [`<a href="#/">trust the dino</a>`];
  if (view.p) crumbs.push(`<a href="#/p/${enc(view.p.id)}">${esc(view.p.name)}</a>`);
  if (view.b) crumbs.push(`<a href="#/p/${enc(view.p.id)}/b/${enc(view.b.name)}">${esc(view.b.name)}</a>`);
  if (view.c) crumbs.push(`<a href="${commitHref(view.c)}">${esc(view.c.req || view.c.hash.slice(0, 7))}</a>`);
  if (view.unit) crumbs.push(`<span>${esc(view.unit.name)}</span>`);
  const st = view.screen === "review" && view.c ? status(view.c) : "";
  const menu = view.p ? `<button class="mmenu" data-menu aria-label="Branches and commits" aria-expanded="${document.body.classList.contains("menu")}">☰</button>` : "";
  $("bar").innerHTML = `${menu}<div class="crumbs">${crumbs.join('<i>/</i>')}</div><div class="state">${st}</div><button class="help" data-tour title="Walkthrough" aria-label="Walkthrough">?</button>${controls()}`;
  applyPanels();
}

/* ---------- phone: tabs instead of side panels ---------- */

// Change = the code and screenshots; Tests and Decide = the two halves of the side panel.
// A new function always opens on Change; Decide carries the orange dot while its decision is open.
let tabsFor = null;
function renderTabs(hasSide) {
  const u = view.screen === "review" ? view.unit : null;
  const tabs = !u || !hasSide ? [] : [["change", "Change"], ...(u.tests?.tests?.length ? [["tests", "Tests"]] : []),
    ...(u.routed ? [["decide", "Decide", isOpen(view.caseId, u)]] : [])];
  $("mtabs").hidden = tabs.length < 2;
  const key = u && `${view.caseId}/${u.id}`;
  if (key !== tabsFor || !tabs.some(([k]) => k === document.body.dataset.pane)) { tabsFor = key; document.body.dataset.pane = "change"; }
  $("mtabs").innerHTML = tabs.map(([k, name, hot]) =>
    `<button role="tab" data-pane-tab="${k}">${hot ? '<i class="dot hot"></i>' : ""}${name}</button>`).join("");
  showPane(document.body.dataset.pane);
}

/* ---------- left: branches → commits → changed functions ---------- */

function renderNav() {
  const { p } = view;
  let h = `<div class="label sec">branches</div>`;
  for (const b of branches(p)) {
    const sel = b === view.b;
    h += `<a class="branch ${sel ? "sel" : ""}" href="#/p/${enc(p.id)}/b/${enc(b.name)}">
      <span>${esc(b.name)}</span><span class="meta">${b.name === p.default ? "default" : b.base ? "from " + esc(b.base) : ""}</span></a>`;
    if (!sel || !view.c) continue;  // on a branch screen its commits are in the middle
    for (const c of b.commits) {
      const cur = view.c === c;
      const hot = needsHuman(c);
      const inner = `<i class="dot ${hot ? "hot" : c.case ? "" : "none"}"></i><span class="msg">${esc(subject(c))}</span>
        <span class="meta">${esc(c.hash.slice(0, 7))} · ${esc(c.date)}</span>`;
      h += c.case ? `<a class="commit ${cur ? "sel" : ""}" href="${commitHref(c)}">${inner}</a>` : `<div class="commit quiet">${inner}</div>`;
      if (!cur) continue;
      h += `<div class="units">`;
      for (const layer of LAYERS) {
        const us = view.d.units.filter((u) => u.layer === layer);
        if (!us.length) continue;
        h += `<span class="label">${layer}</span>`;
        for (const u of us) {
          const dot = isOpen(c.case, u) ? "hot" : u.tests?.tests?.length ? "" : "open";
          h += `<a class="unit ${u === view.unit ? "sel" : ""}" href="#/c/${enc(c.case)}/${enc(u.id)}"><i class="dot ${dot}"></i><span>${esc(u.name)}</span></a>`;
        }
      }
      h += `</div>`;
    }
  }
  $("nav").innerHTML = h;
}

/* ---------- middle on a branch: its commits ---------- */

function renderBranch() {
  const { p, b } = view;
  const rows = b.commits.map((c) => {
    const inner = `<i class="dot ${needsHuman(c) ? "hot" : c.case ? "" : "none"}"></i>
      <span class="msg">${esc(c.subject)}</span>
      ${c.case ? status(c) : reviewAction(p, b, c)}
      <span class="meta">${esc(c.hash.slice(0, 7))} · ${esc(c.author)} · ${esc(c.date)}</span>`;
    return c.case ? `<a class="row" href="${commitHref(c)}">${inner}</a>` : `<div class="row quiet">${inner}</div>`;
  }).join("");
  $("main").innerHTML = `<div class="branch-in">
    <div class="bhead"><b>${esc(b.name)}</b><span class="label">${b.name === p.default ? "default" : b.base ? "from " + esc(b.base) : ""}</span></div>
    ${rows}</div>`;
}

/* ---------- review a commit that has no dossier yet ---------- */

const reviews = {};   // hash -> { busy, line, error, askToken }
function reviewAction(p, b, c) {
  if (!(config.canReview ?? config.canAdd)) return "";
  if (!p.langs.length) return `<span class="done">no adapter for this language yet</span>`;
  const r = reviews[c.hash];
  if (r?.busy) return `<span class="done" data-jobline="${esc(c.hash)}">${esc(r.line || "queued")}</span>`;
  if (r?.askToken) return `<form class="tokenform" data-review-form="${esc(c.hash)}"><input name="token" type="password" placeholder="token" autocomplete="off"><button class="act">Review</button></form>`;
  return `<span class="done">${r?.error ? `${esc(r.error)} ` : ""}<button class="act" data-review="${esc(c.hash)}">Review</button></span>`;
}
async function startReview(hash, tok) {
  const p = view.p, b = view.b;
  if (config.needsToken && !tok) { reviews[hash] = { askToken: true }; return render(); }
  reviews[hash] = { busy: true, line: "" };
  render();
  const body = { project: p.id, branch: b.name, commit: hash };
  if (config.needsToken) body.token = tok;
  const r = await start("/api/review", body);
  if (r.error) { reviews[hash] = { error: r.error }; return render(); }
  watch(r.job, async (s) => {
    reviews[hash].line = s.line;
    const el = document.querySelector(`[data-jobline="${CSS.escape(hash)}"]`);
    if (el) el.textContent = s.line || s.state;
    if (s.state === "failed") { reviews[hash] = { error: "Failed" + (s.line ? ": " + s.line : "") }; render(); }
    if (s.state === "done") {
      await loadProjects();
      delete reviews[hash];
      const c = s.case || projects.flatMap((x) => x.branches).flatMap((x) => x.commits).find((x) => x.hash === hash)?.case;
      if (c) location.hash = `#/c/${enc(c)}`; else route();
    }
  });
}

/* ---------- render ---------- */

function render() {
  const s = view.screen;
  for (const k of ["home", "project", "review", "missing"]) document.body.classList.toggle(k, k === s);
  if (s === "home") { renderHome(); $("nav").innerHTML = $("side").innerHTML = ""; renderTabs(false); return; }
  if (view.p) renderNav(); else $("nav").innerHTML = "";
  setEmpty("nav", !view.p);
  if (s === "project") { renderBranch(); $("side").innerHTML = ""; setEmpty("side", true); }
  else if (s === "missing") { $("main").innerHTML = `<div class="branch-in"><div class="bhead"><b>${esc(view.caseId)}</b><span class="label">no review yet</span></div></div>`; setEmpty("side", true); }
  else { renderMain($("main"), view.unit); setEmpty("side", !renderSide($("side"), view.d, view.caseId, view.unit)); }
  renderTabs(s === "review" && Boolean($("side").innerHTML));
  renderBar();
}

mountPanels($("app"));
wireReview(() => (view?.screen === "review" ? { d: view.d, caseId: view.caseId, unit: view.unit, label } : null), render);
addEventListener("hashchange", () => { document.body.classList.remove("menu"); route(); });
document.addEventListener("click", (ev) => {
  const tab = ev.target.closest?.("[data-pane-tab]");
  if (tab) return showPane(tab.dataset.paneTab);
  const m = ev.target.closest?.("[data-menu]");
  if (m) m.setAttribute("aria-expanded", document.body.classList.toggle("menu"));
});
document.addEventListener("click", async (ev) => {
  const m = ev.target.closest?.("[data-merge]");
  if (!m) return;
  ev.preventDefault(); ev.stopPropagation();
  if (m.disabled) return;
  m.disabled = true;
  const w = where(m.dataset.merge);
  await decide({ case: w.c.case, unit: null, decision: "merged", by: w.c.approver });
  render();
}, true);
document.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (t.closest?.("[data-add]")) { Object.assign(add, { open: true, error: "" }); renderHome(); document.querySelector(".addrepo input")?.focus(); }
  const rs = t.closest?.("[data-reset]");
  if (rs && !rs.classList.contains("armed")) {
    // no native confirm(): some embedded browsers have none or block it; a second click confirms
    rs.classList.add("armed"); rs.textContent = "click again to reset";
    setTimeout(() => { if (rs.isConnected) { rs.classList.remove("armed"); rs.textContent = "reset demo"; } }, 4000);
  } else if (rs) {
    rs.disabled = true; rs.textContent = "resetting";
    await fetch("/api/reset", { method: "POST", body: "{}" });
    await Promise.all([loadProjects(), loadDecisions()]);
    Object.assign(add, { open: false, busy: false, error: "" });
    if (location.hash.replace(/^#\/?/, "")) location.hash = "#/"; else await route();
  }
  if (t.closest?.("[data-add-cancel]")) { Object.assign(add, { open: false, error: "" }); renderHome(); }
  const rv = t.closest?.("[data-review]");
  if (rv) startReview(rv.dataset.review, token.get());
});
document.addEventListener("submit", (ev) => {
  if (ev.target.matches(".addrepo")) { ev.preventDefault(); return submitAdd(ev.target); }
  const tf = ev.target.closest("[data-review-form]");
  if (tf) { ev.preventDefault(); const t = new FormData(tf).get("token"); token.set(t); startReview(tf.dataset.reviewForm, t); }
});
await Promise.all([loadDecisions(), loadConfig()]);
await route();

try {
  const { mountCreature } = await import("./creature.js");
  creature = mountCreature(document.body);
  creature.setContext({ screen: view.screen === "missing" ? "review" : view.screen, project: view.p?.id ?? null,
    branch: view.b?.name ?? null, caseId: view.caseId ?? null, unitId: view.unit?.id ?? null });
} catch { /* not there yet */ }
if (firstVisit() && !matchMedia(MOBILE).matches) startTour(); // the walkthrough points at the three-column layout
