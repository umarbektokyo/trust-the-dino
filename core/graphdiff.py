"""Compare the function graph of two git refs.

    python3 -m core.graphdiff <repo> <base> <head>

Pure functions (diff, guard_changes, secret_route) take graph dicts; only build() touches git.
"""

import json
import os
import subprocess
import sys

from core.git import checkout

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADAPTERS = {"go": ["go", "run", "."], "java": ["sh", "graph.sh"]}  # cwd: adapters/<lang>


def build(repo, ref, lang="go"):
    """Check out ref into a temporary worktree and run the adapter on it."""
    with checkout(repo, ref) as wt:
        return adapt(wt, lang)


def adapt(src, lang="go"):
    out = subprocess.run(ADAPTERS[lang] + [src], cwd=os.path.join(HERE, "adapters", lang),
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def nodes(g):
    return {n["id"]: n for n in g["nodes"]}


def diff(base, head):
    """Node ids that were added, removed or whose body changed (functions only)."""
    b, h = nodes(base), nodes(head)
    code = lambda n: n.get("hash")
    return {
        "added": sorted(i for i in h if i not in b and code(h[i])),
        "removed": sorted(i for i in b if i not in h and code(b[i])),
        "changed": sorted(i for i in h if i in b and code(h[i]) and code(h[i]) != code(b[i])),
    }


def guard_changes(base_node, head_node):
    """Guards whose condition survived but now needs more to be reached, or that disappeared.

    Matched by condition text: a guard that moved under an else keeps its cond, gains a path.
    """
    head = {}
    for g in head_node.get("guards", []):
        head.setdefault(g["cond"], []).append(g)
    out = []
    for g in base_node.get("guards", []):
        now = head.get(g["cond"])
        if not now:
            out.append({"kind": "removed", "cond": g["cond"], "base": g, "head": None})
        elif all(x["path"] != g["path"] for x in now):
            h = now[0]
            if g["path"].endswith(h["path"]):  # fewer conditions in front of it: runs in more cases
                out.append({"kind": "widened", "cond": g["cond"], "base": g, "head": h,
                            "removed": g["path"][: -len(h["path"])].rstrip(" &")})
            else:
                out.append({"kind": "narrowed", "cond": g["cond"], "base": g, "head": h,
                            "added": h["path"][: -len(g["path"])].rstrip(" &")})
    return out


def edges_from(g, src, kinds):
    return [e for e in g["edges"] if e["from"] == src and e["kind"] in kinds]


def edges_to(g, dst, kinds):
    return [e for e in g["edges"] if e["to"] == dst and e["kind"] in kinds]


def secret_route(g, node_id):
    """Shortest evidence that node_id sits next to a secret: its own secret reads, or a caller that
    names a secret and hands node_id its inputs. Returns the edges to show, or []."""
    n = nodes(g)
    secret = lambda i: "secret" in n.get(i, {}).get("labels", [])
    own = [e for e in edges_from(g, node_id, {"reads", "writes", "literal"}) if secret(e["to"])]
    if own:
        return own
    for call in edges_to(g, node_id, {"calls"}):
        named = [e for e in edges_from(g, call["from"], {"literal", "reads"}) if secret(e["to"])]
        if named:
            return named + [call]
    return []


def review(base, head):
    """What a human must look at: changed nodes with a guard change next to a secret are routed."""
    d, b, h = diff(base, head), nodes(base), nodes(head)
    items = []
    for i in d["changed"]:
        gc = guard_changes(b[i], h[i])
        risky = [g for g in gc if g["kind"] != "widened"]
        route = secret_route(head, i) if risky else []
        items.append({"id": i, "layer": h[i]["layer"], "guards": gc, "secret": route,
                      "routed": bool(risky and route)})
    return {"diff": d, "items": items}


def main(argv):
    repo, base_ref, head_ref = argv
    base, head = build(repo, base_ref), build(repo, head_ref)
    json.dump(review(base, head), sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main(sys.argv[1:])
