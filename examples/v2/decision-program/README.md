# Finite decision and calibration program

Run actual strict-protocol evaluators over a fixed population, enumerate every one-assessment decision policy independently, and execute bounded repair loops.

```sh
npm run build
node examples/v2/decision-program/program.mjs /tmp/new-finite-decision-run
node examples/v2/decision-program/verify-record.mjs /tmp/new-finite-decision-run
```

Use a new output directory. The CLI writes the full protocol, population, evaluator identities and runtime manifest to `registration.json` before dispatch. It then writes every census observation, the selected-policy executions, the finite response tables, conflict traces and loop accounting. The local registration is an integrity record, not an independently authenticated preregistration timestamp.

The checked-in [evidence](./evidence/report.json) describes the exact 224 registered integer records: 32 acceptable and 192 unacceptable. The arithmetic reference is a BigInt equality; the executed verifier uses the JavaScript finite integer predicate. The approximate comparator deliberately retains its 44 false accepts and 12 false rejects. The configured outage comparator retains one missing case, 56 unavailable returns and one thrown attempt. No label is revised after seeing its verdict.

The records are a reused, constructed **complete census**, with no people, sampled population, model judges or paid API calls. The reported exact fractions apply only to those records and evaluator identities. A scanner's substantive claim on other inputs, actual readers, a communication workflow or a composed gate needs its own evidence.

See [design, APIs, results and interpretation](../../../docs/v2/DECISION-PROGRAM.md). The source-based mechanical checks are:

```sh
npx vitest run tests/v2/finite-calibration.test.ts tests/v2/nudge-trace.test.ts tests/v2/decision-program.test.ts
```

Tests guard protocol and arithmetic mechanics. The separate executable record documents the actual bounded runs; neither is human comprehension evidence.
