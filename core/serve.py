"""The app: static files from trust/ and one endpoint, POST /api/chat, so the model key stays here.

    python3 -m core.serve [port]
"""

import functools
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import time

from core import jobs, llm, projects, store

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RULES = """You are Peek, the reviewer's companion inside trust, a merge IDE. Answer questions about the
commit under review using ONLY the review data below. Rules:
- At most three short sentences. Plain words. Name functions and file:line when you point at code.
- You never decide whether to merge, accept or send back: say whose call it is (the named owner).
- If the data does not say, answer "The review doesn't show that." Do not guess."""


def context(case_id, unit_id=None):
    """The review data the model may use, as compact text."""
    path = os.path.join(ROOT, "dossier", f"{os.path.basename(case_id)}.json")
    if not os.path.exists(path):
        return "No commit is open."
    d = json.load(open(path))
    out = [f"Commit {d['commit']['hash'][:7]}: {d['commit']['subject']}",
           f"Merge approver: {d['case'].get('approver', 'unknown')}", "Requirement:", d["requirement"].strip()]
    waiting = [u for u in d["units"] if u["routed"]]
    out.append("Waiting on: " + ("; ".join(f"{u['owner']['owner']} ({u['owner']['team']}) for {u['name']}" for u in waiting)
                                 if waiting else "nobody"))
    for u in d["units"]:
        here = " (open on screen)" if u["id"] == unit_id else ""
        out.append(f"\nFunction {u['id']} [{u['layer']}, {u['status']}]{here}: {u.get('explain', '')}")
        for g in u["guards"]:
            out.append(f"  check `{g['cond']}` used to run always; now only when {g.get('added') or 'never'}")
        if u["routed"]:
            ev = "; ".join(f"{e['from'].split(':')[1]}:{e['line']} {e['text']}" for e in u["secret"])
            out.append(f"  WHY IT WAITS: a safety check in {u['name']} no longer runs on every request, and its caller "
                       f"names a secret. {u['owner']['owner']} ({u['owner']['team']}) must decide. Evidence: {ev}")
        t = u.get("tests")
        if t:
            fails = [x for x in t["tests"] if not x["head"]]
            out.append(f"  {len(t['tests'])} generated tests, coverage {t['coverage']}%, never run: {t['uncovered']}")
            for x in fails:
                out.append(f"  FAILS {x['name']} ({'passed' if x['base'] else 'failed'} before): {'; '.join(x['message'][:1])}")
    return "\n".join(out)


def chat(body):
    msgs = [{"role": "system", "content": RULES + "\n\nREVIEW DATA\n" + context(body.get("case", ""), body.get("unit"))}]
    msgs += [{"role": m["role"], "content": m["content"][:2000]} for m in body.get("messages", [])[-8:]
             if m.get("role") in ("user", "assistant")]
    text, meta = llm.chat(msgs, model=llm.SMART, max_tokens=400)
    return {"reply": text.strip(), "model": meta["model"]}


STATE = os.environ.get("TRUST_STATE", ROOT)  # a mounted volume in Docker
DECISIONS = os.path.join(STATE, "decisions.json")

# Adding repositories clones and runs strangers' code. Off unless TRUST_ALLOW_ADD=1 (local use) or an
# admin token is set (public use: callers must send it).
TOKEN = os.environ.get("TRUST_ADMIN_TOKEN", "")
ALLOW = os.environ.get("TRUST_ALLOW_ADD") == "1" or bool(TOKEN)


def config(_=None):
    return {"canAdd": ALLOW, "needsToken": bool(TOKEN)}


def guarded(fn):
    def run(body):
        if not ALLOW:
            raise PermissionError("Adding projects is off on this server.")
        if TOKEN and body.get("token") != TOKEN:
            raise PermissionError("Wrong or missing admin token.")
        return fn(body)
    return run


@guarded
def add_project(body):
    if not projects.URL.match(body["url"].strip()):
        raise ValueError("Use a public https git URL, e.g. https://github.com/owner/repo")
    return {"job": jobs.submit(projects.add, body["url"].strip(), (body.get("name") or "").strip() or None)}


@guarded
def review_commit(body):
    return {"job": jobs.submit(projects.review, body["project"], body["commit"])}


def decisions():
    return json.load(open(DECISIONS)) if os.path.exists(DECISIONS) else []


def decide(body):
    """Record a named human's decision. "merged" on a whole commit promotes its pending tests."""
    case_id = os.path.basename(body["case"])
    rec = {"case": case_id, "unit": body.get("unit"), "decision": body["decision"], "by": body["by"],
           "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    log = decisions() + [rec]
    json.dump(log, open(DECISIONS, "w"), indent=1)
    if rec["decision"] == "merged" and not rec["unit"]:
        case = json.load(open(os.path.join(ROOT, "input", case_id, "case.json")))
        project = case.get("project", case_id)
        store.save(project, store.promote(store.load(project), case_id))
    return {"ok": True, "decisions": log}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "/web/")
            return self.end_headers()
        if self.path == "/api/decisions":
            return self.reply(200, decisions())
        if self.path == "/api/config":
            return self.reply(200, config())
        if self.path.startswith("/api/jobs/"):
            job = jobs.get(self.path.rsplit("/", 1)[1])
            return self.reply(200, job) if job else self.reply(404, {"error": "no such job"})
        return super().do_GET()

    def reply(self, code, res):
        data = json.dumps(res).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        routes = {"/api/chat": chat, "/api/decide": decide, "/api/projects": add_project, "/api/review": review_commit}
        if self.path not in routes:
            return self.send_error(404)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            res, code = routes[self.path](body), 200
        except PermissionError as e:
            res, code = {"error": str(e)}, 403
        except (ValueError, KeyError) as e:
            res, code = {"error": str(e)}, 400
        except Exception as e:  # the page shows the error instead of hanging
            res, code = {"error": str(e)[:300]}, 500
        self.reply(code, res)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # dossiers change while we work
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8290
    host = os.environ.get("TRUST_HOST", "127.0.0.1")  # 0.0.0.0 inside Docker
    handler = functools.partial(Handler, directory=ROOT)
    print(f"trust the dino on http://{host}:{port}/web/ (adding projects: {'on' if ALLOW else 'off'})")
    ThreadingHTTPServer((host, port), handler).serve_forever()


if __name__ == "__main__":
    main()
