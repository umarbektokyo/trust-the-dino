# trust/ — plan

Earned Trust in AI Code (Tieto), speedrun version. Also aimed at **Best Use of Nemotron** and
**Best Use of Modal**. Written 15 Nov 2026, judging day. Builds on `../earned-trust/` (same
challenge, C#/Java dossier reviewer); reuse what works there, don't rebuild it.

## Positioning (15 Nov, later)

trust is a **merge IDE**: it understands the codebase semantically (functions as nodes, calls, data
flow, layers, secrets) so a merge doesn't fail on something nobody saw. Review is one screen of it.
Tests are kept per project: each commit adds what it earned and re-runs what earlier commits saved.

## The idea in one paragraph

An agent-written change is not reviewed as a diff of files. The codebase is split into **nodes**,
one per function or component, each tagged with a **layer** (visual, data, logic) and linked by
**edges** (calls, renders, reads/writes data). When a change lands, every touched node gets
evidence a human can check without reading the whole diff:

- **logic** node → an AI-written unit test suite, run until the function has 100% line coverage
  (or the uncovered lines are shown as a gap, never hidden);
- **data** node → its dataflow: where the value comes from, where it goes, and what labels
  (e.g. `secret`) travel with it;
- **visual** node → the component rendered with sample data, before and after, next to every
  component that uses it.

The review screen is the one the team already chose: "GitHub Desktop where the unit is a
function". Callers' lines on top (what goes in), the diff in the middle, consumers' lines below
(what the output feeds), tests or gallery beside it.

## Do we need Tieto's projects?

No. The brief says the repo is input to "feel inspired but not limited" by, and it is C#, which is
outside our three languages. Judges weight the concept. What the brief does require: **one sample
agent-written change with its requirement ID**, what the AI found, what it refused to decide, and
who decides. So we use our own small sample projects, each with a requirement file and an
agent-written branch:

| Sample | Language | Shows | Source |
|---|---|---|---|
| `samples/vault` | Go + Svelte 5 | the secret leak, test generation, dataflow, component before/after | github.com/umarbektokyo/vault, agent branch `agent/req-v7-glob` (`./samples.sh`) |
| `Waddenislands` | Java | the third language works on an existing, human-written codebase | `../earned-trust/Waddenislands` (already has an agent branch, REQ-W3) |

Mention MessagePack-CSharp in the pitch as "C# adapter = next language", which also proves the
extensibility claim.

## The headline demo: the `*` that lists the secrets file

Built and verified on vault (`input/v7/`).

- Team Security's rule: `.vault-secrets.json` (HMAC hashes of every file's secret code) lives in
  the content root, and `handleBrowse` never lists dotfiles (`if strings.HasPrefix(name, ".")`).
- Team Files asks an agent for **REQ-V7**, a server-side glob filter (`?match=*.pdf`). The agent
  moves the dotfile guard into an `else`: it only runs when `match` is empty. Go's
  `filepath.Match("*", ".vault-secrets.json")` is true.
- Every test passes, including the old `TestBrowseHiddenFilesExcluded` (it sends no `match`) and the
  agent's new `TestBrowseGlobMatch`. A probe confirms `?match=*` lists dotfiles. The file diff is
  8 lines in one handler.
- Trust sees: node `handleBrowse` (data) changed; the dotfile guard is a **guard edge** owned by Team
  Security; on head the guard no longer dominates the list output for every input. Rule: a changed
  guard on a path that reaches a labelled secret is not the AI's to decide. Routed to Aino Virtanen
  (Team Security) with three lines: the secrets path in `newMux`, the moved guard, the `match` read.
- What a generated test should catch: `match=*` must not return a name starting with `.`. That
  test fails on head and passes on base, which is the evidence.
- Found on the way (pre-existing, not the agent's): `/files/.vault-secrets.json` is served by
  `http.FileServer` to anyone who knows the name. Browse hiding it was the only protection.
  Show it as "the AI also noticed", not as a blocker of this change.

Variant to mention, not build: the same pattern in SQL (`SELECT *` from a table with a secret
column) and in Svelte (`{...$$props}` spreading a token into a child).

## Architecture

```
repo (git, two refs) ─► language adapter ─► graph.json (nodes, edges, labels)
                                              │
                    ┌─────────────────────────┼────────────────────────┐
                    ▼                         ▼                        ▼
              logic nodes                 data nodes               visual nodes
        testgen (Nemotron)          dataflow + label rules     gallery + screenshots
        run in Modal sandboxes       (deterministic)           (Playwright, base vs head)
        coverage loop                                          judged by Nemotron VL
                    └─────────────────────────┼────────────────────────┘
                                              ▼
                                       dossier.json  ─►  review UI  ─►  decisions log
```

Everything that can be computed is computed. Models write tests and sample data and compare
screenshots; they never decide whether a change is safe. Refusals come from **rules** (labels,
layers, paths) first and the model second.

### Language adapters (how new languages stay easy)

One interface, one folder per language. An adapter is the only language-specific code.

```
adapters/<lang>/
  adapter.py        # parse(repo, ref) -> nodes, edges ; classify(node) -> layer
  queries/*.scm     # tree-sitter queries: functions, calls, field reads, imports
  runner.py         # write test file, run it, return pass/fail + per-function coverage
  guidelines.md     # the coding rules for this language (below)
```

Parsing uses **tree-sitter** for all three (`tree-sitter-language-pack` has Go, Java, TypeScript,
Svelte), so adding Python or C# is mostly a new query file. Precise tools are used where they are
cheap: `go/ast` is not needed at first; `go test -coverprofile` gives exact per-function coverage.

| | Go | Java | Svelte |
|---|---|---|---|
| node | func / method | method | component, exported TS function, `load` |
| layer: visual | — | — | `.svelte` components |
| layer: data | touches `net/http`, `database/sql`, `os`, `encoding/json` | touches IO, JDBC, `System.in/out` | `+page.server.ts`, `load`, `fetch`, stores |
| layer: logic | the rest | the rest | pure `.ts` in `lib/` |
| tests | `go test -cover` | JUnit 5 + JaCoCo | Vitest + coverage-v8, @testing-library/svelte |
| gallery | — | — | generated `/__trust/gallery` route |

**Node shape** (`graph.json`): `id` (`file:Name`), `lang`, `layer`, `file`, `range`, `signature`,
`hash` of the body (so we know which nodes a change touched), `labels` (`secret`, `pii`,
`public-api`), `owner`.
**Edge shape:** `from`, `to`, `kind` (`calls`, `renders`, `reads`, `writes`, `returns-to`),
`line` (the exact line in `from`, which is what the diff view shows).

### Coding guidelines (`guidelines.md`, one page per language)

They make the split and the tests work, and the adapter checks them as evidence:

1. Logic functions are pure: no IO, no globals, inputs in, output out. ≤ 40 lines.
2. IO lives only in the data layer; a data function does one read or one write.
3. Components get everything through props; no fetching inside a visual component.
4. Secrets carry a label at the definition (`trust:"secret"` tag, `@Secret`, `/** @secret */`).
5. No wildcard serialization or spreading of a type that has a labelled field.

A violation is not a block: it is shown on the node ("not unit-testable: reads os.Getenv").

### Test generation loop (logic nodes)

1. Prompt the fast model with: the function, its signature, the caller lines (real inputs), the
   consumer lines (expected use of the output), the requirement text.
2. Write the test file, run it in a Modal sandbox, read per-function coverage.
3. Not 100%? Send the uncovered line numbers back. At most 3 rounds.
4. Run the final suite on **base and head**. A test that passes on both says behaviour kept; a
   test that fails on base and passes on head is the evidence for the requirement (reuse
   `earned-trust/trust/testrun.py`, which already does with/without).
5. Store tests, coverage, uncovered lines, rounds used. Uncovered lines stay visible.

### Visual nodes

1. Model writes sample props for each component from its prop types and caller lines.
2. A generated SvelteKit route renders every component in a grid with those props (the gallery).
3. Playwright screenshots each component at base and head, plus every component that renders it
   (reverse `renders` edges).
4. Pixel diff decides "changed / unchanged". Nemotron VL only describes *what* changed in words.

## Models and infra

| Job | Model / service | Why |
|---|---|---|
| test generation, sample props | `nvidia/nemotron-3.5-lightning-30b-a3b` (NVIDIA Build API, OpenAI-compatible) | ~1–2 s, many calls |
| screenshot comparison, summary of a change | `nvidia/nemotron-3.5-super-vl-120b-a12b` | reads images; required for the Nemotron prize |
| running generated tests | **Modal Sandboxes**, one per node, fanned out | parallel, isolated from our machine; Modal prize |
| fallback | logged-in `claude` CLI, cached (as in `earned-trust`) | when rate limits hit (~40 req/min per key) |

Both models answered on 15 Nov. They reason by default (`reasoning_content`, ~800 tokens for a tiny
prompt), so give `max_tokens` ≥ 4000 and read only `content`. Tell it not to redefine the function
under test (it did in the probe). Keys go in the repo `.env` (`NVIDIA_API_KEY` is set; `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`). All model
outputs are cached by input hash so the demo replays offline.

## Custom git server: not now

A real git server costs hours and adds nothing a judge sees. Plan: plain local git repos (base
branch + agent branch), and our Python server reads them with `git` commands, as `earned-trust`
already does. The UI looks like our own git client, which is the part that matters. If time is
left: `git http-backend` behind the same server so `git push` to it triggers a dossier build.

## UI (keep to the agreed direction)

Teenage-engineering style: warm light grey, one orange accent, thin lines, small uppercase mono
labels. Three panes, as in `earned-trust/web` (reuse its `diff.js`, `syntax.js`):

- **left:** changed nodes, grouped by layer (VISUAL / DATA / LOGIC), a dot per node (tested,
  gap, routed);
- **middle:** the node as an editor: `IN` (callers' lines) → diff → `OUT` (consumers' lines);
- **right:** for logic, the generated tests + coverage bar with uncovered lines; for visual, the
  before/after and the dependents; for data, the flow path with labels; the question box if the
  AI refused.

One extra screen: **map**. Not a force-directed graph (rejected before). Three fixed columns,
VISUAL | DATA | LOGIC, nodes as small rows, edges only for the selected node. It answers "what does
this touch" and nothing else.

## Folder layout

```
trust/
  PLAN.md
  core/            graph model, diff → touched nodes, dossier build, decisions (from earned-trust)
  adapters/go/  adapters/java/  adapters/svelte/
  ai/              nemotron client, prompts, cache
  sandbox/         modal app: run_tests(lang, files) -> result
  web/             review UI
  samples/vault/   (git-ignored, ./samples.sh; Java: ../earned-trust/Waddenislands)
  input/<case>/    requirement text, owners, agent patch per case
  run.sh  test.sh
```

## Order of work (cut from the bottom)

| # | Step | Done when | Est. |
|---|---|---|---|
| 1 | ~~vault + REQ-V7 agent branch with the leak~~ **done** | tests green on both refs, probe shows the leak | — |
| 2 | ~~Go adapter + graph diff~~ **done** (`adapters/go`, `core/graphdiff.py`, `./test.sh`: 9 Go + 12 Python tests) | REQ-V7 routes the narrowed guard with 3 lines | — |
| 3 | ~~Dossier for REQ-V7~~ **done** (`python3 -m core.dossier v7`) | one JSON the UI reads | — |
| 4 | ~~Review UI~~ **done** (`trust/web`, launch config `trust`, port 8290) | the leak demo can be clicked through | — |
| 5 | ~~Test generation loop~~ **done** (`core/testgen.py`: requirement tests + guard tests, base vs head, coverage loop) | handleBrowse 92.5%, 3 guard regressions | — |
| 6 | Modal sandbox runner | same result, run on Modal, in parallel | 45m |
| 7 | Svelte adapter on vault's frontend + gallery + before/after | FileBrowser/Preview render with sample data | 2h |
| 8 | Java adapter on Waddenislands (JDK must be installed: `brew install temurin`) | REQ-W3 nodes + generated JUnit tests | 1h |
| 9 | Map screen (three columns) | selected node shows its edges | 45m |
| 10 | Concept card, lessons log, decisions log, 2-min video | deliverables in the brief are covered | 1h |

Steps 1–4 + 10 are the minimum submission for Tieto. 5–6 are needed for Nemotron and Modal.
7 makes the "three languages" claim real; 8 can fall back to "graph only, no generated tests".

## Mapping to the judging criteria

- **Clarity (30%)**: one rule, evidence per node by layer; refusals come from labels, not vibes.
- **Practicality (25%)**: runs on a normal git branch; owners come from node labels; human time
  scales with refusals, not lines.
- **Measurement (25%)**: reuse `earned-trust/CONCEPT.md` metrics; add per-node coverage reached
  by AI tests, rounds needed, and share of nodes needing a human.
- **Evidence (20%)**: every claim points to a line, a test run or a screenshot pair, tied to the
  requirement ID.

## Judging check (15 Nov, after step 2)

| Criterion | Weight | Where we stand | What closes the gap |
|---|---|---|---|
| Clarity | 30% | Strong idea, but "semantic understanding of the codebase" can sound like a feature tour | Pitch the graph as the *means*; the claim is "a human signs off on 3 lines, not 800" |
| Practicality | 25% | Runs on two git refs, ~2 s on vault, owners file exists | Wire `owners.json` into routing; show it on a second real repo (Waddenislands) |
| Measurement | 25% | **Weakest: nothing measured yet** | Seeded-mutation run (below) + lines-to-read vs lines-changed + AI-test coverage and rounds |
| Evidence | 20% | Each routed item points at exact lines | Tie nodes to the requirement ID; generated test that fails on head, passes on base |

Field: Earned Trust had 25 preliminary entries, the fewest in the Agentic AI track. Nemotron has 2
winners across all tracks, so its usage must be visible on screen, not only in the pipeline.

## Demos

1. **The `*` that lists the secrets file** (built). Every test green; trust routes one guard change
   with three lines to Team Security.
2. **The test that should exist.** Nemotron writes a test from REQ-V7 and the narrowed guard:
   `match=*` never returns a dotfile. Red on head, green on base. AI-written evidence, checked by
   running it, not by trusting the model.
3. **Seeded mistakes, measured.** Script 20 small agent-style edits to vault (weaken a guard, drop
   an auth wrapper in `newMux`, swap a comparison). Report how many trust routes and how many
   the existing tests catch. This is the Measurement number, and it is reproducible.
4. **Blast radius of one line.** An agent edits `signValue`. The graph shows every caller line
   (login, unlock cookies, auth check) without opening a file.
5. **Visual change, every user.** Edit `Preview.svelte`; show Preview and FileBrowser before and
   after with sample data; Nemotron VL says what changed in one sentence.
6. **New language in one file.** Java adapter on Waddenislands REQ-W3: same screen, same rules.

Order: 1 → 2 → 3 → 5 → 4 → 6.

## Risks

- Routing rule is coarse: `newMux` names the secrets file and calls every handler, so any guard
  change in any handler routes to Security. Defensible for a file server, noisy elsewhere. Demo 3
  measures the noise.

- JDK: `brew install openjdk` done (27.0.1), keg-only: use `/opt/homebrew/opt/openjdk/bin/java`.
- vault's frontend is 3 big components (FileBrowser is 1746 lines): the Svelte split will show
  few, large nodes. That is itself a guideline finding ("split this component").
- NVIDIA free tier rate limits: cache everything, one key per teammate, Claude CLI fallback.
- AI tests that assert whatever the code does today are worthless as evidence of a requirement.
  Mitigation: the base-vs-head run (step 5.4), and say this limit out loud in the concept card.
- tree-sitter call edges are name-based; calls through interfaces are missed. State it as a limit.
- Scope: the gallery and Java are the first things to cut, the leak demo is the last.

## Open questions for the team

1. Is `trust/` replacing `earned-trust/` as the submission, or a second take on the same challenge?
2. Core in Python (reuses earned-trust, fastest) or Go (single binary, nicer story)? Plan assumes Python.
3. Is one shared demo story (the secrets file) enough, or does each language need its own requirement?

## Decisions (log)

- 15 Nov: Go + Svelte sample is the team's own `vault` repo, not new samples; Java stays Waddenislands.
- 15 Nov: LLM is Nemotron (NVIDIA Build key in `.env`), not Gemini; key came in time.
- 15 Nov: the leak is a moved dotfile guard + glob `*`, not a root password field: it is what vault
  actually has, and it keeps every existing test green, which is the point.
- 15 Nov: UI and docs stay terse; the previous attempt had too much text on screen.
- 15 Nov: adapters are programs (`<adapter> <dir>` → JSON), each in its own language. Go uses
  `go/types`, so method calls resolve through receivers. Comparing refs is the core's job.
- 15 Nov: test generation uses Nemotron 3.5 Super (120B) with thinking off. Lightning invented
  helpers and never fixed compile errors; thinking on spent 16k tokens with no answer.
- 15 Nov: two kinds of generated test. Requirement tests come from the requirement and code (the model
  chose the intent, and once blessed the leak: `MatchDotfileGlobReturnsDotfiles`). Guard tests take
  their intent from the old code's rule (computed); the model only writes the code. Only the second
  kind is used as evidence for a routed item.
- 15 Nov: review screen redone after user feedback: commit list on the left (units of the open
  commit under it), one Nemotron sentence per unit, tests as boxes answering two questions ("does
  it do what REQ asks", "does what worked still work"); only failed tests are spelled out; hovering
  a test lights the lines it runs (one Go cover profile per test). Visual units show before/after
  screenshots of the real app (backend + built frontend at each commit, Playwright, sample content).
- 15 Nov: second agent commit REQ-V8 (file size in Preview header): nothing routed, visual only.
- 15 Nov: saved suite (`core/store.py`, `suite/<project>.json`). Guard tests and tests that passed
  before and after are saved at once; requirement tests only after a human merges (so a test that
  blesses a bug can't become a rule); failing-on-both never. Later commits re-run saved tests of the
  changed function and its callers; files that stop compiling are dropped with the reason; new tests
  with a saved test's name are dropped as duplicates. Shown on REQ-V7's fix commit (v7b): the 3 guard
  tests that caught the leak now pass.
- 15 Nov: widened guards (check runs in more cases) are not routed and get no guard tests.
- 15 Nov: decisions live on the server (`decisions.json`, `/api/decide`); "merged" promotes tests.
- 15 Nov: Java via the JDK compiler tree API + JUnit/JaCoCo (Waddenislands, REQ-W3); added functions
  get tests too. Peek chat (`/api/chat`) answers only from the open commit's review and never decides.
- 15 Nov: guards are compared by condition text and their full path condition, so a guard moved
  under an `else` is reported as narrowed, with the added condition.
