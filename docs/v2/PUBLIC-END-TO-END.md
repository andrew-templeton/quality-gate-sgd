# Reproducible public end-to-end run

The [installed-package runner](../../examples/v2/public-end-to-end/README.md) exercises the reusable engine and all three external example modules from supplied tarballs in a fresh consumer. A successful run verifies the registered expected outcomes and preserves separate scopes in a machine-readable report. Human alignment and composition utility remain unverified until real responses are collected under an appropriate protocol.

## Execution and evidence

The bootstrap copies and hashes each supplied tarball, installs with `--ignore-scripts`, verifies that installed packages are materialized rather than checkout links, and records package versions/repository URLs and the full npm lock digest. Playwright, ESLint and TypeScript are explicit demonstration dependencies pinned to 1.63.0, 9.39.2 and 5.9.3. Chromium installation is an explicit command. No npm publication, site deployment, model service or live Sonar server is required by the run.

All existing fixture code comes from the installed core tarball; the independently distributable orchestration helpers are copied from the adjacent public bundle with their own file hashes. Runtime core imports use `quality-gate-sgd`; external imports use `isogloss/quality-sgd`, `quality-sgd-software`, and `quality-sgd-sonarqube`. Installed implementation files are read only to record/verify their identities. The finite program's development-only loader is never invoked.

| Stage | Actual work | Established scope |
|---|---|---|
| Discovery/configuration | Propose compositions, validate runtime inputs, run Isogloss and software examples, exercise a schema-version mismatch | Protocol interoperability and explicit required/advisory policy on synthetic workflows |
| Repair validation | Actual ESLint; controlled superficial and faithful subprocess patches; four independent behavior cases | The superficial lint fix is rejected for a required behavior regression; the faithful fix is accepted |
| Durable software repair | Actual TypeScript collections, fixed patch subprocess and receipt, real SIGKILL, fresh-process resume and completed replay | Persisted outcome reuses its reservation and is settled once; required postrepair checks run; known spending survives interruption |
| Sonar | Verify packaged historical signatures; execute fail/pass originals and tampered-unavailable local evaluations | Historical evidence integrity relative to the supplied package's key; no new analysis or current source verification |
| Finite decision program | Execute 224 constructed records, registered faults, decision enumeration, interventions and bounded loops; replay the saved records | Exact observed errors, missingness, costs and policy behavior on the reused finite census |
| Rendered composition | Actual Chromium, six states per candidate, authored source/arithmetic assertions, typed conjunctive scope and admission | Improved fixture accepted; hidden-cost, removed-downside, filler and tiny-text candidates rejected under the same declared contract |

The conjunction includes required fidelity/arithmetic, surface inventory/geometry, total and novel budgets, and shared provenance. Isogloss remains an independently installed advisory text facet. Its text approximation does not establish rendered geometry or reader understanding. The business-case fixture retains value, material cost/condition, unfavorable scenario and next action while disclosing supporting calculations.

## Exact durable interruption

The baseline JavaScript function charges `amount + 20` but contains an invalid unused type annotation. The installed software module captures real complete TypeScript diagnostics. A separate required assertion executes the fixture for amounts 0, 100, 200 and 10,000 in a bounded Node subprocess. These four cases pass before repair.

The only allowed patch removes the invalid declaration. Its subprocess verifies the expected source digest, writes the candidate in an isolated directory and fsyncs an external receipt with the stable operation ID. The parent's `DurableRun` persists the complete repaired artifact and outcome; its `operation:outcome` hook then causes an actual SIGKILL before cost settlement. At interruption, the repair reservation remains outstanding and the durable operation contains the completed outcome. Reopening explicitly recovers the dead local writer and reuses that outcome without a second repair invocation.

Resume runs both the external TypeScript assertion and the independent behavior assertion, even though the nudge names only the TypeScript remediation target. The final gate passes after one round. A second resume of the completed run changes neither receipts, journal state nor spending.

| Unit | Spent at interruption | Final spent |
|---|---:|---:|
| Source collections | 1 | 2 |
| Assertion evaluations | 2 | 4 |
| Behavior subprocesses | 1 | 2 |
| Proposals | 1 | 1 |
| Repair subprocesses | 0 | 1 |

The candidate's collection and repair have physically happened at interruption but remain covered by the outstanding `{collections: 1, repairProcesses: 1}` reservation until their persisted outcome is settled. They are not refunded or silently repeated. One external repair receipt and one dispatch/outcome event pair remain after both resumes. The wider [durable execution suite](DURABLE-EXECUTION.md) covers the remaining crash phases, collision/unknown-result cases and reconciliation. This integration case uses the documented local single-writer filesystem model.

## Cost and qualification boundaries

The report preserves stage-specific units instead of inventing a currency conversion. The rendered conjunction records 60 evaluations and six render collections. The finite program records 1,589 assessment steps, eight proposal steps and five repair steps. Controlled repair and durable integration each report their own actual operation units. Tool installation and command wall times are recorded separately; no model tokens, paid API cost, machine purchase cost or power usage is inferred.

Finite verifier outcomes are exact for the constructed population and declared reference labels. Reused census cases do not establish prospective or unseen-population error bounds. Utility consequences and conversions are operator assumptions. Historical Sonar signatures do not provide current server/source freshness. Fixture repair results do not estimate model repair effectiveness or whole-program correctness. Browser touch input is emulation, and authored source annotations do not replace independent semantic extraction.

`report.scopes.humanCalibration` and `report.scopes.compositionUtility` both retain `status: "unverified"` and `realBallots: 0`. A successful software integration run never converts those unresolved empirical questions into a green aggregate score.

The [recorded public run](../../examples/v2/public-end-to-end/evidence.json) used core `2.0.0-dev.3`, Isogloss `0.6.0-dev.0`, software `0.1.0-dev.2` and Sonar `0.2.0-dev.0`. Its tarball/source hashes, exact commands, separate costs and expected outcomes are retained. The adjacent `record.mjs` provides a read-only integrity/outcome audit of a complete generated run. Hashes provide local integrity rather than independent execution or timestamp authentication.
