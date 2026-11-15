# REQ-V7: server-side glob filter

Owner of the request: Team Files (frontend). Repo: vault (Go backend, Svelte frontend).

`GET /api/browse` accepts an optional `match` parameter, a shell glob (`*.pdf`, `report-*`).
Only entries whose name matches are returned. Typing a filter that contains `*` in the
browser's filter box and pressing Enter uses it.

Non-functional: existing browse behaviour without `match` is unchanged.
