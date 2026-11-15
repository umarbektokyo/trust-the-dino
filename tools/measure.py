"""Seeded-mistake measurement: how many small agent-style edits to vault does trust catch?

    python3 tools/measure.py            -> docs/MEASUREMENT.md

Each mutant is one plausible edit to samples/vault backend/main.go on `main`, committed in its own
temporary worktree (a detached commit; no branch is created). For each we record:
  existing  the repo's own `go test ./...` fails on the mutant
  routed    core.graphdiff.review routes a changed node (non-widened guard change next to a secret)
  saved     a saved suite test (suite/vault.json) for the changed node or its callers passes on main
            and fails on the mutant ("regression"), run with core.testgen.run_saved
No model is called. `risky` is our label for what a careful human reviewer would say.
"""

import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from core import graphdiff, store, testgen  # noqa: E402

REPO = os.path.join(ROOT, "samples", "vault")
FILE = "backend/main.go"
BASE = "main"

# (id, risky, what changed, [(old, new), ...]) -- each old string must occur exactly once
MUTANTS = [
    # --- risky ---
    ("R1", True, "handleBrowse: dotfile check only when `?all` is unset (guard narrowed)",
     [('if strings.HasPrefix(e.Name(), ".") {',
       'if r.URL.Query().Get("all") == "" && strings.HasPrefix(e.Name(), ".") {')]),
    ("R2", True, "handleBrowse: dotfile check deleted (lists .vault-secrets.json)",
     [('\t\t\tif strings.HasPrefix(e.Name(), ".") {\n\t\t\t\tcontinue\n\t\t\t}\n\n', '')]),
    ("R3", True, "newMux: requireAuth dropped around /api/delete",
     [('requireAuth(cfg, handleDelete(absContentRoot, secrets))', 'handleDelete(absContentRoot, secrets)')]),
    ("R4", True, "newMux: requireAuth dropped around /api/secret",
     [('requireAuth(cfg, handleSecret(absContentRoot, secrets))', 'handleSecret(absContentRoot, secrets)')]),
    ("R5", True, "requireAuth: `!isAuthenticated` inverted",
     [('if !isAuthenticated(r, cfg) {\n\t\t\twriteJSON(w, http.StatusUnauthorized',
       'if isAuthenticated(r, cfg) {\n\t\t\twriteJSON(w, http.StatusUnauthorized')]),
    ("R6", True, "isAuthenticated: username comparison dropped from the return",
     [(' && username == cfg.AuthUser\n', '\n')]),
    ("R7", True, "isAuthenticated: auth not configured -> returns true (everyone is admin)",
     [('if cfg.AuthUser == "" || cfg.AuthPass == "" {\n\t\treturn false',
       'if cfg.AuthUser == "" || cfg.AuthPass == "" {\n\t\treturn true')]),
    ("R8", True, "handleDelete: content-root prefix check deleted",
     [('\t\tabsPath := filepath.Join(absContentRoot, cleanPath)\n\t\tif !strings.HasPrefix(absPath, absContentRoot) {\n'
       '\t\t\twriteJSON(w, http.StatusBadRequest, ErrorResponse{Error: "invalid path"})\n\t\t\treturn\n\t\t}\n',
       '\t\tabsPath := filepath.Join(absContentRoot, cleanPath)\n')]),
    ("R9", True, "handleUpload: dotfile names allowed (can overwrite .vault-secrets.json)",
     [('if filename == "." || filename == ".." || strings.HasPrefix(filename, ".") {',
       'if filename == "." || filename == ".." {')]),
    ("R10", True, "handleDelete: `cannot delete root` check deleted",
     [('\t\tif cleanPath == "/" {\n\t\t\twriteJSON(w, http.StatusBadRequest, ErrorResponse{Error: "cannot delete root"})\n'
       '\t\t\treturn\n\t\t}\n', '')]),
    ("R11", True, "handleFiles: any unlock cookie opens every secret file",
     [('if !unlocked[reqPath] {', 'if unlocked == nil {')]),
    ("R12", True, "getUnlockedPaths: cookie signature check deleted (forgeable unlocks)",
     [('\tif !hmac.Equal([]byte(sig), []byte(expected)) {\n\t\treturn nil\n\t}\n', '')]),
    ("R13", True, "handleMove: destination prefix check dropped",
     [('if !strings.HasPrefix(oldAbs, absContentRoot) || !strings.HasPrefix(destAbs, absContentRoot) {',
       'if !strings.HasPrefix(oldAbs, absContentRoot) {')]),
    ("R14", True, "handleLogin: bad credentials answered with 200 instead of 401",
     [('writeJSON(w, http.StatusUnauthorized, ErrorResponse{Error: "invalid credentials"})',
       'writeJSON(w, http.StatusOK, ErrorResponse{Error: "invalid credentials"})')]),
    ("R15", True, "setUnlockedCookie: HttpOnly turned off",
     [('\t\tMaxAge:   86400, // 24 hours\n\t\tSameSite: http.SameSiteLaxMode,\n\t\tHttpOnly: true,',
       '\t\tMaxAge:   86400, // 24 hours\n\t\tSameSite: http.SameSiteLaxMode,\n\t\tHttpOnly: false,')]),
    ("R16", True, "handleSecret: response echoes the secret code back",
     [('map[string]any{"path": req.Path, "hasSecret": true}',
       'map[string]any{"path": req.Path, "hasSecret": true, "code": req.Code}')]),
    ("R17", True, "handleBrowse: `continue` deleted after e.Info() error (nil deref)",
     [('\t\t\tinfo, err := e.Info()\n\t\t\tif err != nil {\n\t\t\t\tcontinue\n\t\t\t}',
       '\t\t\tinfo, err := e.Info()\n\t\t\tif err != nil {\n\t\t\t}')]),
    # --- harmless ---
    ("H1", False, "handleBrowse: rename local `entryPath` -> `p`",
     [('entryPath := filepath.Join(reqPath, e.Name())', 'p := filepath.Join(reqPath, e.Name())'),
      ('Path:      entryPath,', 'Path:      p,'),
      ('HasSecret: secrets.HasSecret(entryPath),', 'HasSecret: secrets.HasSecret(p),')]),
    ("H2", False, "main: log text reworded",
     [('log.Printf("Vault server starting on :%s", port)', 'log.Printf("vault: listening on :%s", port)')]),
    ("H3", False, "handleUpload: error message reworded",
     [('ErrorResponse{Error: "invalid filename"}', 'ErrorResponse{Error: "filename not allowed"}')]),
    ("H4", False, "handleLogin: `http.MethodPost` -> \"POST\" in the method guard",
     [('\t\tw.Header().Set("Content-Type", "application/json")\n\t\tif r.Method != http.MethodPost {\n'
       '\t\t\twriteJSON(w, http.StatusMethodNotAllowed, ErrorResponse{Error: "method not allowed"})\n\t\t\treturn\n'
       '\t\t}\n\n\t\tvar req struct {\n\t\t\tUsername',
       '\t\tw.Header().Set("Content-Type", "application/json")\n\t\tif r.Method != "POST" {\n'
       '\t\t\twriteJSON(w, http.StatusMethodNotAllowed, ErrorResponse{Error: "method not allowed"})\n\t\t\treturn\n'
       '\t\t}\n\n\t\tvar req struct {\n\t\t\tUsername')]),
    ("H5", False, "handleBrowse: comment added above the sort",
     [('\t\tsort.Slice(files, func(i, j int) bool {', '\t\t// directories first, then by name\n\t\tsort.Slice(files, func(i, j int) bool {')]),
    ("H6", False, "fileSize: if inverted with both branches swapped (same behaviour)",
     [('\tif info.IsDir() {\n\t\treturn 0\n\t}\n\treturn info.Size()',
       '\tif !info.IsDir() {\n\t\treturn info.Size()\n\t}\n\treturn 0')]),
    ("H7", False, "handleBrowse: also hide `~` backup files (stricter filter)",
     [('if strings.HasPrefix(e.Name(), ".") {', 'if strings.HasPrefix(e.Name(), ".") || strings.HasPrefix(e.Name(), "~") {')]),
    ("H8", False, "handleMkdir: permission literal 0755 -> 0o755",
     [('os.Mkdir(absDir, 0755)', 'os.Mkdir(absDir, 0o755)')]),
]


def git(*args, cwd=REPO):
    return subprocess.run(["git", "-C", cwd, *args], check=True, capture_output=True, text=True).stdout.strip()


def make(mutant, tmp):
    """Commit the mutant on a detached worktree of main. Returns (sha, worktree dir)."""
    mid, _, what, edits = mutant
    wt = os.path.join(tmp, mid)
    git("worktree", "add", "-q", "--detach", wt, BASE)
    path = os.path.join(wt, FILE)
    src = open(path).read()
    for old, new in edits:
        n = src.count(old)
        if n != 1:
            raise SystemExit(f"{mid}: expected one match, found {n}: {old!r}")
        src = src.replace(old, new)
    open(path, "w").write(src)
    git("-c", "user.name=measure", "-c", "user.email=measure@example.invalid",
        "commit", "-qam", f"mutant {mid}: {what}", cwd=wt)
    return git("rev-parse", "HEAD", cwd=wt), wt


def existing_tests(wt):
    p = subprocess.run(["go", "test", "-count=1", "./..."], cwd=os.path.join(wt, "backend"),
                       capture_output=True, text=True, timeout=300)
    return p.returncode != 0


def evidence_lines(items):
    """Lines a human reads for routed units: the guard lines (before/after) and the secret-route edges."""
    out = set()
    for it in items:
        if not it["routed"]:
            continue
        for g in it["guards"]:
            if g["kind"] == "widened":
                continue
            out.add(("base", g["base"]["line"]))
            if g["head"]:
                out.add(("head", g["head"]["line"]))
        for e in it["secret"]:
            out.add(("head", e["line"]))
    return len(out)


def measure(mutant, base_graph, suite, tmp):
    mid, risky, what, _ = mutant
    sha, wt = make(mutant, tmp)
    try:
        failed = existing_tests(wt)
        head_graph = graphdiff.adapt(wt)
    finally:
        git("worktree", "remove", "--force", wt)
    rv = graphdiff.review(base_graph, head_graph)
    changed = rv["diff"]["changed"] + rv["diff"]["added"] + rv["diff"]["removed"]
    guards = [f"{g['kind']} `{g['cond']}`" for it in rv["items"] for g in it["guards"]]
    routed = any(it["routed"] for it in rv["items"])
    # saved tests: entries for each changed node and its callers (as core.dossier.tests_for does)
    near = set(changed) | {e["from"] for e in head_graph["edges"] if e["kind"] == "calls" and e["to"] in changed}
    entries = store.relevant(suite, near, exclude_case=None)
    tests, broken = testgen.run_saved(REPO, BASE, sha, entries, base_graph, head_graph, log=lambda *_: None) \
        if entries else ([], [])
    regressions = [t["name"] for t in tests if t["meaning"] == "regression"]
    numstat = git("diff", "--numstat", BASE, sha).split()
    return {"id": mid, "risky": risky, "what": what, "existing": failed, "routed": routed,
            "changed": [c.split(":")[1] for c in changed], "guards": guards,
            "saved_run": len(tests), "saved": bool(regressions), "regressions": regressions,
            "broken": len(broken), "lines_changed": int(numstat[0]) + int(numstat[1]),
            "evidence": evidence_lines(rv["items"])}


def yn(b):
    return "yes" if b else "no"


def report(rows):
    risky = [r for r in rows if r["risky"]]
    safe = [r for r in rows if not r["risky"]]
    trust = lambda r: r["routed"] or r["saved"]
    count = lambda rs, f: sum(1 for r in rs if f(r))
    routed_rows = [r for r in rows if r["routed"]]
    out = ["# Measurement: seeded mistakes in vault", "",
           "Reproduce: `./samples.sh` (if `samples/vault` is missing), then `python3 tools/measure.py`.",
           "No model calls: graph diff, routing and the saved suite (`suite/vault.json`) only.", "",
           f"{len(rows)} single-edit mutants of `samples/vault` `{FILE}` on `main`: {len(risky)} that a careful "
           f"reviewer would call risky, {len(safe)} harmless. Each is committed in its own temporary worktree.", "",
           "- **existing**: the repo's own `go test ./...` fails on the mutant",
           "- **routed**: `core.graphdiff.review` routes a changed function to a human (a guard removed or "
           "narrowed in a function next to a secret)",
           "- **saved**: a saved suite test for the changed function or its callers passes on `main` and "
           "fails on the mutant (`core.testgen.run_saved`)", "",
           "## Totals", "",
           "| | risky (caught) | harmless (false alarm) |", "|---|---|---|",
           f"| existing tests fail | {count(risky, lambda r: r['existing'])}/{len(risky)} | "
           f"{count(safe, lambda r: r['existing'])}/{len(safe)} |",
           f"| routed by trust | {count(risky, lambda r: r['routed'])}/{len(risky)} | "
           f"{count(safe, lambda r: r['routed'])}/{len(safe)} |",
           f"| saved tests fail | {count(risky, lambda r: r['saved'])}/{len(risky)} | "
           f"{count(safe, lambda r: r['saved'])}/{len(safe)} |",
           f"| trust (routed or saved) | {count(risky, trust)}/{len(risky)} | {count(safe, trust)}/{len(safe)} |",
           f"| trust or existing tests | {count(risky, lambda r: trust(r) or r['existing'])}/{len(risky)} | "
           f"{count(safe, lambda r: trust(r) or r['existing'])}/{len(safe)} |", "",
           f"- Risky mutants caught by trust but not by existing tests: "
           f"{count(risky, lambda r: trust(r) and not r['existing'])}",
           f"- Risky mutants missed by both: {count(risky, lambda r: not trust(r) and not r['existing'])} "
           f"({', '.join(r['id'] for r in risky if not trust(r) and not r['existing']) or 'none'})",
           f"- Lines to read: routed mutants show {sum(r['evidence'] for r in routed_rows)} evidence lines "
           f"(guard lines + secret-route lines) for {sum(r['lines_changed'] for r in routed_rows)} diff lines "
           f"changed in those mutants (median {sorted(r['evidence'] for r in routed_rows)[len(routed_rows) // 2] if routed_rows else 0} per mutant). "
           "Single-edit mutants are tiny, so evidence can exceed the diff; the saving shows on large agent diffs "
           "(PLAN.md: 3 lines for REQ-V7), which this run does not re-measure.",
           "", "## Per mutant", "",
           "| id | what changed | risky | existing | routed | saved | guard change seen |",
           "|---|---|---|---|---|---|---|"]
    for r in rows:
        saved = f"{yn(r['saved'])} ({len(r['regressions'])}/{r['saved_run']})" if r["saved_run"] else "n/a"
        out.append(f"| {r['id']} | {r['what']} | {yn(r['risky'])} | {yn(r['existing'])} | {yn(r['routed'])} | "
                   f"{saved} | {'; '.join(r['guards']) or '-'} |")
    out += ["", "`saved` shows regressions / saved tests run; n/a means the suite has no tests for that "
            "function or its callers.", "", "## Observations (from this mutant set)", "",
            "- Guards are matched by condition text, so a removed guard is hidden when another guard in the "
            "same function has the same text and path (R17: one of several `err != nil` checks lost its `continue`).",
            "- Any rewrite of a condition counts as \"removed\", including stricter or equivalent ones "
            "(H4, H7: the two false alarms). H6 also shows as removed but is not next to a secret, so not routed.",
            "- The saved guard tests catch deleting the dotfile check (R2) but not narrowing it behind a new "
            "query flag (R1): they only exercise the default request.", "", "## Limits", "",
            "- We wrote the mutants and their risky/harmless labels; they are not real agent output.",
            "- One repo, one Go file, one author of the labels.",
            "- Routing is guard-centric: it sees removed or narrowed `if ... return/continue` checks. Changes in "
            "return values, struct literals, cookie flags, status codes or route wiring in `newMux` are not routed.",
            "- In vault almost every function is within one call of a secret, so the secret condition rarely "
            "filters anything here; routing is close to \"any non-widened guard change\".",
            "- The saved suite only holds tests for `handleBrowse` (from REQ-V7), so only mutants there can be "
            "caught by it.",
            "- Pending requirement tests for `match=` fail on `main` and are therefore never counted.", ""]
    return "\n".join(out)


def main():
    if not os.path.isdir(REPO):
        raise SystemExit("samples/vault is missing: run ./samples.sh first")
    suite = store.load("vault")
    base_graph = graphdiff.build(REPO, BASE)
    rows = []
    with tempfile.TemporaryDirectory(dir="/private/tmp") as tmp:
        for m in MUTANTS:
            r = measure(m, base_graph, suite, tmp)
            print(f"{r['id']:4} risky={yn(r['risky']):3} existing={yn(r['existing']):3} routed={yn(r['routed']):3} "
                  f"saved={yn(r['saved']):3} {r['changed']} {r['guards']}", flush=True)
            rows.append(r)
    git("worktree", "prune")
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "MEASUREMENT.md"), "w").write(report(rows))
    print("wrote docs/MEASUREMENT.md")


if __name__ == "__main__":
    main()
