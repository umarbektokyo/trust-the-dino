"""Run a generated test file inside a checkout and report per-test results and node coverage.
One runner per language; each returns the same shape."""

import os
import re
import subprocess

RESULT = re.compile(r"^\s*--- (PASS|FAIL): (\S+)", re.M)


def write(src_dir, pkg_dir, filename, code):
    with open(os.path.join(src_dir, pkg_dir, filename), "w") as f:
        f.write(code)


def run_go(src_dir, pkg_dir, test_name, code, node, filename="trust_gen_test.go"):
    """node: graph node (file, start, end). Returns compiled, error, tests, coverage, uncovered."""
    path = os.path.join(src_dir, pkg_dir, filename)
    with open(path, "w") as f:
        f.write(code)
    prof = os.path.join(src_dir, "trust.cover")
    p = subprocess.run(["go", "test", "-count=1", "-run", "^" + test_name, "-v", "-coverprofile=" + prof, "."],
                       cwd=os.path.join(src_dir, pkg_dir), capture_output=True, text=True, timeout=300)
    out = p.stdout + p.stderr
    tests = {name: status == "PASS" for status, name in RESULT.findall(out) if "/" not in name}
    if not tests and p.returncode != 0:
        err = "\n".join(l for l in out.splitlines() if ".go:" in l)[:1500] or out[-1500:]
        return {"compiled": False, "error": err, "tests": {}, "coverage": None, "uncovered": []}
    cov, unc = node_coverage(prof, node) if os.path.exists(prof) else (None, [])
    return {"compiled": True, "error": "", "tests": tests, "coverage": cov, "uncovered": unc}


BLOCK = re.compile(r"^(.+?):(\d+)\.\d+,(\d+)\.\d+ (\d+) (\d+)$")


def node_coverage(profile, node):
    """Statement coverage of one node from a Go cover profile: (percent, uncovered line numbers)."""
    total = hit = 0
    unc, ran = set(), set()
    for line in open(profile).read().splitlines()[1:]:
        m = BLOCK.match(line)
        # profile paths are module-relative (vault/main.go); compare the file name within its package
        if not m or os.path.basename(m.group(1)) != os.path.basename(node["file"]):
            continue
        a, b, stmts, count = int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
        if a < node["start"] or b > node["end"]:
            continue
        total += stmts
        if count:
            hit += stmts
            ran.update(range(a, b + 1))
        else:
            unc.update(range(a, b + 1))
    if not total:
        return None, []
    # a block starts at its "{", so a line can sit in a run block and a skipped one: it ran
    return round(100 * hit / total, 1), sorted(unc - ran)


def messages(out):
    """Failure lines per top-level test from `go test -v` output (subtests fold into their parent)."""
    msgs, cur = {}, None
    for line in out.splitlines():
        m = re.match(r"^=== (?:RUN|CONT)\s+(\S+)", line)
        if m:
            cur = m.group(1).split("/")[0]
            continue
        m = re.match(r"^\s+\S+_test\.go:\d+: (.*)", line)
        if m and cur:
            msgs.setdefault(cur, []).append(m.group(1).strip())
    return msgs


def run_all_go(src_dir, pkg_dir, prefix, node):
    """All generated tests at once (files already written): pass/fail and failure messages."""
    p = subprocess.run(["go", "test", "-count=1", "-run", "^" + prefix, "-v", "."],
                       cwd=os.path.join(src_dir, pkg_dir), capture_output=True, text=True, timeout=300)
    out = p.stdout + p.stderr
    tests = {name: status == "PASS" for status, name in RESULT.findall(out) if "/" not in name}
    return {"compiled": bool(tests) or p.returncode == 0, "tests": tests, "messages": messages(out)}


def lines_per_test(src_dir, pkg_dir, names, node):
    """Lines of the node each test runs: one cover profile per test."""
    out = {}
    prof = os.path.join(src_dir, "one.cover")
    for name in names:
        subprocess.run(["go", "test", "-count=1", "-run", "^" + name + "$", "-coverprofile=" + prof, "."],
                       cwd=os.path.join(src_dir, pkg_dir), capture_output=True, text=True, timeout=300)
        out[name] = covered_lines(prof, node) if os.path.exists(prof) else []
    return out


def covered_lines(profile, node):
    hit = set()
    for line in open(profile).read().splitlines()[1:]:
        m = BLOCK.match(line)
        if not m or os.path.basename(m.group(1)) != os.path.basename(node["file"]):
            continue
        a, b, count = int(m.group(2)), int(m.group(3)), int(m.group(5))
        if count and a >= node["start"] and b <= node["end"]:
            hit.update(range(a, b + 1))
    return sorted(hit)
