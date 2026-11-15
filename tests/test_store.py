import unittest

from core import store


def t(name, kind, meaning, origin="new"):
    return {"name": name, "from": kind, "meaning": meaning, "origin": origin}


GEN = {"node": "f.go:h", "code": "REQ", "guard_code": "GUARD", "tests": [
    t("G1", "guard", "regression"), t("G2", "guard", "kept"), t("G3", "guard", "fails on both"),
    t("R1", "requirement", "proves requirement"), t("R2", "requirement", "kept"),
    t("R3", "requirement", "fails on both"), t("OLD", "guard", "kept", origin="kept"),
]}


class Add(unittest.TestCase):
    def setUp(self):
        self.s = store.add({"entries": [], "dropped": []}, "c1", "go", GEN)
        self.by = {e["kind"]: e for e in self.s["entries"]}

    def test_guard_tests_trusted_unless_failing_on_both(self):
        self.assertEqual(self.by["guard"]["trusted"], ["G1", "G2"])

    def test_requirement_tests_wait_for_a_human(self):
        self.assertEqual(self.by["requirement"]["pending"], ["R1"])
        self.assertEqual(self.by["requirement"]["trusted"], ["R2"])

    def test_tests_from_earlier_commits_are_not_saved_again(self):
        self.assertNotIn("OLD", self.by["guard"]["trusted"])

    def test_rebuilding_a_case_replaces_its_entries(self):
        store.add(self.s, "c1", "go", GEN)
        self.assertEqual(len(self.s["entries"]), 2)


class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.s = store.add({"entries": [], "dropped": []}, "c1", "go", GEN)

    def test_relevant_skips_own_case_and_other_nodes(self):
        self.assertEqual(store.relevant(self.s, {"f.go:h"}, "c1"), [])
        self.assertEqual(len(store.relevant(self.s, {"f.go:h"}, "c2")), 2)
        self.assertEqual(store.relevant(self.s, {"f.go:other"}, "c2"), [])

    def test_promote_moves_pending_to_trusted(self):
        store.promote(self.s, "c1")
        req = next(e for e in self.s["entries"] if e["kind"] == "requirement")
        self.assertEqual((req["trusted"], req["pending"]), (["R2", "R1"], []))

    def test_drop_keeps_a_record(self):
        e = self.s["entries"][0]
        store.drop(self.s, e, "no longer compiles", "c2")
        self.assertEqual(len(self.s["entries"]), 1)
        self.assertEqual(self.s["dropped"][0]["reason"], "no longer compiles")


if __name__ == "__main__":
    unittest.main()
