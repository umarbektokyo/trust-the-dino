"""Compare the function graph of two git refs.

    python3 -m core.graphdiff <repo> <base> <head>

Pure functions (diff, guard_changes, secret_route) take graph dicts; only build() touches git.
"""

import collections
import json
import re
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
    """Guards whose condition survived but now needs more (or less) to be reached, or that disappeared.

    Matched by condition text, pairwise: a function can have several guards with the same text
    (`err != nil`), so one of them disappearing must still show up.
    """
    head = {}
    for g in head_node.get("guards", []):
        head.setdefault(g["cond"], []).append(g)
    leftover = []
    for g in base_node.get("guards", []):
        same = head.get(g["cond"], [])
        exact = next((x for x in same if x["path"] == g["path"]), None)
        if exact:
            same.remove(exact)
        else:
            leftover.append(g)
    out = []
    for g in leftover:
        now = head.get(g["cond"])
        if not now:
            out.append({"kind": "removed", "cond": g["cond"], "base": g, "head": None})
            continue
        h = now.pop(0)
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


SENSITIVE = re.compile(r"(?i)auth|login|session|secret|passw|token|cookie|unlock|hmac")


def short_name(node_id):
    return node_id.split(":", 1)[1]


def reasons(base, head, i):
    """Why a changed node is not the model's to decide, each with the lines that show it. In order:
    a check that runs in fewer cases next to a secret; changed lines that read or write a secret; losing a call to an
    auth function; changing a function whose job is security (by name)."""
    b, h = nodes(base), nodes(head)
    out = []
    risky = [g for g in guard_changes(b[i], h[i]) if g["kind"] != "widened"]
    route = secret_route(head, i) if risky else []
    if risky and route:
        out.append(("check", "A check now runs in fewer cases, next to a secret.", route))
    # a secret counts only where the change touches it: a line reading or writing a secret that was added or
    # removed, not a function that merely contains such a line somewhere else
    secret = lambda g, n: "secret" in nodes(g).get(n, {}).get("labels", [])
    uses = lambda g: [e for e in edges_from(g, i, {"reads", "writes", "literal"}) if secret(g, e["to"])]
    key = lambda e: (e["to"], e["kind"], e["text"].strip())
    hu, bu = uses(head), uses(base)
    hk, bk = {key(e) for e in hu}, {key(e) for e in bu}
    touched = [e for e in hu if key(e) not in bk] + [e for e in bu if key(e) not in hk]
    if touched:
        out.append(("secret", "It reads or writes a secret directly.", touched[:3]))
    # fewer calls to an auth function than before, e.g. one route of many loses its requireAuth wrapper
    auth = lambda g: [e for e in edges_from(g, i, {"calls"}) if SENSITIVE.search(short_name(e["to"]))]
    now = collections.Counter((e["to"], e["text"].strip()) for e in auth(head))
    lost = []
    for e in auth(base):  # the base lines that call it and have no match in head
        k = (e["to"], e["text"].strip())
        if now[k] > 0:
            now[k] -= 1
        else:
            lost.append(e)
    fewer = collections.Counter(e["to"] for e in auth(base)) - collections.Counter(e["to"] for e in auth(head))
    lost = [e for e in lost if fewer[e["to"]] > 0]
    if lost:
        out.append(("auth-call", f"It no longer calls {short_name(lost[0]['to'])}.", lost[:3]))
    if SENSITIVE.search(short_name(i)):
        callers = edges_to(head, i, {"calls"})[:3]
        out.append(("sensitive", f"{short_name(i)} is security code.", callers))
    return out


def review(base, head):
    """What a human must look at: changed nodes with at least one reason (see reasons()) are routed."""
    d, b, h = diff(base, head), nodes(base), nodes(head)
    items = []
    for i in d["changed"]:
        why = reasons(base, head, i)
        items.append({"id": i, "layer": h[i]["layer"], "guards": guard_changes(b[i], h[i]),
                      "secret": why[0][2] if why else [], "why": [w[1] for w in why],
                      "reasons": [w[0] for w in why], "routed": bool(why)})
    return {"diff": d, "items": items}


def main(argv):
    repo, base_ref, head_ref = argv
    base, head = build(repo, base_ref), build(repo, head_ref)
    json.dump(review(base, head), sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main(sys.argv[1:])
