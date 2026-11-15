"""Nemotron writes unit tests for one changed node; we run them on head and base.

What a test means comes from where it passes, not from the model:
  fails on base, passes on head  -> evidence the requirement is implemented
  passes on base, fails on head  -> the change broke something that used to hold
  passes on both                 -> behaviour kept
  fails on both                  -> the test is wrong; shown, not counted
"""

import os
import re

from core import lang as langs
from core import llm, runners
from core.git import checkout

ROUNDS = 3


def source(repo_dir, node):
    lines = open(os.path.join(repo_dir, node["file"])).read().splitlines()
    return "\n".join(lines[node["start"] - 1:node["end"]])


def prompt(item, head_src, base_src, helpers, callers, requirement, examples="", fence="go"):
    gl = "\n".join(f"- `{g['cond']}` → {g['base']['exit']} (before: always checked; now only when "
                   f"{g.get('added') or 'never'})" for g in item["guards"]) or "- none"
    cl = "\n".join(f"- {e['from'].split(':')[1]} line {e['line']}: {e['text']}" for e in callers) or "- none"
    return f"""Requirement:
{requirement}

Function under test, AFTER the change:
```{fence}
{head_src}
```

The same function BEFORE the change:
```{fence}
{base_src}
```

Guards whose reach changed:
{gl}

Callers:
{cl}

Test helpers available in the package (already defined, do not copy):
```{fence}
{helpers}
```

Existing tests that reach this function (follow their setup):
```{fence}
{examples}
```"""


def words(name):
    return {w.lower() for w in re.findall(r"[A-Z][a-z0-9]+|[a-z0-9]+", name)} - {"handle", "test", "get", "set"}


def example_tests(graph, node_id, k=2):
    """Existing tests that call the node, or call one of its callers and share a word with it."""
    calls = {}
    for e in graph["edges"]:
        if e["kind"] == "calls":
            calls.setdefault(e["from"], set()).add(e["to"])
    callers = {f for f, ts in calls.items() if node_id in ts}
    name = words(node_id.split(":")[1])
    tests = [n for n in graph["nodes"] if n["kind"] == "test"]
    direct = [n for n in tests if node_id in calls.get(n["id"], ())]
    near = [n for n in tests if calls.get(n["id"], set()) & callers and words(n["id"].split(":")[1]) & name]
    pick = direct or near
    return sorted(pick, key=lambda n: n["end"] - n["start"])[:k]


def helpers_src(repo_dir, graph):
    """Non-test functions defined in test files (fixtures, request helpers)."""
    return "\n\n".join(source(repo_dir, n) for n in graph["nodes"]
                       if n["layer"] == "test" and n["kind"] == "func")


def generate(repo, base_ref, head_ref, item, base_graph, head_graph, requirement, log=print, lang="go", existing=()):
    L = langs.get(lang)
    nodes = {n["id"]: n for n in head_graph["nodes"]}
    node = nodes[item["id"]]
    base_node = {n["id"]: n for n in base_graph["nodes"]}.get(item["id"])  # None: the change adds it
    pkg_dir = L.test_dir(node)
    callers = [e for e in head_graph["edges"] if e["to"] == node["id"] and e["kind"] == "calls"]
    rounds = []
    with checkout(repo, head_ref) as head_dir:
        pkg = L.package(head_dir, node)
        msgs = [{"role": "system", "content": L.SYSTEM.format(pkg=pkg, prefix=L.REQ_PREFIX)},
                {"role": "user", "content": prompt(item, source(head_dir, node),
                                                   _base_source(repo, base_ref, base_node) if base_node
                                                   else "(the change adds this function)",
                                                   helpers_src(head_dir, head_graph), callers, requirement,
                                                   "\n\n".join(source(head_dir, t) for t in
                                                                example_tests(head_graph, node["id"])),
                                                   L.FENCE) + _existing(existing)}]
        code, res = "", None
        for r in range(ROUNDS):
            answer, meta = llm.chat(msgs, model=llm.SMART)
            code = llm.code_block(answer)
            res = L.run(head_dir, pkg_dir, L.REQ_PREFIX, code, node, L.REQ_FILE)
            rounds.append({"round": r + 1, "meta": meta, "compiled": res["compiled"],
                           "coverage": res["coverage"], "tests": len(res["tests"])})
            log(f"  round {r + 1}: compiled={res['compiled']} tests={len(res['tests'])} "
                f"coverage={res['coverage']} ({meta['seconds']}s{' cached' if meta['cached'] else ''})")
            msgs += [{"role": "assistant", "content": answer}]
            if not res["compiled"]:
                msgs.append({"role": "user", "content": "It does not compile:\n" + res["error"] +
                             "\nReturn the whole corrected file."})
            elif res["coverage"] is not None and res["coverage"] < 100:
                lines = source(head_dir, {**node, "start": 1, "end": node["end"]}).splitlines()
                unc = "\n".join(f"{n}: {lines[n - 1].strip()}" for n in res["uncovered"])
                msgs.append({"role": "user", "content": f"Coverage of the function is {res['coverage']}%. "
                             f"These lines never ran:\n{unc}\nAdd tests that reach them. Return the whole file."})
            else:
                break
        guard_code, guard_res = "", {"tests": {}}
        for g in [g for g in item["guards"] if g["kind"] != "widened"]:  # a safer check needs no guard test
            gm = msgs[:2] + [{"role": "user", "content": L.GUARD.format(
                cond=g["cond"], exit=g["base"]["exit"], added=g.get("added") or "never",
                prefix=L.GUARD_PREFIX, pkg=pkg)}]
            for r in range(ROUNDS):
                answer, meta = llm.chat(gm, model=llm.SMART)
                guard_code = llm.code_block(answer)
                os.remove(os.path.join(head_dir, pkg_dir, L.REQ_FILE))
                guard_res = L.run(head_dir, pkg_dir, L.GUARD_PREFIX, guard_code, node, L.GUARD_FILE)
                log(f"  guard round {r + 1}: compiled={guard_res['compiled']} tests={len(guard_res['tests'])}")
                runners.write(head_dir, pkg_dir, L.REQ_FILE, code)
                if guard_res["compiled"]:
                    break
                gm += [{"role": "assistant", "content": answer},
                       {"role": "user", "content": "It does not compile:\n" + guard_res["error"] +
                        "\nReturn the whole corrected file."}]
        # final: each generated file on its own (they may define the same helpers), with failure
        # messages and the lines each test runs
        files = [(L.REQ_FILE, L.REQ_PREFIX, code), (L.GUARD_FILE, L.GUARD_PREFIX, guard_code)]
        head_all, per_line = _run_files(L, head_dir, pkg_dir, files, node, lines=True)
    with checkout(repo, base_ref) as base_dir:
        base_all, _ = _run_files(L, base_dir, pkg_dir, files, base_node or node)
    guard_names = set(guard_res["tests"])
    tests = []
    for name, head_ok in sorted(head_all["tests"].items()):
        base_ok = base_all["tests"].get(name, False)  # does not compile on base = fails on base
        tests.append({"name": name, "from": "guard" if name in guard_names else "requirement",
                      "head": head_ok, "base": base_ok, "meaning": meaning(base_ok, head_ok),
                      "message": head_all["messages"].get(name, []) if not head_ok else [],
                      "lines": per_line.get(name, []),
                      "source": L.test_source(guard_code if name in guard_names else code, name),
                      "origin": "new"})
    return {"node": node["id"], "code": code, "guard_code": guard_code, "rounds": rounds,
            "coverage": res["coverage"], "uncovered": res["uncovered"], "base_compiled": base_all["compiled"],
            "tests": tests}


def _existing(names):
    if not names:
        return ""
    return ("\n\nThese tests from earlier commits already run against this function; do not repeat them, "
            "test what this change adds:\n" + "\n".join("- " + n for n in names))


def run_saved(repo, base_ref, head_ref, entries, base_graph, head_graph, lang="go", log=print):
    """Run saved suite entries on base and head. Returns (tests, broken entries with reasons)."""
    L = langs.get(lang)
    hn = {n["id"]: n for n in head_graph["nodes"]}
    bn = {n["id"]: n for n in base_graph["nodes"]}
    tests, broken = [], []
    for e in entries:
        node = hn.get(e["node"])
        if not node:
            broken.append((e, "the function it tests is gone"))
            continue
        names = e["trusted"] + e["pending"]
        pattern = "(" + "|".join(names) + ")$"
        fname = L.GUARD_FILE if e["kind"] == "guard" else L.REQ_FILE
        files = [(fname, pattern, e["file"])]
        with checkout(repo, head_ref) as head_dir:
            h, per_line = _run_files(L, head_dir, L.test_dir(node), files, node, lines=True)
        if not h["tests"]:
            broken.append((e, "no longer compiles against this commit"))
            continue
        with checkout(repo, base_ref) as base_dir:
            b, _ = _run_files(L, base_dir, L.test_dir(node), files, bn.get(e["node"], node))
        log(f"  saved from {e['written_for']}: {sum(h['tests'].values())}/{len(h['tests'])} pass")
        for name in names:
            head_ok, base_ok = h["tests"].get(name, False), b["tests"].get(name, False)
            tests.append({"name": name, "from": e["kind"], "head": head_ok, "base": base_ok,
                          "meaning": meaning(base_ok, head_ok),
                          "message": h["messages"].get(name, []) if not head_ok else [],
                          "lines": per_line.get(name, []), "source": L.test_source(e["file"], name),
                          "origin": "kept", "written_for": e["written_for"],
                          "status": "trusted" if name in e["trusted"] else "pending"})
    return tests, broken


def _run_files(L, src_dir, pkg_dir, files, node, lines=False):
    out, per_line = {"tests": {}, "messages": {}, "compiled": True}, {}
    for fname, prefix, code in files:
        if not code:
            continue
        for other, _, _ in files:
            p = os.path.join(src_dir, pkg_dir, other)
            if os.path.exists(p):
                os.remove(p)
        runners.write(src_dir, pkg_dir, fname, code)
        r = L.run_all(src_dir, pkg_dir, prefix, node)
        out["tests"].update(r["tests"])
        out["messages"].update(r["messages"])
        out["compiled"] = out["compiled"] and r["compiled"]
        if lines:
            per_line.update(L.lines_per_test(src_dir, pkg_dir, sorted(r["tests"]), node))
    return out, per_line


def meaning(base_ok, head_ok):
    return {(False, True): "proves requirement", (True, False): "regression",
            (True, True): "kept", (False, False): "fails on both"}[(base_ok, head_ok)]


def _base_source(repo, ref, node):
    from core.git import show
    return "\n".join(show(repo, ref, node["file"]).splitlines()[node["start"] - 1:node["end"]])
