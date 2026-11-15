# Concept card: trust the dino

## Recommendation

Stop reviewing agent-written code as a diff of files. Review it as a change to a **graph of the
codebase**: every function is a node with its layer (data, logic, visual, test), the lines that call
it and the lines that read its result. A commit is a set of changed nodes. Each node gets computed
evidence (a check that moved, a secret next to it, tests run on both commits, before/after
screenshots). The AI clears what the evidence covers, refuses what is not its to decide, and routes
that to a named owner with the few lines that matter. The human checks a story, not a diff.

## Principles

| # | Principle | Balances |
|---|---|---|
| 1 | **Rules route, models explain.** Whether a change needs a human comes from the graph (a safety check now runs in fewer cases, next to a secret), never from the model's opinion. | risk, hallucination |
| 2 | **A test means where it passes.** Every generated test runs on the base and the head commit: fails before + passes after proves the requirement; passed before + fails now is a regression; fails on both is shown, not counted. | hallucination, confidence |
| 3 | **Intent is not the model's.** Only tests whose intent comes from outside the model are trusted: guard tests (the old code's rule) and tests that held before and after. Requirement tests join the saved suite only after a human merges. | quality, hallucination |
| 4 | **Show the lines, not the summary.** Every claim points at file:line: the moved check, the caller that names the secret, the lines each test runs, the lines no test reached. | transparency |
| 5 | **A named human owns each decision.** Routed items go to an owner; the merge goes to the approver; every decision is recorded with name and time. The AI (and the dino) never decides. | accountability |
| 6 | **Evidence accumulates.** Trusted tests are saved per project and re-run on later commits; a fix is proven by the tests written for the bug. | quality, confidence |

## How a named human accepts REQ-V7 without a full read

1. **Found:** one changed data function, `handleBrowse` (29 changed lines across 4 units). Its dotfile check `strings.HasPrefix(e.Name(), ".")` ran on every request; now only when `match == ""`.
2. **Refused to decide:** a narrowed check whose caller (`newMux`) names `.vault-secrets.json` is a security call, not a model call.
3. **Who:** Aino Virtanen, Team Security. Evidence: `newMux:215` (the secrets file), `:216` (the HMAC key), `:221` (the route into `handleBrowse`).
4. **Proof:** 3 generated guard tests (`match` = `*`, `.*`, `?*`) pass before and fail now; the real app at the agent commit lists `.vault-secrets.json` after typing `*`.
5. **Decision:** Aino sends it back. The agent's fix (`fcb3b92`, 5 lines) widens the check; the same 3 saved tests now pass; nothing is routed; the approver merges.

REQ-V8 (file size in the preview header) shows the other path: visual and logic only, nothing routed, before/after screenshots, the approver merges.

## Trade-offs

- **Rules over model judgement.** Predictable and explainable; misses risks no rule describes.
- **Coarse routing.** Any narrowed check under a caller that names a secret goes to Security. Safe for a file server, noisy elsewhere.
- **Generated tests cost time.** Up to 3 model rounds per function, capped at 6 functions per commit.
- **Tests of new behaviour wait for a human.** Slower to build a suite; the suite never encodes a bug as a rule.

## Limits

- Adapters for Go and Java; Svelte is split by function without tests.
- Call edges come from static analysis; reflection and dynamic dispatch are missed.
- Generated tests can depend on timing (REQ-W3) or be wrong; they are shown as such, not hidden.
- Running a repository's tests runs its code. The public site is read-only; adding repositories needs an admin token and, for strangers' code, a sandbox (not built).

## Measuring trust in production

| Metric | Formula | Healthy when |
|---|---|---|
| Revert rate, auto-cleared | units reverted within 30 days ÷ units cleared without a human | ≤ revert rate of human-reviewed units |
| Escapes | incidents whose fix touches a cleared unit ÷ cleared units | flat as review time falls |
| Routing precision | routed items a human sent back or changed ÷ routed items | well above 0 (otherwise routing is noise) |
| Test meaning | generated tests that fail on both ÷ generated tests | falls over time |
| Suite growth | trusted saved tests per project | rises; each fix proven by saved tests |
| Time to merge | commit → merge | falls |
| Share routed | lines a human must read ÷ lines changed | falls slowly as trust is earned |

Measurement (docs/MEASUREMENT.md): on 25 seeded mistakes in vault, the first rules caught 9 of 17 risky ones vs 5 by the repo's own tests; rules added after that run catch 17 of 17 with 3 of 8 false alarms, fitted to that set.
