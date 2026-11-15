"""The saved test suite of a project: tests from earlier commits that run again on later ones.

A test enters the suite only when its intent is trusted:
  guard tests            their intent is the old code's rule            -> trusted at once
  kept tests             passed before and after: existing behaviour    -> trusted at once
  requirement tests      encode the new behaviour                       -> pending until a human merges
  tests failing on both  wrong or unmet                                 -> never saved
A saved file that stops compiling against a later commit is dropped, with the reason.

    suite/<project>.json = {"entries": [{id, node, lang, kind, written_for, file, trusted, pending}],
                            "dropped": [{id, names, reason, at_case}]}
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def path(project):
    return os.path.join(ROOT, "suite", project + ".json")


def load(project):
    p = path(project)
    return json.load(open(p)) if os.path.exists(p) else {"entries": [], "dropped": []}


def save(project, suite):
    os.makedirs(os.path.dirname(path(project)), exist_ok=True)
    json.dump(suite, open(path(project), "w"), indent=1)


def relevant(suite, node_ids, exclude_case):
    """Entries that test one of node_ids and were not written for exclude_case itself."""
    return [e for e in suite["entries"] if e["node"] in node_ids and e["written_for"] != exclude_case
            and (e["trusted"] or e["pending"])]


def add(suite, case_id, lang, gen):
    """Save what a commit's generated tests earned (see module doc). Replaces earlier saves of the same case."""
    new = [t for t in gen["tests"] if t.get("origin", "new") == "new"]
    for kind, code in (("requirement", gen["code"]), ("guard", gen["guard_code"])):
        ts = [t for t in new if t["from"] == kind]
        trusted = [t["name"] for t in ts if kind == "guard" and t["meaning"] != "fails on both"
                   or t["meaning"] == "kept"]
        pending = [t["name"] for t in ts if kind == "requirement" and t["meaning"] == "proves requirement"]
        entry_id = f"{case_id}:{gen['node']}:{kind}"
        suite["entries"] = [e for e in suite["entries"] if e["id"] != entry_id]
        if code and (trusted or pending):
            suite["entries"].append({"id": entry_id, "node": gen["node"], "lang": lang, "kind": kind,
                                     "written_for": case_id, "file": code, "trusted": trusted, "pending": pending})
    return suite


def drop(suite, entry, reason, at_case):
    suite["entries"] = [e for e in suite["entries"] if e["id"] != entry["id"]]
    suite["dropped"].append({"id": entry["id"], "names": entry["trusted"] + entry["pending"],
                             "reason": reason, "at_case": at_case})


def promote(suite, case_id):
    """A human merged case_id: its requirement tests become part of the suite."""
    for e in suite["entries"]:
        if e["written_for"] == case_id:
            e["trusted"] += e["pending"]
            e["pending"] = []
    return suite
