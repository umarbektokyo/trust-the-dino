"""Before/after screenshots: build the app at a commit, run it on sample content, replay scenes.

The real backend and frontend run, so a screenshot shows what a user of that commit would see.
"""

import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

from core.git import checkout

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def shoot(repo, ref, content, scenes, out_dir, tag, log=print):
    """Screenshots for every scene at ref; returns {scene name: file name}."""
    modules = os.path.join(ROOT, repo, "frontend", "node_modules")
    with checkout(os.path.join(ROOT, repo), ref) as wt, tempfile.TemporaryDirectory() as tmp:
        fe = os.path.join(wt, "frontend")
        os.symlink(modules, os.path.join(fe, "node_modules"))
        subprocess.run(["node", "node_modules/vite/bin/vite.js", "build", "--logLevel", "error"], cwd=fe, check=True)
        be = os.path.join(wt, "backend")
        subprocess.run(["go", "build", "-o", os.path.join(tmp, "app"), "."], cwd=be, check=True)
        data = os.path.join(tmp, "content")
        shutil.copytree(content, data)
        port = free_port()
        env = {**os.environ, "PORT": str(port), "CONTENT_ROOT": data}
        proc = subprocess.Popen([os.path.join(tmp, "app")], cwd=be, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            url = f"http://127.0.0.1:{port}"
            for _ in range(50):
                try:
                    urllib.request.urlopen(url + "/api/auth", timeout=1)
                    break
                except OSError:
                    time.sleep(0.1)
            names = {s["name"]: f"{tag}-{s['name'].replace(' ', '_').replace('*', 'star').replace('.', '')}.png"
                     for s in scenes}
            job = {"url": url, "out": out_dir, "scenes": [{**s, "file": names[s["name"]]} for s in scenes]}
            subprocess.run(["node", os.path.join(ROOT, "core", "shots.mjs"), json.dumps(job)], cwd=ROOT, check=True)
            log(f"  {tag}: {len(scenes)} screenshots")
            return names
        finally:
            proc.terminate()
            proc.wait()


def before_after(case, case_id, log=print):
    scenes = case.get("scenes", [])
    if not scenes:
        return {}
    out = os.path.join(ROOT, "dossier", "shots", case_id)
    os.makedirs(out, exist_ok=True)
    content = os.path.join(ROOT, "input", case_id, case["content"])
    base = shoot(case["repo"], case["base"], content, scenes, out, "before", log)
    head = shoot(case["repo"], case["head"], content, scenes, out, "after", log)
    return {s["name"]: {"unit": s["unit"], "before": f"shots/{case_id}/{base[s['name']]}",
                        "after": f"shots/{case_id}/{head[s['name']]}"} for s in scenes}
