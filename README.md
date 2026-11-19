# PokeJam — HW9: Tests as Guardrails

This branch contains PokeJam (Project 2) and its HW9 testing submission.

- [Project README and local preview instructions](PokeJam/README.md)
- [Testing report](PokeJam/TESTING.md)
- [Prompt log](PokeJam/pokejam-tests/prompt_log.md)
- [Mutation evidence](PokeJam/pokejam-tests/evidence/mutations.md)
- [CI runs](PokeJam/pokejam-tests/evidence/ci-runs.md)
- [Independent verifier audit](PokeJam/pokejam-tests/evidence/verifier-audit.md)
- [GitHub Actions workflow](.github/workflows/tests.yml)

Run the logic suite with Node 26 from the repository root:

```sh
cd PokeJam
node --test tests/*.test.js
```

The other projects remain on the repository's `main` branch. Keep this
submission on `pokejam-tests`; merging its cleanup into `main` would also
remove those projects there.
