# V2 validation record

Development version: `2.0.0-dev.0`. Validated September 14, 2026.

- TypeScript build: passed.
- Full suite with `npm test -- --no-file-parallelism`: **1,127 tests passed in 43 files**.
- V2 coverage: **108 tests** across composition, budgets, evidence identity, adapters, finite decision value, conflicts, candidate admission, calibration, optional subprocess execution and iterative orchestration.
- ESLint on changed source and v2 tests: no errors; three non-null-assertion warnings in tests.
- Synthetic communication composition: three assertions passed, three evaluation units spent.
- Same composition with a real local Isogloss 0.5.0 build: four assertions passed, four evaluation units spent. No model API calls.
- Documented calibration examples, including the local interactive A/B game, executed successfully.
- Package dry-run: new CLI, compiled library, guides and example are included; dependency folders are excluded.
- Documentation links and whitespace checks: passed.

## Pre-existing parallel-test race

The default parallel full-suite run encountered a shared temporary-directory race between `tests/experiments/logger.test.ts` and `tests/experiments/docker/scaffold.test.ts`. Both delete `.test-experiments`. The race was reproduced on untouched baseline commit `95b3a41`: the two files produced filesystem errors in parallel and passed all 47 tests when serialized. The logger alone also passed all 19 tests. V2 does not change those files.

The serial full-suite result verifies the implementation while avoiding that known race. It does not claim the default parallel test command is reliable.

## What these checks establish

The tests exercise deterministic control logic, conditional arithmetic, stated statistical calculations, process bounds and data contracts. Render adapters consume explicitly supplied reports; their synthetic fixtures do not verify a real application's pixels. Isogloss integration validates the adapter, not a new psychometric claim. Subprocess tests use local test programs, not paid coding-agent runs. No real operator-preference study or new semantic-verifier qualification was performed for this release.
