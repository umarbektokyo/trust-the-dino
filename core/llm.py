"""Nemotron through NVIDIA Build (OpenAI-compatible). Every answer is cached by request hash,
so a demo replays offline and the same input always gives the same evidence."""

import hashlib
import json
import os
import ssl
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache", "llm")
URL = "https://integrate.api.nvidia.com/v1/chat/completions"
FAST = "nvidia/nemotron-3.5-lightning-30b-a3b"
SMART = VISION = "nvidia/nemotron-3.5-super-vl-120b-a12b"


def _ssl():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        cafile = "/etc/ssl/cert.pem"  # macOS; python.org builds ship without a CA bundle
        return ssl.create_default_context(cafile=cafile if os.path.exists(cafile) else None)


def key():
    if os.environ.get("NVIDIA_API_KEY"):
        return os.environ["NVIDIA_API_KEY"]
    for env in (os.path.join(ROOT, ".env"), os.path.join(os.path.dirname(ROOT), ".env")):
        if os.path.exists(env):
            for line in open(env):
                if line.startswith("NVIDIA_API_KEY="):
                    return line.split("=", 1)[1].strip()
    raise RuntimeError("NVIDIA_API_KEY not set and not in .env")


def chat(messages, model=FAST, max_tokens=6000, temperature=0.2, think=False):
    """Return (content, meta). meta has model, cached, seconds, tokens."""
    body = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if not think:  # reasoning can eat the whole budget and return empty content
        body["chat_template_kwargs"] = {"enable_thinking": False}
    h = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]
    path = os.path.join(CACHE, h + ".json")
    if os.path.exists(path):
        c = json.load(open(path))
        return c["content"], {**c["meta"], "cached": True}
    t0 = time.time()
    for attempt in range(5):
        req = urllib.request.Request(URL, json.dumps(body).encode(), {
            "Authorization": "Bearer " + key(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180, context=_ssl()) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise RuntimeError(f"nemotron {e.code}: {e.read()[:300]!r}")
    content = d["choices"][0]["message"].get("content") or ""
    if not content:
        raise RuntimeError("nemotron returned no content (reasoning used the budget?)")
    meta = {"model": model, "seconds": round(time.time() - t0, 1),
            "tokens": d.get("usage", {}).get("total_tokens"), "cached": False}
    os.makedirs(CACHE, exist_ok=True)
    json.dump({"request": body, "content": content, "meta": meta}, open(path, "w"), indent=1)
    return content, meta


def code_block(text, lang=""):
    """The first fenced code block, or the whole text if there is none."""
    fence = "```"
    i = text.find(fence)
    if i < 0:
        return text.strip()
    j = text.find("\n", i)
    k = text.find(fence, j)
    return text[j + 1:k if k > 0 else None].strip()
