# CI evidence

AI-generated factual record, updated November 17, 2026.

## First passing run

- Run: https://github.com/moloruns/moloruns.github.io/actions/runs/44138174421
- Job: https://github.com/moloruns/moloruns.github.io/actions/runs/44138174421/job/134233348441
- Head SHA: `db408e44724aac880f9bea8b05896201ab796d1a`.
- Workflow: `Pokejam tests`; event: push; branch: `pokejam-tests`.
- Run status: `completed`; conclusion: `success`.
- `Run node --test tests/*.test.js`: completed successfully November 17 at 17:33:10 UTC (12:33:10 PM America/New_York).
- Actual API evidence: [run](logs/green-run-api.json), [job and steps](logs/green-jobs-api.json).
- Actual step excerpt: `name: Run node --test tests/*.test.js; status: completed; conclusion: success`.
- CI test count: not independently retrieved. The matching local suite has 18 passing tests; do not present that as a downloaded CI log count.
- The job-log download endpoint returned HTTP 403, `Must have admin rights to Repository.` See [response](logs/green-job-log-access.json).

The branch was published through a path outside this agent's shell. A subsequent
shell push still failed: `fatal: could not read Username for 'https://github.com':
Device not configured`, exit 128. Push authorization remains granted; usable
command-line credentials are still missing. Future branch commits can be pushed
through GitHub Desktop.

## Deliberately failing run: prepared locally, awaiting push

- `BROKEN_SHA`: `1f6fc4d9dcffabc694f70c8eb6a30c6b35c4188f`.
- Commit changes only one source line in `PokeJam/js/catalog_logic.js`.
- Source mutation: previously caught M1, eligibility filter negated.
- Local execution: 18 tests, 17 pass, 1 fail, exit 1.
- Named failure: `a Pokémon query only includes eligible NBA players`.
- [Actual local output](logs/red-ci-preparation.txt), [exact source diff](logs/red-ci-source.diff).
- Red GitHub run URL: **not available — broken commit not pushed yet**.
- The branch is intentionally failing at this checkpoint for the verifier experiment; this is not the final repaired state.

The public Pages configuration endpoint returned HTTP 404 without authentication.
Public [deployment history](logs/pages-deployments-api.json) shows the three latest
`github-pages` deployments from `main`, most recently `fb40182`. The published
experimental branch has only the test run above, and its repository workflow
contains no deployment steps. This supports keeping the experiment on
`pokejam-tests`; do not merge it into `main`. Full Pages settings were not accessible.

## Next evidence

Push the prepared commit through GitHub Desktop, then inspect its actual Actions
failure. Only after that run is recorded, start the independent verifier in a
clean checkout of `BROKEN_SHA`, without this plan or evidence. Capture its prompt,
transcript and complete diff, audit tests against
`1cc73ed43673da41965f2220391e5e832970f1e1`, and verify the repair independently.
No verifier session or final repaired CI run has occurred yet.
