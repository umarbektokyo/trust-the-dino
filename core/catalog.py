"""dossier/projects.json: projects, their branches, the commits on each branch, and what waits on whom.

    python3 -m core.catalog
"""

import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True).stdout


def dossiers():
    """head commit hash -> (case id, dossier)"""
    out = {}
    folder = os.path.join(ROOT, "dossier")
    for f in sorted(os.listdir(folder)):
        if f.endswith(".json") and f not in ("index.json", "projects.json"):
            d = json.load(open(os.path.join(folder, f)))
            if d.get("commit"):
                out[d["commit"]["hash"]] = (f[:-5], d)
    return out


def commit_row(line, known):
    h, author, date, subject = line.split("\x00")
    row = {"hash": h, "author": author, "date": date, "subject": subject, "case": None}
    if h in known:
        case_id, d = known[h]
        waiting = [{"unit": u["id"], "owner": u["owner"]["owner"], "team": u["owner"]["team"]}
                   for u in d["units"] if u["routed"]]
        row.update(case=case_id, req=d["case"]["id"], title=d["case"]["title"], units=len(d["units"]),
                   waiting=waiting, approver=d["case"].get("approver"))
    return row


def build():
    known = dossiers()
    projects = []
    for p in json.load(open(os.path.join(ROOT, "input", "projects.json"))):
        repo = os.path.join(ROOT, p["repo"])
        p = {**p, "ready": os.path.isdir(repo), "branches": []}
        if p["ready"]:
            heads = git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads").split()
            for b in sorted(heads, key=lambda b: (b != p["default"], b)):
                rng = b if b == p["default"] else f"{p['default']}..{b}"
                log = git(repo, "log", "--format=%H%x00%an%x00%ad%x00%s", "--date=format:%d %b %H:%M",
                          "-n", "20", rng).strip()
                commits = [commit_row(l, known) for l in log.splitlines() if l]
                p["branches"].append({"name": b, "base": None if b == p["default"] else p["default"],
                                      "commits": commits})
        projects.append(p)
    return {"projects": projects}


def write():
    path = os.path.join(ROOT, "dossier", "projects.json")
    json.dump(build(), open(path, "w"), indent=1)
    return path


if __name__ == "__main__":
    print(write())
