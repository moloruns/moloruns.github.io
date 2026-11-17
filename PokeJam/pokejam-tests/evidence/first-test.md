# First-test provenance and execution

AI-generated factual evidence, November 16, 2026; not the student's reflection.

The student chose the behavior in this prompt:

> have my first test be: a Pokémon query only includes eligible NBA players.

The student subsequently authorized AI implementation with this clarification:

> see i don't know how to do that, but the instruction really meant writing the test as in stating whta it would be (coding is optional)

Codex wrote the fixture and assertions following that clarification. The test is
student-specified and AI-coded. On November 17 the student clarified that the
manual-coding requirement applies to CS students, while they are in the statistics
track, where stating the test behavior is sufficient. Proceed using that clarified
course-track requirement; no instructor confirmation is pending. Preserve the
factual student-specified / AI-coded attribution in the account of the work.

The first test passes four NBA records to `candidatesFor`: two eligible, one
ineligible and one with no eligibility flag. It checks the exact returned slugs
in order, preservation of record identity, and unchanged input. Conflicting
overall ratings establish that eligibility follows `match_pool`, as the app
currently does, rather than recomputing a rating threshold.

Before adding other tests, the agent ran this one test, negated the source filter,
ran it again, restored the original bytes, and reran it. All commands used Node
`v26.13.1`, from `PokeJam/`:

```sh
node --test --test-reporter=tap tests/catalog_logic.test.js
```

| Run | Result | Actual output |
| --- | --- | --- |
| Original source | 1 test passed, exit 0 | [passing log](logs/first-test-passing.txt) |
| Filter negated | 1 test failed, exit 1 | [failure log](logs/first-test-deliberate-failure.txt) |
| Source restored | 1 test passed, exit 0 | [restored log](logs/first-test-restored.txt) |

The failure reported `ERR_ASSERTION`: actual slugs were `ineligible` and
`missing-flag`; expected slugs were `eligible-first` and `eligible-second`.
The student did not personally execute this demonstration; Codex did.

The full suite then grew to 18 passing tests. Its separate tests-only commit is
`1cc73ed43673da41965f2220391e5e832970f1e1`; it changes only
`PokeJam/tests/catalog_logic.test.js` and `PokeJam/tests/match.test.js`.
No assertion changes were needed during the five subsequent mutation experiments.
