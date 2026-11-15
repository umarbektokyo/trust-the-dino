"""Adding someone's repository, and reviewing one of its commits on request.

Cloning only accepts public https URLs. Reviewing runs the repository's own tests, so a public
server must keep both behind an admin token (see core/serve.py)."""

import json
import os
import re
import subprocess

from core import catalog, dossier

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.path.join(ROOT, "input", "projects.json")
URL = re.compile(r"^https://[\w.-]+(:\d+)?/[\w.~/-]+?(\.git)?/?$")
ADAPTED = ["go", "java"]  # languages we can build a graph and tests for, in order of preference


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True, text=True).stdout.strip()


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "project"


def detect_langs(repo):
    files = git(repo, "ls-files").splitlines()
    found = {"go": any(f.endswith(".go") for f in files), "java": any(f.endswith(".java") for f in files),
             "svelte": any(f.endswith(".svelte") for f in files)}
    return [lang for lang, yes in found.items() if yes]


def add(url, name=None, log=print):
    if not URL.match(url):
        raise ValueError("Use a public https git URL, e.g. https://github.com/owner/repo")
    projects = json.load(open(LIST))
    pid = base = slug(name or url.rstrip("/").removesuffix(".git").split("/")[-1])
    n = 2
    while any(p["id"] == pid for p in projects):
        pid, n = f"{base}-{n}", n + 1
    dest = os.path.join(ROOT, "samples", pid)
    log(f"cloning {url}")
    subprocess.run(["git", "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "clone", "-q",
                    "--filter=blob:none", "--no-tags", url, dest], check=True, capture_output=True, text=True,
                   timeout=300)
    default = git(dest, "symbolic-ref", "--short", "HEAD")
    for ref in git(dest, "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin").splitlines()[:30]:
        branch = ref.removeprefix("origin/")
        if branch not in ("HEAD", default, "origin"):
            subprocess.run(["git", "-C", dest, "branch", "-q", "--track", branch, ref], capture_output=True)
    langs = detect_langs(dest)
    log(f"languages: {', '.join(langs) or 'none we know'}")
    projects.append({"id": pid, "name": name or pid, "repo": f"samples/{pid}", "default": default,
                     "langs": langs, "about": url, "added": True})
    json.dump(projects, open(LIST, "w"), indent=2)
    catalog.write()
    return {"project": pid}


def review(project_id, commit, log=print):
    p = next(p for p in json.load(open(LIST)) if p["id"] == project_id)
    lang = next((lang for lang in ADAPTED if lang in p["langs"]), None)
    if not lang:
        raise ValueError("no adapter for this language yet")
    repo = os.path.join(ROOT, p["repo"])
    head = git(repo, "rev-parse", commit)
    merge_base = git(repo, "merge-base", p["default"], head)
    base = merge_base if merge_base != head else git(repo, "rev-parse", head + "~1")
    case_id = f"{project_id}-{head[:7]}"
    folder = os.path.join(ROOT, "input", case_id)
    os.makedirs(folder, exist_ok=True)
    subject = git(repo, "log", "-1", "--format=%s", head)
    json.dump({"id": head[:7], "title": subject, "project": project_id, "repo": p["repo"], "base": base,
               "head": head, "lang": lang, "agent": git(repo, "log", "-1", "--format=%an", head),
               "approver": "Project owner"}, open(os.path.join(folder, "case.json"), "w"), indent=2)
    open(os.path.join(folder, "requirement.md"), "w").write(git(repo, "log", "-1", "--format=%B", head) + "\n")
    owner = {"team": "Security", "owner": "Security owner", "why": "secrets in this project"}
    json.dump({"secret-store": owner, "browse-api": owner}, open(os.path.join(folder, "owners.json"), "w"), indent=2)
    log(f"reviewing {head[:7]} against {base[:7]}")
    dossier.write(case_id, log=log)
    return {"case": case_id}
