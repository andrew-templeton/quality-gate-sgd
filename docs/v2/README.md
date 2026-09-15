# Quality-SGD v2: composable assertion modules

An operator needs a result that satisfies a particular set of requirements. V2 makes those requirements inspectable modules, composes them into a gate, accounts for evaluation and repair costs, and admits edits only when the selected evidence supports them.

This is an opt-in development version (`2.0.0-dev.0`). The existing `quality-gate` CLI and root API remain available. The new library is exported as `v2`, with a separate `quality-gate-v2` CLI. It has no hosted dependency or automatic publishing step.

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

## A module is one facet, not the whole objective

A communication gate might include source fidelity, numerical correctness, reader-specific language, rendered geometry, and comprehension. Isogloss is a useful language/legibility facet within that composition. Its text-fold counter does not replace the other assertions.

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

These are kinds of assertions, not a ranking of proof strength. The initial executable adapters are rendered geometry/fold reports, Isogloss text folds and SonarQube reports. Other families are extension points; their existence in the taxonomy does not imply a shipped validated verifier.

## Composition and discoverability

An `AssertionModule` has an ID, version, included module IDs, and assertions. `compileGate` resolves nested includes and assertion prerequisites, detects cycles/missing references/duplicate IDs, and produces a versioned contract. Diamond inclusion evaluates shared prerequisites once. The explicit policy identifies required and advisory assertions.

```js
import { v2 } from 'quality-gate-sgd';

const gate = v2.compileGate(modules, ['communication'], {
  required: ['source.fidelity', 'render.geometry', 'render.fold-budget'],
  advisory: ['isogloss.text-folds'],
});
const card = v2.modelCard(gate);
const result = await v2.evaluateGate(gate, {
  artifact: { id: 'proposal', digest: contentAndDependencyDigest, data },
  environmentDigest: sourceAudienceViewportAndPolicyDigest,
}, new v2.BudgetLedger({ evaluations: 20, tokens: 100_000 }));
```

The referenced IDs must exist in the supplied modules. `source.fidelity` above illustrates a caller-provided verifier, not a built-in semantic guarantee.

`discoverAssertions` matches declared input schema IDs and capabilities and supports a local text query. It reports missing inputs explicitly. A signature match identifies a candidate module; the runner still has to validate the actual data, assumptions and scope. A card's fixed output contract is `Observation`: status, addressed findings, evidence, optional loss bounds with units, and actual cost.

The existing MCP server exposes `quality://v2/assertion-zoo` for assertion-family context and card semantics. It does not scan the repository, retrieve remote modules, or automatically install code.

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

`renderedLegibilityModule` consumes a current render report with exact required view/state coverage, screenshot identity, addressed geometry defects and total/novel fold inventories. It verifies the report's relationships and caps. The caller supplies the browser collector and semantic inventory; this package does not yet detect all overlaps or count concepts automatically.

`isoglossModule` accepts an injected engine exposing `foldReport`. Configuration and engine version are bound into the assertion version. The adapter uses the real implementation when provided, disables diagram absorption credit, and explicitly reports text-proxy limitations. To run the example with an existing local build:

```sh
ISOGLOSS_MODULE=/absolute/path/to/isogloss/dist/index.js \
ISOGLOSS_VERSION=your-build-version \
node dist/v2/cli.js run examples/v2/communication.mjs
```

`sonarqubeModule` consumes an explicitly complete report bound to the current artifact. `sonarNudges` emits per-issue instructions and optional harness metadata. The report adapter does not silently launch a server scan. Callers can reuse the legacy scan client, fetch all required pages, and bind that result to the artifact revision.

Repair harnesses and the bounded loop are optional library integrations; see [the executable loop and harness examples](REMEDIATION.md). Enabling a named harness is explicit; the default does not execute one. Repair output must be evaluated again before admission. Module configuration files are trusted executable local code, not sandboxed data. No assertion or remediation prompt should be allowed to enlarge its own execution privileges.

## Scope of the development release

The core provides contracts, composition, input discovery, cost accounting, finite assessment value, partial conflict handling, candidate admission, calibration utilities and report adapters. It does not claim an empirically optimal quality policy, a validated universal semantic judge, a browser measurement collector, a learned causal effect model, or automatic deployment of accepted edits.

The design follows the distinction between information and utility in Shannon's [communication theory](https://www.nokia.com/bell-labs/publications-and-media/publications/a-mathematical-theory-of-communication/), the need for assumptions when moving from observation to intervention in Pearl's [causal-inference overview](https://ftp.cs.ucla.edu/pub/stat_ser/SS-2009-57-Sup.pdf), and explicit scope/evaluation reporting in [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993). These sources motivate the reporting discipline; they do not validate this implementation or its domain-specific verifiers.
