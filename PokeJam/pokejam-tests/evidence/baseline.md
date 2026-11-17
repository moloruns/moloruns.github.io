# Implementation evidence — November 16, 2026

AI-generated factual record; not the student's `TESTING.md` or prompt log.

## Repository and scope

- Starting branch/HEAD: `main`, `fb40182` (`updates`).
- Remote: `https://github.com/moloruns/moloruns.github.io.git`.
- Working branch: `pokejam-tests` (created locally).
- No applicable `AGENTS.md` was found in the repository or ancestor directories.
- Pre-existing `.DS_Store` modification, `hw8_handoff.zip`, handoff plan and prompt log retained.
- Prompt logs and student narrative were not authored or changed by the agent.
- Tool: Codex. Exact client-displayed model not independently available; do not infer it from the plan's requested model.

## References rechecked

- [Assignment](https://www.cs.cmu.edu/~113/hw9.html): first test is student-authored; use built-in Node runner, at least eight tests over three functions, five mutations, CI and verifier evidence.
- [Node release table](https://nodejs.org/en/about/previous-releases): Node 26 listed as LTS.
- Official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation show v7.

## Runtime

`command -v node` initially found no Node executable. Downloaded the official
`https://nodejs.org/dist/v26.13.1/node-v26.13.1-darwin-arm64.tar.gz` into
`/tmp/pokejam-hw9-runtime/`, verified its SHA256 against the official
`https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt`, then extracted it there.

SHA256: `aec2514ea1ceb2ba52455e9ec65986f6749a06dd759e5db2a72e6889668c9735`.

Executable: `/tmp/pokejam-hw9-runtime/node-v26.13.1-darwin-arm64/bin/node`.
Reported version: `v26.13.1`. This is temporary, not a system installation or
a permanent PATH change. No project dependencies or test framework installed.
Network access and creating the local Git branch required sandbox escalation;
both succeeded. The initial sandboxed network request failed DNS resolution.

## Preview and browser verification limits

`python3 PokeJam/serve.py --no-browser` initially failed with a sandbox socket
permission error. With escalation it served at `http://127.0.0.1:8005`.
Ports 8003 and 8004 were already occupied; existing servers were left alone.

Python Pillow and Google Chrome are available; Python Playwright is missing.
The attempted baseline command was:

```sh
python3 PokeJam/tests/run_browser_suites.py http://127.0.0.1:8005
```

It stopped at the first suite with `ModuleNotFoundError: No module named 'playwright'`.
No browser tests passed. The child suite exited 1; the runner raised
`CalledProcessError`. The shell wrapper that printed the saved log exited 0;
that does not indicate a successful suite. Raw output:
[baseline-browser-suites.txt](logs/baseline-browser-suites.txt).

Blank/name/type/unknown searches, both comparison directions, chart rendering,
attribute highlights, direct query navigation and gameplay interactions were
**not run** before or after extraction. Browser console errors were not captured.
Post-extraction HTTP checks returned 200 for Pokédex, Compare, Play and the new
module; see [preview-http.txt](logs/preview-http.txt). HTTP success does not
establish UI correctness. The owned preview was stopped at handoff.

## Extraction result

`REFACTOR_SHA=4194d3afd5eccf6712d0b2d57e1927f7dfde1c8d`

This commit contains only `PokeJam/package.json`, `js/catalog_logic.js`,
`js/pokedex.js` and `js/compare.js`. Added the local ESM scope and extracted
`selectPokedexRecords`, `candidatesFor` and `attributeComparison`. All three
are called by the original pages; old inline computations were removed.
Existing module script tags were retained. No matching, data or gameplay
source was changed.

The diff preserves pinned roster behavior, default limit 72, substring search,
truthy eligibility flags, attribute order, absolute gaps, ties and empty-array
extrema. Missing numeric attributes can still yield NaN; comparison UI still
assumes a candidate exists. These are observations, not newly specified contracts.

Node import without DOM globals, syntax checks of the new module and three
related modules, and `git diff --check` all exited 0. Commands and actual output:
[extraction-checks.txt](logs/extraction-checks.txt).
These are setup checks, not assignment unit tests or browser regressions.
