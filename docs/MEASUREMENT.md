# Measurement: seeded mistakes in vault

Reproduce: `./samples.sh` (if `samples/vault` is missing), then `python3 tools/measure.py`.
No model calls: graph diff, routing and the saved suite (`suite/vault.json`) only.

25 single-edit mutants of `samples/vault` `backend/main.go` on `main`: 17 that a careful reviewer would call risky, 8 harmless. Each is committed in its own temporary worktree.

- **existing**: the repo's own `go test ./...` fails on the mutant
- **routed**: `core.graphdiff.review` routes a changed function to a human (see `reasons()`: a check that runs in fewer cases next to a secret; changed lines that read or write a secret; fewer calls to an auth function; or security code by name)
- **saved**: a saved suite test for the changed function or its callers passes on `main` and fails on the mutant (`core.testgen.run_saved`)

## Three runs, read this first

| | run 1: checks only | run 2: four rules | run 3: two rules made precise | existing tests |
|---|---|---|---|---|
| risky caught | **9/17** | **17/17** | **17/17** | 5/17 |
| harmless flagged (false alarms) | 2/8 | 3/8 | 2/8 | 0/8 |

Run 1 routed only checks that run in fewer cases next to a secret. It missed every risky change that
was not a check: a route losing `requireAuth`, changes inside `isAuthenticated`, a cookie flag, a
response that echoes a secret, and one of two identical `err != nil` checks being deleted (a matching bug).
We then added three rules and fixed the bug (routes on: touching a secret, losing an auth call,
security code by name). **Run 2 is fitted to this set: the rules were written after seeing run 1's
misses.** It shows the rules work on these mistakes, not that 17/17 holds on new ones; an unbiased
number needs a fresh set written before running.

Run 2's secret rule fired on any change to a function that reads a secret anywhere, so a log text
change in `main` (H2) and any edit to `handleBrowse` went to Security. Run 3 routes only when the
**changed lines** read or write a secret. That alone lost R3 and R4 (one route of many losing
`requireAuth` in `newMux`), which run 2 had caught only because `newMux` also reads a secret. So the
auth rule now fires on **fewer calls** to an auth function, not only when every call is gone. Run 3
is still fitted to this set; it removes a false alarm without losing a risky catch.

## Totals (run 3)

| | risky (caught) | harmless (false alarm) |
|---|---|---|
| existing tests fail | 5/17 | 0/8 |
| routed by trust | 17/17 | 2/8 |
| saved tests fail | 1/17 | 0/8 |
| trust (routed or saved) | 17/17 | 2/8 |
| trust or existing tests | 17/17 | 2/8 |

- Risky mutants caught by trust but not by existing tests: 12
- Risky mutants missed by both: 0 (none)
- Lines to read: routed mutants show 57 evidence lines (guard lines + secret-route lines) for 44 diff lines changed in those mutants (median 4 per mutant). Single-edit mutants are tiny, so evidence can exceed the diff; the saving shows on large agent diffs (PLAN.md: 3 lines for REQ-V7), which this run does not re-measure.

## Per mutant

| id | what changed | risky | existing | routed | saved | guard change seen |
|---|---|---|---|---|---|---|
| R1 | handleBrowse: dotfile check only when `?all` is unset (guard narrowed) | yes | no | yes | no (0/15) | removed `strings.HasPrefix(e.Name(), ".")` |
| R2 | handleBrowse: dotfile check deleted (lists .vault-secrets.json) | yes | yes | yes | yes (5/15) | removed `strings.HasPrefix(e.Name(), ".")` |
| R3 | newMux: requireAuth dropped around /api/delete | yes | no | yes | n/a | - |
| R4 | newMux: requireAuth dropped around /api/secret | yes | yes | yes | n/a | - |
| R5 | requireAuth: `!isAuthenticated` inverted | yes | yes | yes | n/a | removed `!isAuthenticated(r, cfg)` |
| R6 | isAuthenticated: username comparison dropped from the return | yes | no | yes | n/a | - |
| R7 | isAuthenticated: auth not configured -> returns true (everyone is admin) | yes | no | yes | n/a | - |
| R8 | handleDelete: content-root prefix check deleted | yes | no | yes | n/a | removed `!strings.HasPrefix(absPath, absContentRoot)` |
| R9 | handleUpload: dotfile names allowed (can overwrite .vault-secrets.json) | yes | no | yes | n/a | removed `filename == "." || filename == ".." || strings.HasPrefix(filename, ".")` |
| R10 | handleDelete: `cannot delete root` check deleted | yes | no | yes | n/a | removed `cleanPath == "/"` |
| R11 | handleFiles: any unlock cookie opens every secret file | yes | no | yes | n/a | removed `!unlocked[reqPath]` |
| R12 | getUnlockedPaths: cookie signature check deleted (forgeable unlocks) | yes | yes | yes | n/a | removed `!hmac.Equal([]byte(sig), []byte(expected))` |
| R13 | handleMove: destination prefix check dropped | yes | no | yes | n/a | removed `!strings.HasPrefix(oldAbs, absContentRoot) || !strings.HasPrefix(destAbs, absContentRoot)` |
| R14 | handleLogin: bad credentials answered with 200 instead of 401 | yes | yes | yes | n/a | - |
| R15 | setUnlockedCookie: HttpOnly turned off | yes | no | yes | n/a | - |
| R16 | handleSecret: response echoes the secret code back | yes | no | yes | n/a | - |
| R17 | handleBrowse: `continue` deleted after e.Info() error (nil deref) | yes | no | yes | no (0/15) | removed `err != nil` |
| H1 | handleBrowse: rename local `entryPath` -> `p` | no | no | no | no (0/15) | - |
| H2 | main: log text reworded | no | no | no | n/a | - |
| H3 | handleUpload: error message reworded | no | no | no | n/a | - |
| H4 | handleLogin: `http.MethodPost` -> "POST" in the method guard | no | no | yes | n/a | removed `r.Method != http.MethodPost` |
| H5 | handleBrowse: comment added above the sort | no | no | no | no (0/15) | - |
| H6 | fileSize: if inverted with both branches swapped (same behaviour) | no | no | no | no (0/15) | removed `info.IsDir()` |
| H7 | handleBrowse: also hide `~` backup files (stricter filter) | no | no | yes | no (0/15) | removed `strings.HasPrefix(e.Name(), ".")` |
| H8 | handleMkdir: permission literal 0755 -> 0o755 | no | no | no | n/a | - |

`saved` shows regressions / saved tests run; n/a means the suite has no tests for that function or its callers.

## Observations (from this mutant set)

- Guards are matched by condition text, so a removed guard is hidden when another guard in the same function has the same text and path (R17: one of several `err != nil` checks lost its `continue`).
- Any rewrite of a condition counts as "removed", including stricter or equivalent ones (H4, H7: the two false alarms). H6 also shows as removed but is not next to a secret, so not routed.
- The saved guard tests catch deleting the dotfile check (R2) but not narrowing it behind a new query flag (R1): they only exercise the default request.

## Limits

- We wrote the mutants and their risky/harmless labels; they are not real agent output.
- One repo, one Go file, one author of the labels.
- Routing is guard-centric: it sees removed or narrowed `if ... return/continue` checks. Changes in return values, struct literals, cookie flags, status codes or route wiring in `newMux` are not routed.
- In vault almost every function is within one call of a secret, so the secret condition rarely filters anything here; routing is close to "any non-widened guard change".
- The saved suite only holds tests for `handleBrowse` (from REQ-V7), so only mutants there can be caught by it.
- Pending requirement tests for `match=` fail on `main` and are therefore never counted.
