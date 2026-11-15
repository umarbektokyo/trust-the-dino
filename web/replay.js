// The first time a function's tests are opened, its test run plays from the run's own record: which
// functions the plan sent to a test writer, each writer's rounds (compile errors, tests, coverage, real
// seconds), then the boxes appear one by one, about 20x faster than the real run. Skipped for automated browsers (the video and screenshot scripts), reduced motion, and repeat visits.

const SEEN = "trust:replayed";
const PACE = 1.5;    // pauses of the interface itself (log lines, compile)
const MODEL = 1 / 11; // the model's real writing time, sped up: a 33 s round shows for 3 s (kept between 1.1 and 3.4 s)
const short = (id) => id.split(":").slice(1).join(":");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function seen(key) {
  try {
    const all = JSON.parse(sessionStorage.getItem(SEEN) || "[]");
    if (all.includes(key)) return true;
    sessionStorage.setItem(SEEN, JSON.stringify([...all, key]));
  } catch { /* storage off: replay every time */ }
  return false;
}

// a reset or a newly connected repository starts over: every review plays its run again
export function forgetRuns() { try { sessionStorage.removeItem(SEEN); } catch { /* storage off */ } }

let current = 0; // the run on screen; an older run that is still going must not touch the new view

export function replay(side, d, caseId, u) {
  const box = side.querySelector(".tests");
  const ts = u.tests?.tests || [];
  if (!box || !ts.length || navigator.webdriver || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (seen(`${caseId}/${u.id}`)) return;
  run(box, d, u, ts, ++current);
}

async function run(box, d, u, ts, id) {
  // the diff shows straight away; what the tests found (lines run, lines never run) waits for the run
  const main = document.getElementById("main");
  main.classList.add("testing");
  const tested = d.units.filter((x) => x.tests?.rounds?.length || x.tests?.tests?.length);
  const changed = d.units.length;
  const boxes = (sel) => [...box.querySelectorAll(sel)];
  const byName = new Map(boxes(".box[data-test]").map((b) => [b.dataset.test, b]));
  const pick = (f) => ts.filter(f).map((t) => byName.get(t.name)).filter(Boolean);

  box.classList.add("replaying");
  const log = document.createElement("div");
  log.className = "runlog";
  log.setAttribute("role", "status");
  log.innerHTML = `<div class="rl-head"><span>test run</span><button data-skip-replay>skip</button></div>
    <div class="agents">${tested.map((x) => `<span class="agent${x.id === u.id ? " me" : ""}" data-agent="${x.id}"><i></i>${short(x.id)}</span>`).join("")}</div>
    <div class="rl-lines"></div>`;
  box.querySelector(".key").after(log);
  const lines = log.querySelector(".rl-lines");
  let skipped = false;
  log.querySelector("[data-skip-replay]").addEventListener("click", () => { skipped = true; });
  const sleep = (ms) => (skipped ? null : pause(Math.max(0, ms)));
  const wait = (ms) => sleep(ms * PACE);                       // pauses of the interface itself
  const rand = (a, b) => a + Math.random() * (b - a);
  const say = (html, cls = "") => { const p = document.createElement("div"); p.className = "rl " + cls; p.innerHTML = html; lines.append(p); return p; };
  const info = new Map(ts.map((t) => [t.name, t]));
  const size = (b) => info.get(b.dataset.test)?.source?.length || 600;

  // Writing: the model streams one file, so a test shows up (grey, not run yet) when its code would have
  // finished streaming: its place in the file, by real source length, over the round's real time, sped up.
  const stream = async (bs, ms) => {
    const total = bs.reduce((s, b) => s + size(b), 0) || 1;
    let at = ms * rand(0.08, 0.15), done = 0;            // imports and helpers come first
    await sleep(at);
    for (const b of bs) {
      done += size(b);
      const next = ms * done / total;
      await sleep(next - at + rand(-60, 90));
      at = next;
      b.classList.add("shown", "writing");
    }
  };
  // Running: go test compiles for a moment, then every result lands within a few milliseconds; shown as
  // a quick, scattered cascade so the eye can follow it.
  const run = async (bs) => {
    await sleep(rand(280, 420) * PACE);
    for (const b of [...bs].sort(() => Math.random() - 0.5)) {
      b.classList.remove("writing");
      await sleep(rand(6, 45));
    }
  };
  const modelMs = (r) => Math.min(3400, Math.max(1100, (r.meta?.seconds || 20) * 1000 * MODEL));

  say(`plan · ${changed} function${changed === 1 ? "" : "s"} changed · ${tested.length} get a test writer`);
  await wait(450);

  // the other writers finish on their own clocks, from their real time
  const total = (x) => (x.tests?.rounds || []).reduce((s, r) => s + (r.meta?.seconds || 0), 0);
  for (const x of tested) {
    const chip = log.querySelector(`[data-agent="${CSS.escape(x.id)}"]`);
    chip.classList.add("busy");
    if (x.id !== u.id) setTimeout(() => { chip.classList.remove("busy"); chip.classList.add("done"); },
      skipped ? 0 : Math.min(9000, total(x) * 1000 * MODEL * rand(0.9, 1.15)));
  }

  const kept = pick((t) => t.origin === "kept");
  if (kept.length) {
    const line = say(`saved tests · loading ${kept.length} from earlier commits`);
    for (const b of kept) { b.classList.add("shown", "writing"); await sleep(rand(10, 35)); }
    line.textContent = `saved tests · ${kept.length} from earlier commits · running`;
    await run(kept);
    line.textContent = `saved tests · ${kept.length} from earlier commits run again`;
    await wait(250);
  }

  const fresh = pick((t) => t.origin !== "kept" && t.from !== "guard");
  const rounds = u.tests.rounds || [];
  const most = Math.max(...rounds.map((x) => x.tests || 0), 1);
  let shown = 0;
  for (const r of rounds) {
    const secs = r.meta?.seconds ? ` · ${Math.round(r.meta.seconds)} s` : "";
    const line = say(`round ${r.round} · nemotron is writing<span class="dots"></span>`);
    if (!r.compiled) {
      await sleep(modelMs(r));
      const why = (r.error || "").split("\n")[0].replace(/^\.\/\S+:\d+:\d+: /, "");
      line.className = "rl bad";
      line.innerHTML = `round ${r.round}${secs} · didn't compile${why ? `: <code>${why.replace(/</g, "&lt;")}</code>` : ""} → sent back`;
      await wait(450);
      continue;
    }
    const upto = Math.min(fresh.length, Math.round(fresh.length * r.tests / most));
    await stream(fresh.slice(shown, upto), modelMs(r));
    shown = Math.max(shown, upto);
    line.innerHTML = `round ${r.round}${secs} · ${r.tests} tests compiled · ${Math.round(r.coverage ?? 0)}% of lines run`;
    await wait(200);
  }
  if (shown < fresh.length) await stream(fresh.slice(shown), 600);

  const guard = pick((t) => t.from === "guard");
  if (guard.length) {
    const line = say(`guard tests · nemotron is writing<span class="dots"></span>`);
    await stream(guard, rand(1200, 1800));
    line.textContent = `guard tests · ${guard.length} written from the rule the old code enforced`;
  }

  const waiting = boxes(".box.writing");
  if (waiting.length) {
    const line = say(`go test · the agent's commit and the one before<span class="dots"></span>`);
    await run(waiting);
    line.textContent = "go test · the agent's commit and the one before";
  }

  const pass = ts.filter((t) => t.head).length;
  say(`ran every test on both commits · ${pass} pass now · ${ts.length - pass} fail now`, "end");
  boxes(".box[data-test]").forEach((b) => { b.classList.add("shown"); b.classList.remove("writing"); });
  log.querySelector(`[data-agent="${CSS.escape(u.id)}"]`)?.classList.replace("busy", "done");
  log.querySelectorAll(".agent.busy").forEach((c) => c.classList.replace("busy", "done"));
  await wait(200);
  if (id === current) main.classList.remove("testing");
  box.classList.remove("replaying");
  log.classList.add("over");
  log.querySelector("[data-skip-replay]").remove();
}
