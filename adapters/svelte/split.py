"""Svelte units, without a parser: each function in <script> is a node; markup is one visual node.

Enough to place a changed line in its function and layer. The full adapter (components, props,
render edges) replaces this; the unit shape stays the same.
"""

import re

FUNC = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(")
IO = re.compile(r"\bfetch\(|localStorage|document\.cookie|XMLHttpRequest|WebSocket")


def _end(lines, i):
    depth, seen = 0, False
    for j in range(i, len(lines)):
        s = re.sub(r"(['\"`]).*?\1", "", lines[j])
        depth += s.count("{") - s.count("}")
        seen = seen or "{" in s
        if seen and depth <= 0:
            return j
    return len(lines) - 1


def units(text):
    """[{name, start, end, layer}] with 1-based inclusive lines."""
    lines = text.splitlines()
    out = []
    script_end = next((i for i, l in enumerate(lines) if "</script>" in l), -1)
    i = 0
    while i <= script_end:
        m = FUNC.match(lines[i])
        if m:
            j = _end(lines, i)
            body = "\n".join(lines[i:j + 1])
            out.append({"name": m.group(1), "start": i + 1, "end": j + 1,
                        "layer": "data" if IO.search(body) else "logic"})
            i = j + 1
            continue
        i += 1
    style = next((i for i, l in enumerate(lines) if l.strip().startswith("<style")), len(lines))
    if script_end + 1 < style:
        out.append({"name": "markup", "start": script_end + 2, "end": style, "layer": "visual"})
    return out


def find(units_, line):
    return next((u for u in units_ if u["start"] <= line <= u["end"]), None)
