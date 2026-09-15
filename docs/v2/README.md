# Quality-SGD v2: composable assertion modules

An operator needs a result that satisfies a particular set of requirements. V2 makes those requirements inspectable modules, composes them into a gate, accounts for evaluation and repair costs, and admits edits only when the selected evidence supports them.

This is development version `2.0.0-dev.1`. The generic library is exported directly and as `v2`, with the `quality-gate-v2` CLI. The legacy software root API and `quality-gate` CLI now belong to [quality-sgd-software](https://github.com/andrew-templeton/quality-sgd-software); see the [migration guide](MIGRATION.md). Core has no runtime package dependency or automatic publishing step.

```sh
npm ci
npm run build
npm run test:v2
node dist/v2/cli.js zoo
node dist/v2/cli.js card examples/v2/communication.mjs
node dist/v2/cli.js run examples/v2/communication.mjs
node dist/v2/cli.js discover examples/v2/communication.mjs legibility
```

The example is a **synthetic engine integration fixture**. Its supplied render report is not a real browser capture. Passing it checks composition and accounting, not real-world visual quality.

## Repository and module ownership

Quality-SGD owns the shared assertion contracts, composition, budgets, calibration primitives and candidate admission policy. Verifier implementations and their domain-specific integrations can be maintained and versioned independently. Their module cards describe the exact implementation version, input contract, guarantees and evidence that a composition relies on.

[Isogloss](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) is the default external module example. Its implementation and Quality-SGD integration belong in the Isogloss repository. The core does not bundle Isogloss, install it automatically or expose an Isogloss-specific API. A caller supplies external modules through the same `AssertionModule` contract as any other verifier. The linked integration is currently an [Isogloss draft PR](https://github.com/andrew-templeton/isogloss/pull/1); pin a reviewed commit when consuming it.

## A module is one facet, not the whole objective

A communication gate might include source fidelity, numerical correctness, reader-specific language, rendered geometry, and comprehension. An external Isogloss module can contribute a language/legibility facet within that composition. A text-fold counter does not replace the other assertions.

Likewise, a SonarQube report contributes evidence about listed code issues. A successful scan is not proof of semantic correctness. A module's card states the precise predicate, assumptions, unsupported conclusions, scope, input contracts, prerequisites, cost bounds, evaluator qualification and optional remedy.

The taxonomy is hierarchical and extensible by adding subpaths under these families:

| Family | Example question | Limit of a positive result |
| --- | --- | --- |
| Structure / syntax | Does the input parse or type-check? | Does not establish the intended behavior. |
| Structure / references | Do IDs and dependency revisions resolve? | Does not authenticate the underlying evidence. |
| Measurement / arithmetic | Do scoped quantities and denominators reconcile? | Does not make estimates measured or causal. |
| Measurement / regression | Did the observed checks pass? | Covers the executed population and tool scope. |
| Meaning / fidelity | Were source commitments preserved? | A judge needs its own reliability evidence. |
| Communication / legibility | Can this reader interpret the material within the budget? | Lexical counts alone cannot establish comprehension. |
| Communication / geometry | Is the content visible and operable in these states? | Covers supplied measured views, not every possible device. |
| Causality / identification | Are the required causal assumptions supported? | Checking an assumption declaration is not identifying an effect. |
| Decision / utility | Which assessment changes the best action enough to pay for itself? | Conditional on supplied states, priors, likelihoods and utility. |
| Control / reliability | Is this evidence current and reliable enough to authorize an update? | Requires an appropriate population and calibration protocol. |

These are kinds of assertions, not a ranking of proof strength. The executable report adapter in this repository covers rendered geometry/fold reports. [SonarQube assertions](https://github.com/andrew-templeton/quality-sgd-sonarqube) are maintained externally. Other families are extension points; their existence in the taxonomy does not imply a shipped validated verifier.

## Composition and discoverability

An `AssertionModule` has an ID, version, included module IDs, and assertions. `compileGate` resolves nested includes and assertion prerequisites, detects cycles/missing references/duplicate IDs, and produces a versioned contract. Diamond inclusion evaluates shared prerequisites once. The explicit policy identifies required and advisory assertions.

```js
import { v2 } from 'quality-gate-sgd';

const gate = v2.compileGate(modules, ['communication'], {
  required: ['source.fidelity', 'render.geometry', 'render.fold-budget'],
  advisory: ['reader.language'],
});
const card = v2.modelCard(gate);
const result = await v2.evaluateGate(gate, {
  artifact: { id: 'proposal', digest: contentAndDependencyDigest, data },
  environmentDigest: sourceAudienceViewportAndPolicyDigest,
}, new v2.BudgetLedger({ evaluations: 20, tokens: 100_000 }));
```

The referenced IDs must exist in the supplied modules. `source.fidelity` and `reader.language` above illustrate caller-provided verifiers. The engine supplies neither a built-in semantic guarantee nor a language verifier under those IDs.

`discoverAssertions` matches declared input schema IDs and capabilities and supports a local text query. It reports missing inputs explicitly. A signature match identifies a candidate module; the runner still has to validate the actual data, assumptions and scope. A card's fixed output contract is `Observation`: status, addressed findings, evidence, optional loss bounds with units, and actual cost.

The transport-neutral `RESOURCES` and `readResource` exports describe `quality://v2/assertion-zoo` for assertion-family context and card semantics. A caller may register them with its own server. The CLI also exposes the taxonomy through `zoo`; core does not bundle the legacy software MCP server.

## What a conjunctive pass means

Every required assertion and its prerequisite closure must report pass. A failed prerequisite blocks its dependents. Advisory scores cannot compensate for a failed requirement. Unavailable evidence, missing state coverage, timeouts, malformed observations and stale render identities cannot become a pass.

Model-judgment assertions may run as advisory diagnostics while unqualified. Using one in a required gate, including as a prerequisite, requires a qualification record naming the current evaluator version and evidence. This is an enforced metadata boundary, not an independent audit that the cited study was valid. The operator remains responsible for the qualification's population and criteria.

The composed card enumerates selected requirements, dependencies and individual limitations. It does not multiply module confidences, infer independence, or promote a local predicate into a universal quality claim. [Calibration](CALIBRATION.md) provides separate primitives for preference comparisons and verifier error rates.

## Budget and decision policy

`BudgetLedger` reserves upper bounds before dispatch and settles actual costs afterward. Units remain independent: `evaluations`, `tokens`, `usd_micro`, `human_seconds`, or caller-defined units. An undeclared unit is rejected. Prefer integer minor units where exact financial accounting matters.

Failed or malformed work is not refunded. Known expenditure survives malformed reports. Violated bounds or uncertain settlement quarantine further dispatch; the ledger's `exceeded` flag denotes that enforced spending-bound failure, not a claim that every limit was numerically exhausted. Metering is only as trustworthy as the runner/provider. An in-process timeout requests cancellation; it cannot undo external work already performed.

`assessExperiment` computes finite one-assessment expected value of sample information under an explicit model. It reports posterior actions, gross/net decision value, and Shannon information gain separately. A perfectly informative observation can have zero decision value when it never changes the preferred action. `chooseAssessment` preserves ties and returns insufficient-model when no utility model is supplied. It does not learn priors or solve a globally optimal sequence of assessments.

Costs enter this utility calculation only when expressed on the model's declared utility scale. There is no automatic exchange rate between dollars, latency, tokens and reader attention.

## Nudges and oscillation protection

A `Nudge` carries a shared assertion/claim/component address, a read/write footprint, proposed variable changes, predicted effects with their evidence basis, cost bounds, and optional remediation instructions. Prediction labels remain distinct from observed or identified effects.

`planNudges` detects shared writes, read/write dependencies, opposite variable changes, and conflicting predicted assertion effects. Protected regressions are deferred. Strict dominance between comparable **net-benefit** intervals can prefer one conflicting nudge; overlapping intervals or different units remain unresolved. This is conservative partial resolution, not a global optimizer or proof of causal benefit.

`admitCandidate` compares current evidence under the same contract. It rejects required regressions, unavailable comparisons, malformed bounds, stale evidence, repeated accepted artifacts and nonchronological history. Improvement must exceed an explicit per-objective deadband. Reversals require both a cooldown and a larger improvement margin. A hard repair can be accepted as an intermediate step while other existing failures remain; it is not then a fully passing artifact.

These mechanisms prevent several forms of chattering and cycling. They do not guarantee convergence, eliminate every path dependency, or prove that the observed metrics track the real objective.

## Adapters and execution boundary

`renderedLegibilityModule(read, policy, cost?)` consumes a current render report with screenshot identity, addressed geometry defects and total/novel fold inventories. The operator supplies required views/states and their caps separately, as `{ version, views: [{ id, maxTotal, maxNovel }] }`. The factory snapshots that policy and binds it into module and assertion identities. Candidate measurements cannot supply caps or redefine required views. Changing a requirement changes the contract and requires rebaselining.

The adapter checks exact policy-required view coverage and the report's relationships and caps. The caller supplies the browser collector and semantic inventory; this package does not yet detect all overlaps or count concepts automatically. See the [consumer API review](API-REVIEW.md) for remaining interoperability requirements.

For the default external language/legibility example, see [Isogloss](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd). Follow that repository's integration instructions and supply its module alongside the other modules in your composition. An external module must bind its implementation version and relevant configuration into the assertion identity, state its text-proxy limitations, and preserve the engine's evidence and cost contracts.

The external [SonarQube module](https://github.com/andrew-templeton/quality-sgd-sonarqube) consumes an explicitly complete report bound to the current artifact. Its `sonarNudges` API emits per-issue instructions and optional harness metadata. The caller must establish successful collection, fetch all required pages, and bind the report to the artifact revision before declaring it complete. Legacy collectors and ceiling rules are not qualified v2 evidence sources; their compatibility behavior must not be taken as proof of successful, complete collection.

Repair harnesses and the bounded loop are optional library integrations; see [the executable loop and harness examples](REMEDIATION.md). Enabling a named harness is explicit; the default does not execute one. Repair output must be evaluated again before admission. Module configuration files are trusted executable local code, not sandboxed data. No assertion or remediation prompt should be allowed to enlarge its own execution privileges.

## Scope of the development release

The core provides contracts, composition, input discovery, cost accounting, finite assessment value, partial conflict handling, candidate admission, calibration utilities and report adapters. It does not claim an empirically optimal quality policy, a validated universal semantic judge, a browser measurement collector, a learned causal effect model, or automatic deployment of accepted edits.

The design follows the distinction between information and utility in Shannon's [communication theory](https://www.nokia.com/bell-labs/publications-and-media/publications/a-mathematical-theory-of-communication/), the need for assumptions when moving from observation to intervention in Pearl's [causal-inference overview](https://ftp.cs.ucla.edu/pub/stat_ser/SS-2009-57-Sup.pdf), and explicit scope/evaluation reporting in [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993). These sources motivate the reporting discipline; they do not validate this implementation or its domain-specific verifiers.
