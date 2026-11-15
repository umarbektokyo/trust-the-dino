"""Language modules: everything test generation needs that differs per language.

A module provides:
  FENCE                      code fence tag for prompts ("go", "java")
  SYSTEM, GUARD              prompt templates; SYSTEM gets {pkg} {prefix}, GUARD gets {cond} {exit} {added} {prefix} {pkg}
  REQ_PREFIX, GUARD_PREFIX   test name prefixes (requirement tests, guard tests)
  REQ_FILE, GUARD_FILE       file names the generated tests are written to
  package(src_dir, node)     package/namespace the tests must declare
  test_dir(node)             directory (relative to the repo) the test files go in
  run(src_dir, test_dir, prefix, code, node, filename)
                             write + run one file; {compiled, error, tests{name: ok}, coverage, uncovered}
  run_all(src_dir, test_dir, prefix, node)
                             run what is written; {compiled, tests{name: ok}, messages{name: [lines]}}
  lines_per_test(src_dir, test_dir, names, node)
                             {name: [line numbers of node the test runs]}
  test_source(code, name)    source of one test inside a generated file
"""

import importlib


def get(lang):
    return importlib.import_module(f"core.lang.{lang}")
