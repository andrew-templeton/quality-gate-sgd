# V2 consumer API review

Reviewed September 14, 2026, for development version `2.0.0-dev.0`; repository ownership updated for `2.0.0-dev.1`. The `2.0.0-dev.2` follow-up implements the identity/input and local durability contracts described below; independent module conformance and the combined stability review remain pending.

## Verdict

Keep the compositional engine in this repository and continue publishing it as a development API. The basic separation between assertions, evidence, composition, budgets and candidate admission is useful. The contract is not yet ready to freeze as a stable API for independently maintained verifiers.

This review considered actual consumer behavior, including a class-based assertion, changed evaluator configuration, a render-policy change and a legacy collector with a missing command. Passing the existing test suite does not establish plugin interoperability or the validity of a quality judgment. The age of the model that helped write a component is also not evidence for or against its correctness.

[Isogloss](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) is an external module example. Its implementation and integration belong in that repository. Its adapter has focused tests and was exercised against the built host in a separate consumer smoke check. That integration exercises the module boundary, not a new claim about reader comprehension or semantic fidelity.

## Retain, harden or replace

| Component | Assessment | Boundary to preserve or work required |
| --- | --- | --- |
| Required/advisory composition and prerequisite closure | Retain | Every required predicate and prerequisite must pass. Advisory results cannot compensate for a failure. Prerequisites currently control ordering and eligibility; they do not transfer typed intermediate outputs. |
| Assertion cards and composed cards | Retain, strengthen identity | Explicit claims, assumptions, guarantees, excluded conclusions and scope are valuable. A card is a declaration, not independent authentication of its evidence. |
| Unavailable evidence and observation validation | Retain | Missing, malformed, stale or timed-out evidence must remain distinct from a measured pass or failure. |
| Multi-unit budget ledger | Retain, add persistence | Reserve before work, preserve known expenditure and keep units separate. Process-local accounting is insufficient for resumable paid runs. |
| Candidate admission and oscillation controls | Retain | Deadbands, cooldowns, cycle checks and required nonregression provide useful controls. They do not prove convergence or the validity of the objectives. |
| Nudge conflict handling | Retain as conservative partial planning | Footprints and effect hypotheses expose conflicts. Conditional interval dominance is not global causal optimization. |
| Decision-value calculation | Retain within its stated scope | One-assessment expected value is conditional on supplied priors, likelihoods and utilities. Information gain and decision value remain separate. |
| Preference and verifier calibration utilities | Retain with their assumptions | Preference improvement does not establish correctness. Known-label error bounds require suitable labels, sampling, scope and evidence-use discipline. |
| Optional remediation | Retain | A suggested prompt or registered harness cannot enable itself. A generated candidate still needs complete-gate evaluation and admission. |
| Render report adapter | Hardened; regression tests pass | Required views and caps must be trusted configuration, not requirements chosen by the candidate being assessed. The adapter still consumes measurements rather than collecting browser evidence. |
| External assertion runners | Hardened; regression tests pass | Compilation preserves a valid runner's receiver and prevents replacement of the compiled runner. Standard configuration identity is implemented in dev.2; independently declared code provenance remains a producer obligation. |
| Schema and capability discovery | Needs executable input bindings | Matching declared strings identifies candidates for integration; it does not validate actual payloads or establish semantic compatibility. |
| Legacy metric collectors and rules | Collector failures hardened; not qualified for v2 reuse | Failed TypeScript/ESLint collection now throws instead of reporting a clean measurement. Missing ceiling metrics remain optional in the legacy rules engine. A zero issue count is meaningful only after successful, complete collection. |

## Concrete findings and disposition

The source links below identify the relevant API boundaries. Findings describe the reviewed behavior before the current hardening changes.

| Priority | Reproduced behavior or implementation finding | Disposition |
| --- | --- | --- |
| P1 | The render report supplied both measurements and `maxTotal`, `maxNovel` and `requiredViews`. Increasing only `maxTotal` from 1 to 2 changed a failing candidate to a pass under the same contract digest. Displayed content and screenshot were unchanged; admission reported a repaired defect. See [render module](../../src/v2/modules.ts) and [admission](../../src/v2/admission.ts). | Addressed in the current revision by trusted render policy and policy-bound contract identity; regression tests pass. A changed policy must require recompilation and rebaselining. |
| P1 | The legacy TypeScript collector reported zero errors for a package with no `type-check` script because it counted matching output without requiring successful execution. A zero-error ceiling then passed. Missing ceiling metrics were skipped. ESLint could interpret empty stdout as an empty report despite unsuccessful execution. See [external collectors](https://github.com/andrew-templeton/quality-sgd-software/blob/main/src/metrics.ts) and [external legacy rules](https://github.com/andrew-templeton/quality-sgd-software/blob/main/src/rules.ts). | TypeScript/ESLint collection failures now throw and malformed or empty ESLint reports are rejected; regression tests and actual subprocess checks pass. Valid diagnostic results retain their metric shapes. Optional missing ceiling metrics remain a legacy compatibility limitation. A v2 adapter must independently establish successful, valid, scoped and complete collection and return unavailable otherwise. |
| P2 | A class implementing `Assertion` could read instance configuration when called directly, but compilation copied its method without its receiver. The compiled assertion became unavailable and its failed reservation quarantined further spending. See [compilation](../../src/v2/catalog.ts). | Addressed in the current revision by preserving the receiver and freezing compiled runner objects; regression tests pass. Binding a receiver does not by itself freeze mutable instance configuration. |
| P2 | Changing configuration captured by an evaluator changed the same input from fail to pass with identical input and contract digests. See [contracts](../../src/v2/types.ts), [compilation](../../src/v2/catalog.ts) and [evaluation identity](../../src/v2/evaluate.ts). | Addressed by the explicit standard descriptor, frozen configuration and qualification digest checks in dev.2; see [contracts](CONTRACTS.md). |
| P2 | Undeclared budget units were checked at each dispatch. A later assertion could throw after earlier checks had already consumed resources. See [evaluation](../../src/v2/evaluate.ts) and [budget ledger](../../src/v2/budget.ts). | Addressed in the current revision by preflighting assertion budget units before dispatch; regression tests pass. Actual resource consumption still depends on runner/provider metering. |
| P2 | Schema/capability strings were used for discovery, while every evaluator received `unknown` and implemented its own parsing. See [input contracts](../../src/v2/types.ts) and [discovery](../../src/v2/catalog.ts). | Implemented in dev.2 with one shared executable binding for declaration compatibility and typed runtime preflight; see [contracts](CONTRACTS.md). |
| P2 | Ledger snapshots omitted reservation identities; the ledger had no restore contract. The loop always created fresh admission history and accumulated events until return. See [ledger](../../src/v2/budget.ts) and [loop](../../src/v2/loop.ts). | Implemented for a local POSIX single writer with direct process-crash tests; see [durable execution](DURABLE-EXECUTION.md). |

## Legacy collector behavior change

`extractTypescriptMetrics` and `extractEslintMetrics` keep their successful return types but now throw on failed or incomplete collection. This includes missing commands, process errors/timeouts, unparseable lint output and lint reports assessing no files. Normal TypeScript diagnostics and valid ESLint exit-1 reports remain measurements. When root causes cannot be attributed completely, `rootCauses` is undefined instead of an unjustified zero.

The external software package owns these APIs. Its CLI exits nonzero on collection errors; its MCP handlers report an error. Direct API callers must handle the exception. Configure an actual `npm run type-check` command and an ESLint setup that produces reports for the intended source scope. A successful shell command alone still does not prove that the intended files were analyzed. Legacy ceiling rules continue to skip absent metrics, so they cannot establish the v2 required-evidence guarantee.

## Acceptance criteria before stabilizing the contract

### 1. Explicit implementation and configuration identity

Provide a standard descriptor for the assertion protocol version, verifier implementation/build identity and immutable semantic configuration. Define which environment inputs belong to applicability and which belong to artifact evidence. Calibration must name the complete evaluator/configuration identity and applicable scope, rather than depend on an ambiguous version label alone.

Acceptance requires:

- An independently maintained module can declare its implementation and configuration without encoding undocumented conventions into an arbitrary version string.
- Changing a rubric, threshold, audience configuration, relevant prompt/model setting or implementation changes the contract identity and prevents comparison with an older baseline until explicitly rebaselined.
- Mutating the caller's original configuration after compilation cannot silently alter the compiled assertion's declared behavior. Tests cover nested configuration and instance-based runners.
- Reordering irrelevant metadata does not change identity; a relevant configuration change does. The distinction is documented.
- Qualification and its scope are invalidated or explicitly reassessed after a relevant identity change. Digests are described as integrity bindings, not proof of honest provenance or immutable executable behavior.

### 2. Executable typed input bindings

Provide a versioned input contract with runtime validation and a typed value delivered to the evaluator. Document whether multiple schema declarations represent required inputs or alternatives. Keep schema validation separate from evidence completeness, freshness and domain assumptions.

Acceptance requires:

- A module author can implement the contract against the published package without importing internal source paths or casting the shared artifact payload throughout the evaluator.
- Missing inputs, incompatible schema versions, absent capabilities and malformed payloads are detected before the dependent evaluator dispatches paid work. The result explains the incompatibility and cannot become a pass.
- A valid payload reaches the evaluator in the declared type. An invalid payload produces a defined unavailable/preflight result, not an accidental exception whose semantics vary by module.
- Discovery uses the same contract as execution and clearly distinguishes declared compatibility from validated applicability.
- An independent external module and a host composition exercise valid, invalid, version-mismatched and prerequisite-blocked cases. No domain-specific dependency is required in the core.

### 3. Durable run checkpoint and resume

Define a versioned checkpoint containing the compiled contract identity, current admitted artifact/evaluation, admission history, attempted candidates, round counters, spending, outstanding reservations and event sequence. Expose a persistence boundary before external work is dispatched and after its outcome is recorded.

Acceptance requires:

- Interrupting and restoring a run preserves consumed budget, accepted revisions, reversal cooldowns, cycle detection and stall history. Restarting cannot obtain a fresh budget or erase an earlier rejection history implicitly.
- Outstanding reservations retain stable identities. Unknown external outcomes remain reserved or conservatively charged until reconciled; a crash cannot silently refund them or trigger an untracked duplicate repair.
- Restoration validates checkpoint version, integrity, contract/environment compatibility and chronological consistency. A changed contract requires explicit rebaselining while retaining the accounting history.
- Resume behavior is tested at reservation, dispatch, settlement, candidate evaluation and admission boundaries. Idempotency and the limits of external cancellation are documented.
- The API states whether it supports a single process, a single durable writer or concurrent workers. No distributed transaction guarantee is implied without an implementation that provides it.

## Evidence needed beyond API tests

These acceptance criteria concern control and interoperability. Each substantive verifier still needs evidence appropriate to its claim, intended population and failure costs. A host integration test can establish that an external module composes and reports correctly; it cannot establish that its quality judgment is reliable enough for a particular application.

Keep the development label until the remaining contract work is complete. Record implementation verification in [VALIDATION.md](VALIDATION.md), and record verifier-specific empirical evidence in the corresponding module's card and repository.

The current repository ownership and consumer changes are recorded in [MIGRATION.md](MIGRATION.md). The [directed work graph](../work/README.md) connects the remaining acceptance criteria to external-module checks and the stable-release milestone.
