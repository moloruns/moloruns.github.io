# HW9 implementation status

AI-generated coordination note, updated November 17, 2026.

- Branch: `pokejam-tests`.
- HEAD / `BROKEN_SHA`: `1f6fc4d9dcffabc694f70c8eb6a30c6b35c4188f`.
- Remote branch currently contains the passing workflow commit `db408e44724aac880f9bea8b05896201ab796d1a`.
- `REFACTOR_SHA`: `4194d3afd5eccf6712d0b2d57e1927f7dfde1c8d`.
- `TESTS_SHA` / `FINAL_TESTS_SHA`: `1cc73ed43673da41965f2220391e5e832970f1e1`.
- Course-track clarification: student is in statistics; per their November 17 clarification, the first test may be specified in words and implemented with AI. No instructor confirmation pending.
- First test is student-specified and AI-coded; [provenance](first-test.md).
- Three computations extracted and used by the app; 18 tests were passing before the deliberate experiment.
- Five mutations were caught and restored individually; [ledger](mutations.md).
- **First passing CI run verified:** https://github.com/moloruns/moloruns.github.io/actions/runs/44138174421
- **Current local state is intentionally failing:** one source mutation recommitted for the red-CI/verifier experiment; 17 tests pass and the eligibility test fails. Tests unchanged.
- User authorized branch pushes. GitHub Desktop published the passing branch; shell Git authentication still unavailable.
- **Next action: Push origin in GitHub Desktop to upload the single prepared commit.** Then record the red CI run. Do not merge into main.
- Fresh-session verifier/transcript/diffs and final repaired CI: not run.
- Browser regression checks remain unavailable: Python Playwright is missing. HTTP checks passed; interactions and rendering are unverified.
- Student-owned `TESTING.md` and prompt log remain pending; existing prompt logs unchanged.
- Plan and evidence remain untracked outside the future verifier checkout. Unrelated `.DS_Store` and `hw8_handoff.zip` retained.

## Run the suite

From the repository root:

```sh
export PATH="/tmp/pokejam-hw9-runtime/node-v26.13.1-darwin-arm64/bin:$PATH"
cd PokeJam
node --test tests/*.test.js
```

The temporary runtime reports `v26.13.1`. At the intentional broken checkpoint,
expect 18 tests, 17 passing and 1 failing, exit 1. See
[red preparation output](logs/red-ci-preparation.txt).

## Remaining work

1. Push the single prepared broken commit through GitHub Desktop; record its actual failing CI URL and named failure. Authorization already granted.
2. Student opens a fresh session in a clean checkout of `BROKEN_SHA` with the simple repair prompt from the plan. Do not provide the evidence or mutation description to that verifier.
3. Capture the transcript and complete source/test diffs; independently verify the repair and compare tests against `FINAL_TESTS_SHA`.
4. Bring back a sound repair, push and save final passing CI evidence. Repeat affected browser checks when available.
5. Student writes the final narrative and maintains the prompt log. Commit evidence after the independent experiment so it cannot reveal the mutation to the verifier.

See [ci-runs.md](ci-runs.md) for run evidence, API access limitations and Pages
observations. The full assignment is not yet complete.
