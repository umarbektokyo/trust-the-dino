# Lessons, failure modes, decisions

## Failure modes we hit

| What happened | What it taught | What we changed |
|---|---|---|
| Nemotron wrote `TestTrust_MatchDotfileGlobReturnsDotfiles`, asserting the leak is correct behaviour. It passed on the agent commit. | A test written from the code approves whatever the code does. | Only guard tests (intent from the old code) and tests that held before and after are trusted. Requirement tests wait for a human merge. |
| Nemotron 3.5 Lightning invented helper functions and never fixed the compile errors it was shown. | A small model can't repair its own compile errors in 3 rounds. | Test generation uses Nemotron 3.5 Super (120B). |
| With thinking on, Nemotron spent its whole token budget reasoning and returned empty content (16k tokens, no answer). | Reasoning budget is not output budget. | Thinking off (`enable_thinking: false`); an empty answer is an error, not a pass. |
| On the fix commit, the model rewrote 11 saved tests under the same names. | "Don't repeat these tests" in a prompt is not enforced. | A new test with a saved test's name is dropped; the saved one wins. |
| REQ-W3's two generated Java tests depend on thread timing: stable here, not guaranteed. | Some regressions are races, not hard bugs. | Shown as regressions with the reason; flagged as timing-dependent in the write-up. |
| Line 771 was marked "never run" although its condition ran. | Go coverage blocks start at `{`; a line can sit in a run and a skipped block. | A line counts as run if any block covering it ran. |
| The fix commit (check moved back in front of the glob) first read as another "narrowed" check. | A check that runs in more cases is safer, not riskier. | Widened checks are not routed and get no guard tests. |
| Reviewing a cloned public repository was blocked: it would run strangers' tests on the laptop. | Review = code execution. | Public site is read-only; adding needs an admin token; a sandbox is the next step. |
| Re-running `samples.sh` re-created the agent commits with new hashes, orphaning the saved reviews. | Demos must be reproducible from a clean clone. | Patches applied with `--committer-date-is-author-date`; fixed dates for Waddenislands. |
| Regenerating with different coverage feedback produced a different test set. | Model output is not stable across runs. | Every model answer is cached by request hash; reviews are stored as data and replayed. |

## Lessons

- The model writes code; the rules decide what it means. Every trusted signal in the UI is computed.
- Humans read three lines well and three hundred badly. The routed item shows the check, the secret, the call.
- Showing what is not proven ("never run: 772–774", "fails before and after") builds more trust than hiding it.
- Earlier UIs with gates, counters and node maps were rejected as noise. A Git-client layout with one orange accent was not.

## Decisions (15 Nov)

| Time | Decision |
|---|---|
| ~02:00 | Sample repository is the team's own `vault` (Go + Svelte); Java is Waddenislands. |
| ~02:30 | The demo mistake is a moved dotfile check plus a `*` glob that lists `.vault-secrets.json`; every existing test stays green. |
| ~03:00 | Adapters are programs (source dir in, graph JSON out), one per language; Go uses `go/types`, Java the JDK compiler API. |
| ~03:30 | Two kinds of generated test: requirement tests and guard tests; only the second is evidence for a routed item. |
| ~04:00 | Saved test suite per project; promotion on merge only. |
| ~04:30 | Decisions recorded server-side with name and time; merge is the approver's. |
| ~05:00 | Moved to its own repository; public site read-only behind a Cloudflare tunnel. |
