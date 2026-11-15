// Adding a repository and reviewing a commit both start a server job; we poll it once a second.

export let config = { canAdd: false, needsToken: false };

export async function loadConfig() {
  try {
    const r = await fetch("/api/config", { cache: "no-store" });
    if (r.ok) config = { ...config, ...(await r.json()) };
  } catch { /* no server API: nothing to add */ }
}

// POST, then { job } or { error }
export async function start(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    if (r.status === 403) return { error: out.error || "Not allowed on this server" };
    if (!r.ok || !out.job) return { error: out.error || `Server said ${r.status}` };
    return { job: out.job };
  } catch {
    return { error: "Server not reachable" };
  }
}

// onUpdate({ state, line, project?, case? }) until done or failed
export function watch(job, onUpdate) {
  const tick = async () => {
    let s;
    try { s = await (await fetch(`/api/jobs/${encodeURIComponent(job)}`, { cache: "no-store" })).json(); }
    catch { s = { state: "running", log: [] }; }
    const line = (s.log || []).filter((l) => String(l).trim()).at(-1) || "";
    onUpdate({ ...s, line });
    if (s.state !== "done" && s.state !== "failed") setTimeout(tick, 1000);
  };
  tick();
}

export const token = {
  get: () => sessionStorage.getItem("trust:token") || "",
  set: (t) => t && sessionStorage.setItem("trust:token", t),
};
