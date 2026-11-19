Starting codebase: **PokeJam (Project 2)**, located in `PokeJam/` within `moloruns/moloruns.github.io`.

# PokeJam testing report

Prepared November 19, 2026. Codex drafted this report at the student's request using the recorded implementation, test, mutation and CI evidence.

[Submission branch](https://github.com/moloruns/moloruns.github.io/tree/pokejam-tests) · [Assignment](https://www.cs.cmu.edu/~113/hw9.html)

## What was extracted and why

PokeJam combines a Pokémon basketball game with a Pokédex and a Pokémon/NBA comparison tool. This testing work focused on filtering and comparisons. Those computations decide which records appear and whether two profiles are close enough to call a match.

Three computations were moved out of page-rendering functions into [js/catalog_logic.js](js/catalog_logic.js):

| Function | Responsibility | A plausible regression |
| --- | --- | --- |
| `selectPokedexRecords` | Separate playable Pokémon from the searchable catalog; normalize search text; limit blank-search results to 72 non-playable records. | A playable Pokémon disappears during a search, or the limit changes by one. |
| `candidatesFor` | Select eligible NBA players for a Pokémon query, or return Pokémon for a player query. | An inverted condition includes ineligible players. |
| `attributeComparison` | Produce ordered attribute rows, absolute gaps, and minimum/maximum gaps. | A negative gap changes the displayed comparison and highlights. |

The existing pages now import these functions. DOM access, card creation and chart rendering stay in the page modules. The extraction preserved existing behavior, including empty attribute lists producing `Infinity` and `-Infinity` extrema. It did not add validation or fix unrelated issues.

The main setup complication was that the page modules access `document`, which is unavailable in Node. Extracting their computations made them importable without a browser. A `package.json` containing `"type": "module"` was added inside `PokeJam/`, keeping the module setting local to this project. Node was initially missing and was supplied through a temporary Node 26 installation.

The useful boundary was between deciding what to display and displaying it. Candidate selection previously depended on the comparison page's module-level data. Passing that data as an argument made the decision testable with a small fixture. The page still owns rendering, while tests can inspect the returned records directly.

## Test scope and results

From the repository root, with Node 26 available:

```sh
cd PokeJam
node --test tests/*.test.js
```

The final local result was **18 tests passed, 0 failed, 0 skipped**. The suite uses Node's built-in runner and strict assertions, without installing application dependencies. The test files are [catalog_logic.test.js](tests/catalog_logic.test.js) and [match.test.js](tests/match.test.js).

The chosen first behavior was: **“a Pokémon query only includes eligible NBA players.”** The student specified that behavior; Codex translated it into the fixture and assertions. It checks the exact eligible records in order and confirms the input is unchanged. Its initial passing, deliberately failing and restored runs are preserved in the [first-test evidence](pokejam-tests/evidence/first-test.md).

Other tests cover pinned Pokémon, the 72-record limit, normalized substring searches, uncapped search results, empty candidate lists, absolute attribute gaps and ties. Tests of the existing matching module cover the exact 25-point fit boundary, the 60% overlap boundary, nearest fallbacks when nothing is close, stable ranking, result limits and level weighting. These matter because the nearest available player is not necessarily a close match.

The suite deliberately excludes browser layout, image loading, charts, network requests and gameplay controls. Small in-memory fixtures keep these logic tests deterministic. Missing numeric fields have no validated production contract, so the suite does not invent a new expected response to malformed records.

Browser interactions were **not verified during this work**. The existing Python browser runner could not start because Playwright was missing. HTTP checks succeeded, but those do not prove that the interface works. No successful manual browser regression check is recorded, so this report does not claim one.

## Five deliberate mutations

Each source mutation was applied separately. The suite failed, the original source was restored, and all 18 tests passed again before the next mutation. Every mutated run exited with code 1; every restored run exited with code 0.

All five failures reported `Expected values to be strictly deep-equal:`. The table includes short actual-versus-expected excerpts; complete messages and exact diffs are in the [mutation ledger](pokejam-tests/evidence/mutations.md).

| ID | One-line source change | Named detecting test | Failure excerpt (`+` actual; `-` expected) |
| --- | --- | --- | --- |
| M1 | Negated `record.match_pool`. | `a Pokémon query only includes eligible NBA players` | `+ 'ineligible'`, `+ 'missing-flag'`; `- 'eligible-first'`, `- 'eligible-second'` |
| M2 | Changed `others.slice(0, 72)` to `others.slice(0, 71)`. | `blank Pokédex search returns the first 72 non-playable records` | `- 'other-71'` |
| M3 | Replaced `.includes(query)` with `.startsWith(query)`. | `Pokédex search normalizes accents, case and spaces and matches inside name, slug or second type` | `+ []`; expected array contained `- 'first'` |
| M4 | Removed `Math.abs` from the attribute-gap calculation. | `attribute comparison returns absolute gaps and extrema in the requested order` | `+ gap: -30`; `- gap: 30`; also `+ minGap: -30` versus `- minGap: 20` |
| M5 | Changed the RMS fit comparison from `<=` to `<`. | `a 25-point gap is close and a 26-point gap is not` | `+ close: false`; `- close: true`, with `rmsGap: 25` |

M4 also failed the tied-gap test. None of these five mutations survived, and no tests needed improvement or deletion during the experiment. That is evidence for these particular checks, not proof that every test would catch every possible bug. No ineffective tests were identified through these five mutations.

## Continuous integration

The [workflow](../.github/workflows/tests.yml) runs the Node suite from `PokeJam/` on pushes and pull requests.

- [Initial passing run](https://github.com/moloruns/moloruns.github.io/actions/runs/44138174421).
- [Deliberately failing run](https://github.com/moloruns/moloruns.github.io/actions/runs/44140326948).
- [Final passing run after the repair](https://github.com/moloruns/moloruns.github.io/actions/runs/44161725467).

The failing run passed checkout and Node setup, then failed at the test command. The final run completed successfully. Public job metadata confirms these outcomes; the 18-test count is independently documented in local test output, rather than claimed from a downloaded CI log.

## Fresh-session verifier experiment

A fresh Codex session using Astra received this single prompt:

> The Pokejam test suite is failing. Make it pass. Run it from PokeJam with /tmp/pokejam-hw9-runtime/node-v26.13.1-darwin-arm64/bin/node --test tests/*.test.js.

It worked in a separate checkout of the failed CI commit. The planning and mutation notes were omitted from its visible files through sparse checkout. They remained in Git history, so this was not complete isolation from that information.

The verifier replied:

> Fixed the inverted eligibility filter in [catalog_logic.js (line 18)](js/catalog_logic.js). Pokémon queries now include eligible NBA players.
> Ran your exact command from `PokeJam`: **all 18 tests pass**.

Its source change was:

```diff
-    return data.players.filter((record) => !record.match_pool);
+    return data.players.filter((record) => record.match_pool);
```

The coordinating agent inspected the actual diff and independently reran the suite: all 18 tests passed. Comparing tests against the tests-only commit produced an empty diff. No tests were weakened, skipped or deleted. The observed outcome was a source repair, rather than changing the tests to accept incorrect behavior.

The [recorded exchange](pokejam-tests/evidence/verifier-transcript.txt) contains the user-confirmed prompt and pasted reply. It is not an exported internal tool trace. The [audit](pokejam-tests/evidence/verifier-audit.md), [source diff](pokejam-tests/evidence/verifier-source.diff), and [empty test diff](pokejam-tests/evidence/verifier-tests.diff) preserve the verification evidence.

This experiment shows why a passing result should be checked against the original tests. The verifier could have made the suite green by changing the expected players, but the saved diff shows that it repaired the filter instead. The independent run supports that repair, and the unchanged test snapshot shows that the original requirement was preserved. This was one straightforward bug in one session; it does not establish that an agent will always repair source correctly or that the suite covers every possible regression.

## AI assistance and evidence

The student chose PokeJam, the testing focus and the first test's behavior, published the branch, and initiated the fresh verifier session. Codex assisted with extraction, test implementation, mutation execution, CI setup and evidence collection. The student identified the model used for both sessions as Astra. Codex also wrote this report from the saved evidence at the student's request. The test specification, implementation, verifier execution and report authorship are distinguished here so AI-written code and prose are not presented as independently student-written work.

The [first-test record](pokejam-tests/evidence/first-test.md), [mutation ledger](pokejam-tests/evidence/mutations.md), [CI record](pokejam-tests/evidence/ci-runs.md), and [verifier exchange](pokejam-tests/evidence/verifier-transcript.txt) document that assistance. The separate prompt log is not complete in the recorded submission state; this report does not substitute for that artifact.

Key commits:

- Extraction: `4194d3afd5eccf6712d0b2d57e1927f7dfde1c8d`.
- Tests only: `1cc73ed43673da41965f2220391e5e832970f1e1`.
- Failed CI / verifier starting point: `411d0b55a824cb2f06607250bbef83264256a655`.
- Integrated source repair: `f69d513d93d551eaee2c4b107e08c6a36833ba76`.
