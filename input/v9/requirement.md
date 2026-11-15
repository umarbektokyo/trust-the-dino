# REQ-V9: sort the file list

Owner of the request: Team Files (frontend). Repo: vault (Go backend, Svelte frontend).

`GET /api/browse` accepts optional `sort` (`name`, `size` or `modified`; anything else means name) and
`order` (`asc` or `desc`, default `asc`) parameters. Folders always come first; entries that tie are
ordered by name, case-insensitive.

In the list view, clicking the Name, Size or Date Modified header sorts by that column; clicking the
same header again reverses the order. The active column shows ▲ or ▼.

Acceptance: `?sort=size&order=desc` lists the largest file first, after the folders. Nothing else
about browsing changes: dotfiles stay hidden, paths outside the content root are refused.
