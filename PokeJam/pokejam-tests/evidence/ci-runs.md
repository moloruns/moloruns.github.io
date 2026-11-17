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

## Deliberately failing run: verified

- Run: https://github.com/moloruns/moloruns.github.io/actions/runs/44140326948
- Job: https://github.com/moloruns/moloruns.github.io/actions/runs/44140326948/job/134241048256
- `BROKEN_SHA` / failed run head: `411d0b55a824cb2f06607250bbef83264256a655`.
- Original source-mutation commit: `1f6fc4d9dcffabc694f70c8eb6a30c6b35c4188f`.
- The user added the plan, evidence, .DS_Store change and hw8_handoff.zip in `411d0b5` before pushing. That commit did not change app source, tests, package configuration or workflow from `1f6fc4d`.
- Run status: `completed`; conclusion: `failure`.
- Checkout and Node setup succeeded; `Run node --test tests/*.test.js` failed, finishing November 17 at 17:44:55 UTC (12:44:55 PM America/New_York).
- Actual [run metadata](logs/red-run-api.json), [job steps](logs/red-jobs-api.json), and [annotations](logs/red-annotations-api.json).
- Actual GitHub annotation: `Process completed with exit code 1.`
- Detailed CI test names/counts were not retrieved from authenticated logs. Local reproduction at the exact failed SHA confirms 18 tests, 17 pass, 1 fail; named failure: `a Pokémon query only includes eligible NBA players`.
- [Exact-SHA local reproduction](logs/verifier-baseline.txt), [original preparation output](logs/red-ci-preparation.txt), [source diff](logs/red-ci-source.diff).
- This run preserves the intentionally failing checkpoint; the source was subsequently repaired locally in `f69d513`.

The public Pages configuration endpoint returned HTTP 404 without authentication.
Public [deployment history](logs/pages-deployments-api.json) shows the three latest
`github-pages` deployments from `main`, most recently `fb40182`. The published
experimental branch has only the test run above, and its repository workflow
contains no deployment steps. This supports keeping the experiment on
`pokejam-tests`; do not merge it into `main`. Full Pages settings were not accessible.

## Independent verifier: completed and independently audited

A clean sparse worktree at `/tmp/pokejam-hw9-verifier` uses the exact failed CI SHA
`411d0b55a824cb2f06607250bbef83264256a655`. The current push included the solution
notes, so the worktree excludes `/PokeJam/pokejam-tests/` and `/hw8_handoff.zip`.
This keeps them out of the visible working files without changing the commit or
production source. Git status is clean. The app, tests, workflow and package file
are identical to the original one-line mutation commit. All 18 tests were
discovered there and the single intended failure reproduced before handoff.

This is filesystem separation, not a security barrier: the Git history still
contains the evidence. Record if the verifier inspects history or excluded files;
do not claim it was hermetically isolated. This preparation adjustment is retained
as part of the experimental context.

See [verifier-handoff.md](verifier-handoff.md) for the proposed prompt and
[verifier-audit.md](verifier-audit.md) for observed results. The user confirmed the exact one-prompt exchange, supplied the final reply and
diff display, and identified the model as Astra. Internal tool traces were not exported.
Source repair and unchanged tests were independently verified, with 18/18 passing.

## Final repaired run: pending push

Repair commit: `f69d513d93d551eaee2c4b107e08c6a36833ba76`. No final repaired CI URL
is available yet. Push the repair/evidence commits through GitHub Desktop and
verify the resulting completed workflow. Existing green/red URLs above remain valid.
