# V2 validation record

Development version: `2.0.0-dev.0`. Validated September 14, 2026.

- TypeScript build: passed.
- Full suite with `npm test -- --no-file-parallelism`: **1,169 tests passed in 45 files**.
- V2 coverage: **125 tests** across composition, budgets, evidence identity, adapters, finite decision value, conflicts, candidate admission, calibration, optional subprocess execution and iterative orchestration. This includes regressions for trusted render policy, third-party class receivers, immutable compiled runners and budget-unit preflight before spending.
- Legacy collector coverage: **104 metric tests**, plus seven actual subprocess checks covering missing scripts, real TypeScript clean/error results, and real ESLint clean/lint-error/parse-error/config-failure results. Failed collection cannot produce a clean measurement; optional missing legacy ceiling metrics remain a documented limitation.
- ESLint on v2 source/tests and changed legacy metrics source/tests: no errors; four non-null-assertion warnings (one source, three tests).
- Synthetic communication composition: three assertions passed, three evaluation units spent.
- External Isogloss 0.5.0 adapter: a separate consumer imported the host's root `v2` export and the real adapter from the Isogloss repository. Passing, failing and missing-input cases returned pass, fail and unavailable respectively; each accounted for one evaluation unit. No model API calls and no Isogloss API or implementation bundled in core. The external adapter's own build, typecheck and 114 tests in eight files passed; see [its draft integration](https://github.com/andrew-templeton/isogloss/pull/1).
- Documented calibration examples, including the local interactive A/B game, executed successfully.
- Package dry-run: new CLI, compiled library, guides and example are included; dependency folders are excluded.
- Documentation links and whitespace checks: passed.

## Pre-existing parallel-test race

The default parallel full-suite run encountered a shared temporary-directory race between `tests/experiments/logger.test.ts` and `tests/experiments/docker/scaffold.test.ts`. Both delete `.test-experiments`. The race was reproduced on untouched baseline commit `95b3a41`: the two files produced filesystem errors in parallel and passed all 47 tests when serialized. The logger alone also passed all 19 tests. V2 does not change those files.

The serial full-suite result verifies the implementation while avoiding that known race. It does not claim the default parallel test command is reliable.

## What these checks establish

The tests exercise deterministic control logic, conditional arithmetic, stated statistical calculations, process bounds and data contracts. Render adapters consume explicitly supplied reports; their synthetic fixtures do not verify a real application's pixels. Isogloss integration validates the adapter, not a new psychometric claim. Subprocess tests use local test programs, not paid coding-agent runs. No real operator-preference study or new semantic-verifier qualification was performed for this release.

The [consumer API review](API-REVIEW.md) records what can be retained and the remaining requirements before a stable API: general implementation/configuration identity, executable typed input bindings and durable checkpoint/resume. Passing this validation record does not close those design requirements.
