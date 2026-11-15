"""One background worker for slow work (cloning, reviewing). Jobs run one at a time, in order."""

import itertools
import queue
import threading

_jobs, _queue, _ids = {}, queue.Queue(), itertools.count(1)


def submit(fn, *args):
    """Run fn(*args, log=...) later; returns the job id. fn returns a dict merged into the job."""
    jid = str(next(_ids))
    _jobs[jid] = {"state": "queued", "log": []}
    _queue.put((jid, fn, args))
    return jid


def get(jid):
    return _jobs.get(jid)


def _worker():
    while True:
        jid, fn, args = _queue.get()
        job = _jobs[jid]
        job["state"] = "running"
        try:
            job.update(fn(*args, log=lambda line: job["log"].append(str(line))))
            job["state"] = "done"
        except Exception as e:
            job["log"].append(f"failed: {e}")
            job["state"] = "failed"


threading.Thread(target=_worker, daemon=True).start()
