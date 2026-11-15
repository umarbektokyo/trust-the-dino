"""Java: javac + JUnit 5 console launcher, JaCoCo for coverage (per run and per test).

Generated tests live in one class per file (TrustGenTest, TrustGuardTest), so a test prefix maps to
a class. Jars come from Maven Central into trust/.work/ on first use.
"""

import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, ".work")
MAVEN = "https://repo1.maven.org/maven2/"
JUNIT = ("junit-console-1.11.4.jar",
         MAVEN + "org/junit/platform/junit-platform-console-standalone/1.11.4/"
                 "junit-platform-console-standalone-1.11.4.jar")
JACOCO_AGENT = ("jacocoagent-0.8.16.jar", MAVEN + "org/jacoco/org.jacoco.agent/0.8.16/org.jacoco.agent-0.8.16-runtime.jar")
JACOCO_CLI = ("jacococli-0.8.16.jar", MAVEN + "org/jacoco/org.jacoco.cli/0.8.16/org.jacoco.cli-0.8.16-nodeps.jar")
SKIP_DIRS = {"out", "build", "target", "node_modules"}

FENCE = "java"
REQ_PREFIX = "trust_"
GUARD_PREFIX = "trustGuard_"
REQ_FILE = "TrustGenTest.java"
GUARD_FILE = "TrustGuardTest.java"
CLASS = {REQ_PREFIX: "TrustGenTest", GUARD_PREFIX: "TrustGuardTest"}

SYSTEM = """You write JUnit 5 tests that serve as review evidence for one changed method.
Rules:
- Output one complete Java file in a single ```java block. Nothing else.
- Package: {pkg}. One top-level class, named TrustGenTest unless told otherwise; JUnit 5 only
  (org.junit.jupiter.api.*), no other libraries.
- Name every test method {prefix}<What>, annotated @Test. Do not redefine the classes under test.
- Every identifier you use must exist in the code shown or in the JDK. Helpers go in the test class.
- Build inputs the way the existing tests do (they are shown). Paths are relative to the repo root.
- Call the method under test itself (an instance `void main()` is called as `new Main().main()`);
  never copy its logic into the test: a copy proves nothing about the code.
- Never let the code under test reach System.exit: it ends the test run (there is no
  SecurityManager in this JDK, do not use one). For code that reads
  System.in, use System.setIn(new ByteArrayInputStream(...)) and capture System.out with
  System.setOut; restore both afterwards. When scripted input runs out, Scanner throws
  NoSuchElementException: end the script that way and expect it, instead of choosing "exit".
- If the code starts a thread, wait for it (join, or a CountDownLatch with a timeout) before asserting.
- Test the requirement, AND test every rule the old code enforced for all inputs (the guards listed).
- One behaviour per test. Assertion messages that say what was expected."""

GUARD = """The method below used to enforce this rule for EVERY call:
    if ({cond}) {{ {exit}; }}
After the change the rule only runs when: {added}
Write JUnit 5 tests named {prefix}<What> that check the OLD rule still holds for calls that use the
new inputs, including wildcard values such as "*", ".*", "?*". A test must fail if any result
breaks the rule. Output one complete Java file, package {pkg}, one class named TrustGuardTest,
in a single ```java block."""


def _jar(spec):
    name, url = spec
    path = os.path.join(WORK, name)
    if not os.path.exists(path):
        os.makedirs(WORK, exist_ok=True)
        urllib.request.urlretrieve(url, path + ".part")
        os.replace(path + ".part", path)
    return path


def _bin(tool):
    home = os.environ.get("JAVA_HOME") or "/opt/homebrew/opt/openjdk"
    path = os.path.join(home, "bin", tool)
    return path if os.path.exists(path) else shutil.which(tool) or tool


def package(src_dir, node):
    m = re.search(r"^\s*package\s+([\w.]+)\s*;", open(os.path.join(src_dir, node["file"])).read(), re.M)
    return m.group(1) if m else "none (default package: no package line)"


def test_dir(node):
    """Maven layout: the matching src/test/java folder; otherwise a top-level tests/ folder."""
    f = node["file"]
    if "src/main/java/" in f:
        return os.path.dirname(f.replace("src/main/java/", "src/test/java/"))
    return "tests"


def _fix_class(code, filename):
    """The class must be named after its file; models sometimes pick their own name."""
    want = filename[:-len(".java")]
    m = re.search(r"^(?:public\s+|final\s+)*class\s+(\w+)", code, re.M)
    if m and m.group(1) != want:
        code = re.sub(rf"\b{m.group(1)}\b", want, code)
    return code


def _sources(src_dir):
    out = []
    for d, dirs, files in os.walk(src_dir):
        dirs[:] = [x for x in dirs if not x.startswith(".") and x not in SKIP_DIRS]
        out += [os.path.join(d, f) for f in files if f.endswith(".java")]
    return sorted(out)


def _compile(src_dir, classes):
    """javac every source in the checkout; returns error text or ''."""
    p = subprocess.run([_bin("javac"), "-nowarn", "-proc:none", "-d", classes, "-cp", _jar(JUNIT),
                        *_sources(src_dir)], cwd=src_dir, capture_output=True, text=True, timeout=300)
    if p.returncode == 0:
        return ""
    return p.stderr.replace(src_dir + "/", "")[:1500]


def _run(src_dir, classes, select, exec_file=None):
    """Run JUnit on one selector; returns ({name: ok}, {name: [lines]}, error)."""
    reports = tempfile.mkdtemp(dir=src_dir, prefix=".reports")
    cmd = [_bin("java")]
    if exec_file:
        cmd.append(f"-javaagent:{_jar(JACOCO_AGENT)}=destfile={exec_file}")
    cmd += ["-jar", _jar(JUNIT), "execute", "-cp", classes, select, "--disable-banner",
            "--details=none", "--reports-dir", reports]
    try:
        subprocess.run(cmd, cwd=src_dir, capture_output=True, text=True, timeout=120, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return {}, {}, "The tests did not finish within 120 s (a thread or input loop never ended)."
    tests, msgs = {}, {}
    xml = os.path.join(reports, "TEST-junit-jupiter.xml")
    if not os.path.exists(xml):
        return {}, {}, ("The test JVM exited before JUnit could report: the code reached System.exit. "
                        "Never feed input that leads to System.exit.")
    for case in ET.parse(xml).iter("testcase"):
        name = case.get("name").split("(")[0]
        bad = case.find("failure") if case.find("failure") is not None else case.find("error")
        tests[name] = bad is None and case.find("skipped") is None
        if bad is not None:
            first = (bad.text or "").strip().splitlines()[:1]
            msgs[name] = [bad.get("message") or (first[0] if first else bad.get("type", "failed"))]
    return tests, msgs, ""


def _coverage(src_dir, classes, exec_file, node):
    """Lines of node with code, and which of them ran, from a JaCoCo XML report."""
    if not os.path.exists(exec_file):
        return set(), set()
    xml = exec_file + ".xml"
    subprocess.run([_bin("java"), "-jar", _jar(JACOCO_CLI), "report", exec_file, "--classfiles", classes,
                    "--xml", xml], cwd=src_dir, capture_output=True, timeout=120)
    if not os.path.exists(xml):
        return set(), set()
    pkg = package(src_dir, node)
    pkg = "" if pkg.startswith("none") else pkg.replace(".", "/")
    code, ran = set(), set()
    for p in ET.parse(xml).iter("package"):
        if p.get("name") != pkg:
            continue
        for sf in p.iter("sourcefile"):
            if sf.get("name") != os.path.basename(node["file"]):
                continue
            for line in sf.iter("line"):
                n = int(line.get("nr"))
                if node["start"] <= n <= node["end"]:
                    code.add(n)
                    if int(line.get("ci")):
                        ran.add(n)
    return code, ran


def _write(src_dir, test_dir_, filename, code):
    d = os.path.join(src_dir, test_dir_)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, filename), "w") as f:
        f.write(_fix_class(code, filename))


def run(src_dir, test_dir_, prefix, code, node, filename):
    _write(src_dir, test_dir_, filename, code)
    classes = tempfile.mkdtemp(dir=src_dir, prefix=".classes")
    err = _compile(src_dir, classes)
    if err:
        return {"compiled": False, "error": err, "tests": {}, "coverage": None, "uncovered": []}
    exec_file = os.path.join(classes, "trust.exec")
    tests, _, err = _run(src_dir, classes, "--select-class=" + _class(prefix, filename), exec_file)
    if err:
        return {"compiled": False, "error": err, "tests": {}, "coverage": None, "uncovered": []}
    code_lines, ran = _coverage(src_dir, classes, exec_file, node)
    cov = round(100 * len(ran) / len(code_lines), 1) if code_lines else None
    return {"compiled": True, "error": "", "tests": tests, "coverage": cov, "uncovered": sorted(code_lines - ran)}


def _class(prefix, filename=None):
    return filename[:-len(".java")] if filename else CLASS[prefix]


def run_all(src_dir, test_dir_, prefix, node):
    cls = CLASS[prefix]
    path = os.path.join(src_dir, test_dir_, cls + ".java")
    if os.path.exists(path):  # testgen writes the file as-is: make the class name match here too
        _write(src_dir, test_dir_, cls + ".java", open(path).read())
    classes = tempfile.mkdtemp(dir=src_dir, prefix=".classes")
    if _compile(src_dir, classes):
        return {"compiled": False, "tests": {}, "messages": {}}
    tests, msgs, err = _run(src_dir, classes, "--select-class=" + cls)
    return {"compiled": not err, "tests": tests, "messages": msgs}


def lines_per_test(src_dir, test_dir_, names, node):
    """Lines of node each test runs: one JaCoCo run per test."""
    cls = next((c for c in CLASS.values() if os.path.exists(os.path.join(src_dir, test_dir_, c + ".java"))), None)
    classes = tempfile.mkdtemp(dir=src_dir, prefix=".classes")
    if not cls or _compile(src_dir, classes):
        return {n: [] for n in names}
    out = {}
    for i, name in enumerate(names):
        exec_file = os.path.join(classes, f"t{i}.exec")
        _run(src_dir, classes, f"--select-method={cls}#{name}", exec_file)
        out[name] = sorted(_coverage(src_dir, classes, exec_file, node)[1])
    return out


def test_source(code, name):
    """One test method with its annotations, by brace matching."""
    m = re.search(rf"^([ \t]*@[^\n]*\n)*[ \t]*[\w<>\[\], ]*\bvoid\s+{re.escape(name)}\s*\(", code, re.M)
    if not m:
        return ""
    i, depth = code.find("{", m.end()), 0
    for j in range(i, len(code)):
        depth += {"{": 1, "}": -1}.get(code[j], 0)
        if depth == 0:
            return code[m.start():j + 1].strip()
    return code[m.start():].strip()
