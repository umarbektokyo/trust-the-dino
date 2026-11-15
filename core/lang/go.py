"""Go: go test, -coverprofile per test."""

import os

from core import runners

FENCE = "go"
REQ_PREFIX = "TestTrust_"
GUARD_PREFIX = "TestTrustGuard_"
REQ_FILE = "trust_gen_test.go"
GUARD_FILE = "trust_guard_test.go"

SYSTEM = """You write Go unit tests that serve as review evidence for one changed function.
Rules:
- Output one complete Go file, package {pkg}, in a single ```go block. Nothing else.
- Name every test function {prefix}<What>. Do not redefine the function under test or the helpers.
- Every identifier you use must be defined in this file or among the helpers shown. If you need a
  new helper (e.g. to create a file), define it in this file with the prefix trust.
- Read the helpers' code: they decide how URLs and paths are built. Import only what you use.
- Build inputs the way the existing tests do (they are shown); never pass nil for a dependency.
- Test the requirement, AND test every rule the old code enforced for all inputs (the guards listed),
  including inputs the new code adds (new parameters, wildcard values).
- Helpers that set up a directory may already put files in it: assert on the entries your test
  created (their names and relative order), not on absolute positions or counts.
- Compare values field by field (e.g. names); never reflect.DeepEqual structs that hold a time.Time.
- One behaviour per test. Clear t.Errorf messages that say what was expected."""

GUARD = """The function below used to enforce this rule for EVERY request:
    if {cond} {{ {exit} }}
After the change the rule only runs when: {added}
Write Go tests named {prefix}<What> that check the OLD rule still holds for requests that use the
new inputs, including wildcard values such as "*", ".*", "?*". A test must fail if any result
breaks the rule. Output one complete Go file, package {pkg}, in a single ```go block."""


def package(src_dir, node):
    return open(os.path.join(src_dir, node["file"])).read().split("package ", 1)[1].split()[0]


def test_dir(node):
    return os.path.dirname(node["file"])


def run(src_dir, test_dir_, prefix, code, node, filename):
    return runners.run_go(src_dir, test_dir_, prefix, code, node, filename)


def run_all(src_dir, test_dir_, prefix, node):
    return runners.run_all_go(src_dir, test_dir_, prefix, node)


def lines_per_test(src_dir, test_dir_, names, node):
    return runners.lines_per_test(src_dir, test_dir_, names, node)


def test_source(code, name):
    i = code.find(f"func {name}(")
    if i < 0:
        return ""
    j = code.find("\nfunc ", i + 1)
    return code[i:j if j > 0 else None].strip()
