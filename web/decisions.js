// Decisions live on the server, as an append-only log: the latest record for (case, unit) counts.
// unit null = the whole commit (merge).

let log = [];

export async function loadDecisions() {
  try { log = await (await fetch("/api/decisions", { cache: "no-store" })).json(); } catch { log = []; }
}

export async function decide(rec) {
  const r = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
  const out = await r.json();
  if (out.ok) log = out.decisions;
  return out.ok;
}

export const decided = (caseId, unitId = null) => log.findLast((d) => d.case === caseId && (d.unit ?? null) === unitId) || null;
export const isOpen = (caseId, u) => u.routed && !decided(caseId, u.id);

// Where a commit stands, from its routed functions (`waiting` in projects.json) and its approver.
export function commitState(c) {
  const merged = decided(c.case);
  if (merged?.decision === "merged") return { kind: "merged", by: merged.by };
  const routed = c.waiting || [];
  const back = routed.map((w) => decided(c.case, w.unit)).find((d) => d?.decision === "sent it back");
  if (back) return { kind: "sent back", by: back.by };
  const open = routed.filter((w) => !decided(c.case, w.unit));
  if (open.length) return { kind: "owners", open };
  if (c.approver) return { kind: "merge", by: c.approver };
  return { kind: "none" };
}
export const needsHuman = (c) => !!c.case && ["owners", "merge"].includes(commitState(c).kind);
