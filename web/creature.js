// A pixel T-Rex. It runs along the bottom of the window, sits, types, reads, sleeps or stargazes when idle, its back spines turn orange when something waits on you, and clicking it opens a chat
// about the open commit (answers come from /api/chat and only use that commit's review data).
// With WebGL it is drawn by a shader (dinofx.js): rim light, a dusk sky when it stargazes, heat when you are needed.
//
//   const dino = mountCreature(document.body);
//   dino.setContext({ screen, project, branch, caseId, unitId });

import { dinoFx } from "./dinofx.js";

const CELL = 4; // px per pixel
const FLOOR = 6; // px between the window's bottom edge and the ground (matches .peek bottom)
const PAD = 5; // empty columns on each side for props; equal on both sides so turning around doesn't shift the dino
const SKY = 7; // empty rows above the dino for stars and z's; empty rows are trimmed, the ground row never moves

/* ---------- parts: strings of pixels, facing right ---------- */

// "o"/"k" ink, "p" back spines (grey; orange when you are needed), "e" eye, "g" grey prop, "w" white prop.
const HEAD = {
  front: [".oooooo...", "oooooooo..", "oooeoooooo", "oooooooooo"],
  up: ["......oooo", "....oooooo", "..oooooooo", ".ooeooooo.", "oooooooo..", "oooooo...."],
};
const TORSO = { // neck to ground, without head or arm
  stand: ["......p.p.p..ooooo......", ".....ooooooooooooo......", "...ooooooooooooooo......",
          "oooooooooooooooo........", ".......ooooooooo........", "........ooooooo........."],
  crouch: ["......p.p.p..ooooo......", ".....ooooooooooooo......", "...ooooooooooooooo......",
           "oooooooooooooooo........", ".......ooooooooo........", "........oooooooo........",
           ".......kkkk..kkkk......."],
  sit: ["......p.p.p..ooooo......", ".....ooooooooooooo......", "...ooooooooooooooo......",
        "..oooooooooooooo........", ".oo....oooooooooo.......", "oo.....kkkkkkkkkkkk....."],
  lie: ["......p.p.p.............", "....oooooooooo...oooooo.", "..oooooooooooooooooowwoo", // head down, eye shut
        ".ooooooooooooooooooooooo", "oooooooooooooooooooooo.."],
};
const LEGS = {
  stand: ["........kk...kk.........", "........kkk..kkk........"],
  stepA: ["........kk...kk.........", "........kkk............."], // front foot up
  stepB: ["........kk...kk.........", ".............kkk........"], // back foot up
  dangle: ["........kk...kk.........", ".........k....k........."], // held or falling
};
const ARM = { // the shoulder is the left end of the bottom row for raised arms, of the top row otherwise
  rest: ["ooo", "..o"],
  tap: ["ooo..", "...o.", "....o"],
  forward: ["oooo.", "....o"],
  lift: ["ooo.", "...o"],
  sip: ["....o", "...o.", "ooo.."],
  waveUp: ["....oo", "...o..", "ooo..."],
  waveDown: ["ooooo.", ".....o", ".....o"],
};
const SCREEN = [["gww", "www", "www"], ["ggw", "www", "www"], ["ggw", "gww", "www"], ["ggw", "ggg", "gww"]];
const DIFF = ["kkkw", "gggw", "wwww", "kkkk", "ggww", "kkww", "wwww", "gggg"]; // a page of code, scrolling
const MUG = ["gggg.", "ggg.g", "ggg.g", "gggg."];
const STEAM = [["..g", ".g.", "..g"], [".g.", "..g", ".g."]];
const STAR = [[".g.", "gkg", ".g."], ["...", ".k.", "..."], ["...", "...", "..."], ["...", ".g.", "..."]];
const STARS = [[8, -4], [15, -7], [24, -5]];
const Z = ["gggg", "..g.", ".g..", "gggg"];
const Z_PATH = [[19, 3], [20, 0], [23, -3], [24, -7]];

/* ---------- poses: [x, y, rows, upright] layers in dino coordinates (row 11 is the ground) ---------- */
// upright layers (text, screens) move with the dino when it turns but are not mirrored

const standing = (legs, arm = ARM.rest, armY = 6) => [[0, 4, TORSO.stand], [0, 10, LEGS[legs]], [13, 0, HEAD.front], [18, armY, arm]];
const sitting = (head = HEAD.front, y = 2, arm = ARM.rest) => [[0, 6, TORSO.sit], [13, y, head], [18, 8, arm]];

const POSES = {
  stand: (t, legs) => standing(legs),
  crouch: () => [[0, 5, TORSO.crouch], [13, 1, HEAD.front], [18, 7, ARM.rest]],
  sit: () => sitting(),
  type: (t) => [...sitting(HEAD.front, 2 + (t % 2), t % 2 ? ARM.forward : ARM.tap),
                [22, 6, ["..kkkkk", ...SCREEN[t % 4].map((l) => `..k${l}k`), "..kkkkk", "ggggggg"], true]],
  stars: (t) => [...sitting(HEAD.up, 0), ...STARS.map(([x, y], i) => [x, y, STAR[(t + 2 * i) % STAR.length]])],
  sleep: (t) => [[0, 7, TORSO.lie], ...Z_PATH.filter((_, i) => (i + t) % 2 === 0).map(([x, y]) => [x, y, Z, true])],
  read: (t) => [...sitting(HEAD.front, 2, ARM.forward),
                [23, 6, ["kkkkkk", ...[0, 1, 2, 3].map((i) => `g${DIFF[(t + i) % DIFF.length]}g`), "kkkkkk"], true]],
  coffee: (t) => t % 5 < 3
    ? [...standing("stand", ARM.lift), [22, 7, MUG], [21, 4, STEAM[t % 2]]]
    : [...standing("stand", ARM.sip, 4), [23, 1, MUG]],
  wave: (t) => t % 2 ? standing("stand", ARM.waveUp, 4) : standing("stand", ARM.waveDown),
};

// Idle activities: ticks per animation frame, length in ticks, the poses it passes through to get there and back.
const ACTS = {
  sit: { every: 20, len: [70, 140], via: ["crouch"] },
  type: { every: 3, len: [80, 140], via: ["crouch", "sit"] },
  stars: { every: 5, len: [70, 120], via: ["crouch", "sit"] },
  sleep: { every: 10, len: [120, 200], via: ["crouch", "sit"] },
  read: { every: 12, len: [80, 140], via: ["crouch", "sit"] },
  coffee: { every: 8, len: [60, 100], via: [] },
  wave: { every: 4, len: [32, 32], via: [] }, // only when the cursor comes close
};
const RANDOM_ACTS = ["sit", "type", "stars", "sleep", "read", "coffee"];
const VIA_TICKS = 3;

/* ---------- drawing ---------- */

export function frame({ blink = false, facing = 1, legs = "stand", signal = false, pose = "stand", t = 0 }) {
  const grid = Array.from({ length: SKY + 12 }, () => Array(24 + 2 * PAD).fill("."));
  for (const [x, y, rows, upright] of POSES[pose](t, legs)) {
    // an upright layer is pre-reversed, so the mirror below puts it back the right way round
    const flip = (row) => (upright && facing < 0 ? [...row].reverse().join("") : row);
    rows.map(flip).forEach((row, dy) => [...row].forEach((c, dx) => {
      if (c !== ".") grid[SKY + y + dy][PAD + x + dx] = c === "e" && blink ? "o" : c === "p" && signal ? "!" : c;
    }));
  }
  while (grid[0].every((c) => c === ".")) grid.shift();
  return facing < 0 ? grid.map((row) => row.reverse()) : grid;
}

export function svg(grid) {
  const ink = "var(--peek-ink)";
  const fill = { o: ink, k: ink, p: "var(--peek-plate)", g: "var(--peek-plate)", e: "var(--peek-eye)", w: "var(--peek-eye)", "!": "var(--peek-hot)" };
  let rects = "";
  grid.forEach((row, y) => row.forEach((c, x) => {
    if (fill[c]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill[c]}"/>`;
  }));
  const w = grid[0].length, h = grid.length;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w * CELL}" height="${h * CELL}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// The pose an activity shows at `tick`: through `via` on the way in, the loop, back through `via` on the way out.
export function actPose({ name, start, end }, tick) {
  const { every, via } = ACTS[name];
  const i = Math.floor(Math.min(tick - start, end - tick) / VIA_TICKS);
  if (i < via.length) return [via[i], 0];
  return [name, Math.floor((tick - start - via.length * VIA_TICKS) / every)];
}

/* ---------- behaviour ---------- */

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export function mountCreature(root) {
  const el = document.createElement("div");
  el.className = "peek";
  el.innerHTML = `<button class="peek-body" aria-label="Ask about this commit"></button>
    <div class="peek-chat" hidden>
      <div class="peek-head"><span class="peek-title"></span><button class="peek-close" aria-label="Close">×</button></div>
      <div class="peek-log"></div>
      <form class="peek-form"><input class="peek-input" placeholder="Ask about this commit" autocomplete="off"></form>
    </div>`;
  root.append(el);
  const body = el.querySelector(".peek-body");
  const chat = el.querySelector(".peek-chat");
  const log = el.querySelector(".peek-log");
  const input = el.querySelector(".peek-input");

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fx = dinoFx(body, CELL);
  const glow = { sky: 0, heat: 0 }; // eased toward their targets one step per draw
  // x: px from the left; y: px above the floor; vy: falling speed; rest: tick until it may wander again;
  // act: the idle activity {name, start, end} in ticks; since: tick the current screen opened; waved: tick of the last wave
  const state = { x: innerWidth - 140, y: 0, vy: 0, held: false, rest: 0, target: null, dir: -1, step: 0,
                  blink: false, signal: false, talking: false, ctx: { screen: "home" }, history: [], tick: 0,
                  act: null, since: 0, waved: -Infinity };
  const WIDTH = 96, GRAVITY = 3, REST_TICKS = 100, SETTLE_TICKS = 20; // a tick is 50 ms

  // held > falling > chatting > walking > activity > idle
  function mode() {
    if (state.held) return "held";
    if (state.y > 0) return "falling";
    if (state.talking) return "chatting";
    if (state.target !== null) return "walking";
    return state.act ? "acting" : "idle";
  }

  function draw() {
    const m = mode();
    let pose = still && m === "idle" ? "sit" : "stand", t = 0;
    if (m === "acting") [pose, t] = actPose(state.act, state.tick);
    const legs = m === "held" || m === "falling" ? "dangle" : m === "walking" ? (state.step % 2 ? "stepA" : "stepB") : "stand";
    const grid = frame({ blink: state.blink, facing: state.dir, legs, signal: state.signal, pose, t });
    body.querySelector("svg")?.remove();
    body.insertAdjacentHTML("afterbegin", svg(grid)); // kept under the shader canvas for layout, and as the fallback
    if (fx) {
      const ease = (k, to) => (glow[k] += Math.sign(to - glow[k]) * Math.min(0.08, Math.abs(to - glow[k])));
      ease("sky", pose === "stars" ? 1 : 0);
      ease("heat", state.signal ? 1 : 0);
      fx.draw(grid, { ...glow, t: still ? 0 : state.tick * 0.05 });
    }
    el.style.transform = `translate(${Math.round(state.x)}px, ${-Math.round(state.y)}px)`;
  }

  function wander() {
    if (still || state.ctx.screen === "home" || state.tick < state.rest) return false;
    const margin = 40;
    state.target = margin + Math.random() * (innerWidth - 2 * margin - WIDTH);
    state.dir = state.target > state.x ? 1 : -1;
    return true;
  }

  const canAct = () => !still && mode() === "idle" && state.tick - state.since > SETTLE_TICKS;
  function startAct(name) {
    const [min, max] = ACTS[name].len;
    state.act = { name, start: state.tick, end: state.tick + min + Math.floor(Math.random() * (max - min)) };
  }
  function choose() { // walk, do something, or turn around
    const r = Math.random();
    if (r < 0.35 && wander()) return;
    if (r < 0.85 && canAct()) return startAct(pick(RANDOM_ACTS));
    state.dir = pick([-1, 1]);
  }
  function stopAct() { if (state.act) { state.act = null; draw(); } }

  // one clock for everything: walking moves 2px per tick, legs alternate every 4 ticks, a choice every 3 s
  setInterval(() => {
    state.tick++;
    if (state.held) return;
    if (state.y > 0) fall();
    else if (state.target !== null) {
      state.x += 2 * state.dir;
      if (state.tick % 4 === 0) state.step++;
      if ((state.dir > 0 && state.x >= state.target) || (state.dir < 0 && state.x <= state.target)) state.target = null;
    } else if (state.act) {
      if (state.tick >= state.act.end) state.act = null;
    } else if (state.tick % 60 === 0 && !state.talking) choose();
    if (state.tick % 90 === 0) { state.blink = true; setTimeout(() => { state.blink = false; draw(); }, 140); }
    draw();
  }, 50);

  // waves at the cursor when it comes near (but not onto it), at most every 15 s
  addEventListener("pointermove", (e) => {
    if (!canAct() || state.tick - state.waved < 300) return;
    const r = body.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over || Math.hypot(dx, dy) > 160) return;
    state.dir = dx > 0 ? 1 : -1;
    state.waved = state.tick;
    startAct("wave");
    draw();
  });

  /* ---------- pick up, carry, drop ---------- */

  function fall() {
    state.vy += GRAVITY;
    state.y = Math.max(0, state.y - state.vy);
    if (state.y === 0) land();
  }

  function land() {
    state.vy = 0;
    state.rest = state.tick + REST_TICKS; // stays where it was put for a while
    body.classList.add("land");
    setTimeout(() => body.classList.remove("land"), 160);
  }

  let grab = null; // {dx, dy, startX, startY, moved}
  body.addEventListener("pointerdown", (e) => {
    const r = el.getBoundingClientRect();
    grab = { dx: e.clientX - r.left, dy: r.bottom - e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    body.setPointerCapture(e.pointerId);
    stopAct();
  });
  body.addEventListener("pointermove", (e) => {
    if (!grab) return;
    if (!grab.moved && Math.hypot(e.clientX - grab.startX, e.clientY - grab.startY) < 5) return;
    if (!grab.moved) { grab.moved = true; state.held = true; state.target = null; closeChat(); }
    const x = Math.min(Math.max(e.clientX - grab.dx, 0), innerWidth - WIDTH);
    if (x !== state.x) state.dir = x > state.x ? 1 : -1;
    state.x = x;
    state.y = Math.min(Math.max(innerHeight - FLOOR - e.clientY - grab.dy, 0), innerHeight - 80);
    draw();
  });
  body.addEventListener("pointerup", () => {
    if (grab?.moved) { state.held = false; state.vy = 0; if (state.y === 0) land(); }
    else if (grab) chat.hidden ? openChat() : closeChat();
    grab = null;
  });
  body.addEventListener("pointercancel", () => { grab = null; state.held = false; });

  /* ---------- chat ---------- */

  function say(role, text) {
    const p = document.createElement("p");
    p.className = "peek-msg " + role;
    p.textContent = text;
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  // The bubble sits over the dino but never past the window edge; its tail keeps pointing at the dino.
  function placeChat() {
    if (chat.hidden) return;
    const EDGE = 8, w = chat.offsetWidth, box = el.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const left = Math.max(EDGE, Math.min(mid - w / 2, innerWidth - EDGE - w));
    chat.style.left = left - box.left + "px";
    chat.style.setProperty("--tail", Math.max(14, Math.min(mid - left, w - 14)) + "px");
  }

  function openChat() {
    state.talking = true; state.target = null; state.act = null;
    chat.hidden = false;
    placeChat();
    const hasCommit = Boolean(state.ctx.caseId);
    el.querySelector(".peek-title").textContent = hasCommit ? state.ctx.title || state.ctx.caseId : "trust";
    input.disabled = !hasCommit;
    if (!log.childElementCount) say("assistant", hasCommit ? "Ask me about this commit." : "Open a commit and ask me about it.");
    if (hasCommit) input.focus();
  }
  function closeChat() { chat.hidden = true; state.talking = false; }

  body.addEventListener("keydown", (e) => {  // keyboard users open the chat with Enter or Space
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chat.hidden ? openChat() : closeChat(); }
  });
  el.querySelector(".peek-close").addEventListener("click", closeChat);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !chat.hidden) closeChat(); });

  el.querySelector(".peek-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || input.disabled) return;
    input.value = "";
    say("user", q);
    state.history.push({ role: "user", content: q });
    const wait = say("assistant pending", "…");
    input.disabled = true;
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case: state.ctx.caseId, unit: state.ctx.unitId, messages: state.history }) });
      const data = await r.json();
      wait.textContent = data.reply || data.error || "No answer.";
      if (data.reply) state.history.push({ role: "assistant", content: data.reply });
    } catch {
      wait.textContent = "The server didn't answer.";
    }
    wait.classList.remove("pending");
    input.disabled = false;
    input.focus();
  });

  /* ---------- context from the app ---------- */

  async function setContext(ctx) {
    const changed = ctx.caseId !== state.ctx.caseId;
    const wasHome = state.ctx.screen === "home" && state.tick > 0;
    if (ctx.screen !== state.ctx.screen) state.since = state.tick;
    state.ctx = { ...ctx };
    if (changed) { state.history = []; log.innerHTML = ""; }
    state.signal = false;
    if (ctx.caseId) {
      try {
        const d = await (await fetch(`../dossier/${encodeURIComponent(ctx.caseId)}.json`)).json();
        state.ctx.title = d.commit?.subject;
        state.signal = d.units.some((u) => u.routed);
      } catch { /* no dossier: no signal */ }
    }
    if (ctx.screen === "home" && !wasHome) { state.act = null; state.target = null; state.dir = -1; state.x = innerWidth - 140; state.y = 0; }
    if (!chat.hidden) openChat();
    draw();
  }

  addEventListener("resize", () => { state.x = Math.min(state.x, innerWidth - WIDTH); draw(); placeChat(); });
  draw();
  return { setContext };
}
