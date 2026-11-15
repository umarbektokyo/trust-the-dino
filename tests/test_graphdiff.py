import unittest

from core.graphdiff import diff, guard_changes, review, secret_route


def fn(id, hash, guards=(), labels=()):
    return {"id": id, "kind": "func", "layer": "logic", "hash": hash,
            "guards": list(guards), "labels": list(labels)}


def guard(cond, path=None, line=1):
    return {"line": line, "exit": "continue", "cond": cond, "path": path or cond}


def edge(f, t, kind, line=1):
    return {"from": f, "to": t, "kind": kind, "line": line, "text": f"{f}->{t}"}


DOT = 'strings.HasPrefix(n, ".")'


def graphs(head_guard_path=DOT, caller_names_secret=True):
    secret = {"id": "resource:.s.json", "kind": "resource", "labels": ["secret"]}
    base = {"nodes": [fn("a:list", "1", [guard(DOT)]), fn("a:mux", "m"), secret],
            "edges": [edge("a:mux", "a:list", "calls", 9)] +
                     ([edge("a:mux", "resource:.s.json", "literal", 8)] if caller_names_secret else [])}
    head = {"nodes": [fn("a:list", "2", [guard(DOT, head_guard_path)]), fn("a:mux", "m"),
                      fn("a:new", "3"), secret],
            "edges": base["edges"]}
    return base, head


class Diff(unittest.TestCase):
    def test_added_removed_changed(self):
        base, head = graphs()
        base["nodes"].append(fn("a:gone", "9"))
        d = diff(base, head)
        self.assertEqual(d, {"added": ["a:new"], "removed": ["a:gone"], "changed": ["a:list"]})

    def test_nodes_without_hash_are_not_code(self):
        base, head = graphs()
        head["nodes"].append({"id": "resource:x", "kind": "resource"})
        self.assertNotIn("resource:x", diff(base, head)["added"])


class Guards(unittest.TestCase):
    def test_narrowed_names_the_added_condition(self):
        gc = guard_changes(fn("x", "1", [guard(DOT)]), fn("x", "2", [guard(DOT, '!(m != "") && ' + DOT)]))
        self.assertEqual(len(gc), 1)
        self.assertEqual(gc[0]["kind"], "narrowed")
        self.assertEqual(gc[0]["added"], '!(m != "")')

    def test_widened_is_not_narrowed(self):
        gc = guard_changes(fn("x", "1", [guard(DOT, '!(m != "") && ' + DOT)]), fn("x", "2", [guard(DOT)]))
        self.assertEqual([(g["kind"], g["removed"]) for g in gc], [("widened", '!(m != "")')])

    def test_one_of_two_same_guards_removed(self):
        two = [guard("err != nil", line=3), guard("err != nil", line=9)]
        gc = guard_changes(fn("x", "1", two), fn("x", "2", two[:1]))
        self.assertEqual([g["kind"] for g in gc], ["removed"])

    def test_removed(self):
        gc = guard_changes(fn("x", "1", [guard(DOT)]), fn("x", "2"))
        self.assertEqual([g["kind"] for g in gc], ["removed"])

    def test_moved_line_only_is_not_a_change(self):
        self.assertEqual(guard_changes(fn("x", "1", [guard(DOT, line=3)]), fn("x", "2", [guard(DOT, line=7)])), [])

    def test_new_guard_is_not_reported(self):
        self.assertEqual(guard_changes(fn("x", "1"), fn("x", "2", [guard(DOT)])), [])


class Secret(unittest.TestCase):
    def test_caller_names_secret(self):
        _, head = graphs()
        route = secret_route(head, "a:list")
        self.assertEqual([(e["kind"], e["line"]) for e in route], [("literal", 8), ("calls", 9)])

    def test_own_read_wins(self):
        _, head = graphs()
        head["edges"].append(edge("a:list", "resource:.s.json", "reads", 4))
        self.assertEqual([e["line"] for e in secret_route(head, "a:list")], [4])

    def test_no_secret(self):
        _, head = graphs(caller_names_secret=False)
        self.assertEqual(secret_route(head, "a:list"), [])


class Reasons(unittest.TestCase):
    def test_reading_a_secret_routes(self):
        base, head = graphs()
        head["edges"] = head["edges"] + [edge("a:list", "resource:.s.json", "reads", 4)]
        item = review(base, head)["items"][0]
        self.assertEqual((item["routed"], item["reasons"]), (True, ["secret"]))

    def test_losing_an_auth_call_routes(self):
        base, head = graphs()
        base["nodes"].append(fn("a:requireAuth", "r"))
        head["nodes"].append(fn("a:requireAuth", "r"))
        base["edges"] = base["edges"] + [edge("a:list", "a:requireAuth", "calls", 5)]
        item = review(base, head)["items"][0]
        self.assertIn("auth-call", item["reasons"])

    def test_security_named_function_routes(self):
        base = {"nodes": [fn("a:isAuthenticated", "1")], "edges": []}
        head = {"nodes": [fn("a:isAuthenticated", "2")], "edges": []}
        self.assertEqual(review(base, head)["items"][0]["reasons"], ["sensitive"])


class Review(unittest.TestCase):
    def test_routed_only_with_guard_change_and_secret(self):
        base, head = graphs(head_guard_path='!(m != "") && ' + DOT)
        self.assertTrue(review(base, head)["items"][0]["routed"])

    def test_not_routed_without_guard_change(self):
        base, head = graphs()
        self.assertFalse(review(base, head)["items"][0]["routed"])

    def test_widened_guard_is_not_routed(self):
        base, head = graphs(head_guard_path=DOT)
        base["nodes"][0]["guards"] = [guard(DOT, '!(m != "") && ' + DOT)]
        self.assertFalse(review(base, head)["items"][0]["routed"])

    def test_not_routed_without_secret(self):
        base, head = graphs(head_guard_path='!(m != "") && ' + DOT, caller_names_secret=False)
        self.assertFalse(review(base, head)["items"][0]["routed"])


if __name__ == "__main__":
    unittest.main()
