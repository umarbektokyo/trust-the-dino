"""Everything the review screen needs for one case, in one JSON file.

    python3 -m core.dossier v7          -> dossier/v7.json
"""

import difflib
import json
import os
import re
import subprocess
import sys

from core import catalog, graphdiff, llm, store, testgen, visual
from core.git import show

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "adapters"))
from svelte import split as svelte  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ROUTE = re.compile(r'HandleFunc\("(/[^"]*)"')
FETCH = re.compile(r'fetch\(\s*[`\'"](/[^`\'"?$]*)')


def node_lines(repo, ref, node):
    if not node:
        return []
    return show(repo, ref, node["file"]).splitlines()[node["start"] - 1:node["end"]]


def node_diff(base_lines, head_lines, base_start, head_start):
    """Whole function, with each line marked ' ', '-' or '+' and its line number on its side."""
    out = []
    sm = difflib.SequenceMatcher(None, base_lines, head_lines, autojunk=False)
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == "equal":
            out += [{"op": " ", "n": b1 + i + head_start, "text": head_lines[b1 + i]} for i in range(a2 - a1)]
            continue
        out += [{"op": "-", "n": a1 + i + base_start, "text": base_lines[a1 + i]} for i in range(a2 - a1)]
        out += [{"op": "+", "n": b1 + i + head_start, "text": head_lines[b1 + i]} for i in range(b2 - b1)]
    return out


def routes(graph):
    """Go route string -> handler node id, from the HandleFunc lines in the graph."""
    out = {}
    for e in graph["edges"]:
        m = ROUTE.search(e["text"])
        if m and e["kind"] == "calls" and e["to"].split(":")[1].startswith("handle"):
            out[m.group(1)] = e["to"]
    return out


def frontend_callers(repo, ref, route):
    """Lines in frontend files that fetch this route: the consumers of a handler's output."""
    files = subprocess.run(["git", "-C", repo, "ls-tree", "-r", "--name-only", ref], check=True,
                           capture_output=True, text=True).stdout.split()
    out = []
    for f in files:
        if not f.endswith((".svelte", ".js", ".ts")) or "node_modules" in f:
            continue
        for i, line in enumerate(show(repo, ref, f).splitlines(), 1):
            m = FETCH.search(line)
            if m and m.group(1) == route:
                out.append({"file": f, "line": i, "text": line.strip()})
    return out


HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", re.M)


def svelte_units(repo, base_ref, head_ref):
    files = subprocess.run(["git", "-C", repo, "diff", "--name-only", base_ref, head_ref], check=True,
                           capture_output=True, text=True).stdout.split()
    out = []
    for f in files:
        if not f.endswith(".svelte"):
            continue
        bt, ht = show(repo, base_ref, f), show(repo, head_ref, f)
        bu, hu = svelte.units(bt), svelte.units(ht)
        patch = subprocess.run(["git", "-C", repo, "diff", "-U0", base_ref, head_ref, "--", f], check=True,
                               capture_output=True, text=True).stdout
        touched = {}
        for m in HUNK.finditer(patch):
            line = int(m.group(3))
            u = svelte.find(hu, line)
            if u:
                touched[u["name"]] = u
        for name, h in touched.items():
            b = next((x for x in bu if x["name"] == name), None)
            hl = ht.splitlines()[h["start"] - 1:h["end"]]
            bl = bt.splitlines()[b["start"] - 1:b["end"]] if b else []
            lines = node_diff(bl, hl, b["start"] if b else 0, h["start"])
            if name == "markup":  # markup is long: keep changed lines and 3 around them
                keep = {i for i, l in enumerate(lines) if l["op"] != " " for i in range(i - 3, i + 4)}
                lines = [l for i, l in enumerate(lines) if i in keep]
            out.append({"id": f + ":" + name, "name": name if name != "markup" else f.split("/")[-1],
                        "file": f, "kind": "component" if name == "markup" else "func", "layer": h["layer"],
                        "status": "changed" if b else "added", "signature": "", "lines": lines,
                        "in": [], "out": [], "consumers": [], "route": None, "guards": [], "secret": [],
                        "routed": False})
    return out


EXPLAIN = """Say what this code change does, in one plain sentence of at most 18 words.
Describe the behaviour, not the syntax. No preamble, no code, no quotes."""


def explain(unit, requirement):
    diff = "\n".join(f"{l['op']} {l['text']}" for l in unit["lines"] if l["op"] != " ")
    if not diff.strip():
        return ""
    text, _ = llm.chat([{"role": "system", "content": EXPLAIN},
                        {"role": "user", "content": f"Requirement:\n{requirement}\n\n{unit['file']} · {unit['name']}\n{diff}"}],
                       model=llm.SMART, max_tokens=200)
    return text.strip().strip('"')


MAX_TESTED = 6  # functions per commit that get generated tests; bounds the time of one review


def tests_for(repo, case, case_id, item, unit, base, head, req, suite, log):
    """Saved tests that still apply, then new ones for what this commit adds."""
    nid = unit["id"]
    log(f"tests for {nid}")
    near = {nid} | {e["from"] for e in unit["in"]}  # its own saved tests and its callers'
    saved = store.relevant(suite, near, case_id)
    kept, broken = testgen.run_saved(repo, case["base"], case["head"], saved, base, head, case["lang"], log)
    for e, why in broken:
        store.drop(suite, e, why, case_id)
    gen = testgen.generate(repo, case["base"], case["head"], item, base, head, req, log=log,
                           lang=case["lang"], existing=[t["name"] for t in kept])
    # the model sometimes rewrites a saved test under the same name: the saved one wins
    have = {t["name"] for t in kept}
    gen["duplicates"] = sorted(t["name"] for t in gen["tests"] if t["name"] in have)
    gen["tests"] = [t for t in gen["tests"] if t["name"] not in have]
    store.add(suite, case_id, case["lang"], gen)
    gen["tests"] = kept + gen["tests"]
    gen["dropped"] = [{"names": e["trusted"] + e["pending"], "from": e["written_for"], "reason": why}
                      for e, why in broken]
    return gen


def build(case_id, gen_tests=True, log=print):
    case = json.load(open(os.path.join(ROOT, "input", case_id, "case.json")))
    repo = os.path.join(ROOT, case["repo"])
    req = open(os.path.join(ROOT, "input", case_id, "requirement.md")).read()
    owners = json.load(open(os.path.join(ROOT, "input", case_id, "owners.json")))
    log(f"graph {case['base']} .. {case['head']}")
    base, head = graphdiff.build(repo, case["base"], case["lang"]), graphdiff.build(repo, case["head"], case["lang"])
    rv = graphdiff.review(base, head)
    bn, hn = graphdiff.nodes(base), graphdiff.nodes(head)
    route_of = {v: k for k, v in routes(head).items()}

    project = case.get("project", case_id)
    suite = store.load(project)
    units, tested = [], 0
    for nid in rv["diff"]["changed"] + rv["diff"]["added"] + rv["diff"]["removed"]:
        h, b = hn.get(nid), bn.get(nid)
        n = h or b
        item = next((i for i in rv["items"] if i["id"] == nid), None)
        if not item and h and not b and h.get("hash") and h["layer"] != "test":  # added: tests prove it
            item = {"id": nid, "layer": h["layer"], "guards": [], "secret": [], "routed": False}
        hl, bl = node_lines(repo, case["head"], h), node_lines(repo, case["base"], b)
        unit = {
            "id": nid, "name": nid.split(":")[1], "file": n["file"], "kind": n["kind"], "layer": n["layer"],
            "status": "added" if not b else "removed" if not h else "changed",
            "signature": n.get("signature", ""),
            "lines": node_diff(bl, hl, b["start"] if b else 0, h["start"] if h else 0),
            "in": [e for e in head["edges"] if e["to"] == nid and e["kind"] == "calls"],
            "out": [e for e in head["edges"] if e["from"] == nid and e["kind"] == "calls"
                    and hn.get(e["to"], {}).get("layer") != "test"],
            "consumers": frontend_callers(repo, case["head"], route_of[nid]) if nid in route_of else [],
            "route": route_of.get(nid),
            "guards": item["guards"] if item else [],
            "secret": item["secret"] if item else [],
            "routed": bool(item and item["routed"]),
        }
        if unit["routed"]:
            unit["owner"] = owners["secret-store"]
        if gen_tests and item and n["layer"] != "test" and tested < MAX_TESTED:
            tested += 1
            try:
                unit["tests"] = tests_for(repo, case, case_id, item, unit, base, head, req, suite, log)
            except Exception as e:  # a repo we can't test still gets its graph review
                log(f"  tests failed: {e}")
                unit["tests_error"] = str(e)[:300]
        units.append(unit)

    store.save(project, suite)
    units += svelte_units(repo, case["base"], case["head"])

    for u in units:
        u["explain"] = explain(u, req)
    shots = visual.before_after(case, case_id, log=log)
    for name, sh in shots.items():
        for u in units:
            if u["id"] == sh["unit"]:
                u.setdefault("shots", []).append({"name": name, "before": sh["before"], "after": sh["after"]})

    order = {"data": 0, "logic": 1, "visual": 2, "test": 3}
    units.sort(key=lambda u: (not u["routed"], order.get(u["layer"], 9), u["id"]))
    lines_changed = sum(1 for u in units for l in u["lines"] if l["op"] != " ")
    return {
        "case": case, "requirement": req,
        "graph": {"nodes": len(head["nodes"]), "edges": len(head["edges"])},
        "units": units,
        "lines_changed": lines_changed,
    }


def commit_info(repo, ref):
    fmt = "%H%x00%an%x00%ad%x00%s%x00%b"
    h, author, date, subject, body = subprocess.run(
        ["git", "-C", repo, "log", "-1", "--date=format:%d %b %H:%M", "--format=" + fmt, ref],
        check=True, capture_output=True, text=True).stdout.split("\x00")
    return {"hash": h, "author": author, "date": date, "subject": subject, "body": body.strip()}


def write(case_id, gen_tests=True, log=print):
    d = build(case_id, gen_tests=gen_tests, log=log)
    d["commit"] = commit_info(os.path.join(ROOT, d["case"]["repo"]), d["case"]["head"])
    os.makedirs(os.path.join(ROOT, "dossier"), exist_ok=True)
    path = os.path.join(ROOT, "dossier", case_id + ".json")
    json.dump(d, open(path, "w"), indent=1)
    catalog.write()
    return path


def main(argv):
    print(write(argv[0], gen_tests="--no-tests" not in argv))


if __name__ == "__main__":
    main(sys.argv[1:])
