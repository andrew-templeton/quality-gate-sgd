# Reviewable workflow compositions

`proposeWorkflowCompositions` inspects a locally supplied assertion catalog against explicit workflow ports and task requirements. It returns bounded, inspectable compositions using the same input contracts and `compileGate` checks as execution. It does not run evaluators, collect reports, install modules, change calibration or authorize remediation.

## Declare the evaluation boundary

A workflow's `inputs` and `outputs` are application data ports available when quality evaluation begins. Both use `InputContract`: an exact schema name/version, shape, artifact-data path and capability declaration. Application output ports are distinct from assertion-produced evidence outputs and their typed prerequisite handoffs.

```js
import {
  BudgetLedger, compileGate, evaluateGate,
  proposeWorkflowCompositions,
} from 'quality-gate-sgd';

// The caller supplies configured local modules, their bindings, and current data.
const localCatalog = [amountsModule, configuredExternalIsogloss];
const plan = proposeWorkflowCompositions({
  workflow: {
    id: 'decision-communication',
    inputs: [amountsInput],
    outputs: [textInput],
    capabilities: ['audience-lexicon'],
  },
  requirements: [
    {
      id: 'source-arithmetic',
      description: 'Require the stated numerical relationship.',
      mode: 'required',
      select: { assertionIds: ['example.arithmetic'] },
    },
    {
      id: 'reader-language',
      description: 'Inspect an audience-specific lexical facet.',
      mode: 'optional',
      select: {
        assertionIds: ['isogloss.text-folds'],
        family: ['communication', 'legibility'],
      },
    },
  ],
  catalog: localCatalog,
  sample: { artifact, environmentDigest },
  limits: { maxAssignments: 32, maxProposals: 8 },
});

// Inspect a proposal's problems, component context and costs before choosing it.
const chosen = plan.proposals.find(proposal =>
  proposal.status === 'validated-inputs' &&
  proposal.policy.advisory.includes('isogloss.text-folds'));
if (!chosen) throw new Error('The requested composition needs additional work');

// Evaluation is an explicit, separately budgeted operation.
const gate = compileGate(localCatalog, chosen.modules, chosen.policy);
const result = await evaluateGate(gate,
  { artifact, environmentDigest, available: plan.available },
  new BudgetLedger({ evaluations: 2 }));
```

The example assumes the caller's `localCatalog` is the same configured catalog used for planning. The full runnable example defines every module, binding and artifact in [workflow-consumer.mjs](../../examples/v2/workflow-consumer.mjs). Its two-unit budget applies to its two one-unit assertions; use the actual selected composition's costs in other workflows.

`workflowAvailable(workflow)` returns the exact versioned schema keys and capabilities supplied to runtime preflight. Matching schema names and versions alone is insufficient: the planner also checks the module's schema definition and artifact path. A supplied sample goes through `prepareInput`, including normal artifact identity and own-property input selection checks. Without a sample, only declarations can be checked. Even a valid sample does not establish current collection coverage, source authenticity or audience fit.

## Select requirements and inspect alternatives

At least one requirement must be `required`. Each required requirement selects one candidate; an optional requirement selects zero or one. Required predicates form a conjunction. Optional facets become advisory and cannot offset a required failure. Transitive prerequisites appear in execution order, including any unqualified model judgments that prevent required-gate use.

Selectors are explicit:

| Selector | Meaning |
| --- | --- |
| `assertionIds` | Caller-declared alternative assertion identifiers |
| `family` | Prefix of the assertion's declared zoo path |
| `query` | All space-separated words must occur in card metadata |
| `produces` | Exact versioned assertion evidence-output contract |

All supplied selector conditions must match. Family and metadata matches are discovery hints; they do not establish semantic equivalence, utility, optimality or interchangeable guarantees. An unmatched requirement is reported under `unsupportedRequirements`. An unsupported required requirement produces no composition; an unsupported optional requirement can be omitted.

Every matched candidate includes match reasons, missing schemas/capabilities, matching ports, runtime input status, assertion context and qualification restrictions. Each composition includes its required/advisory policy, selected requirements, omitted optional requirements, prerequisite order, component assumptions, typed output handoffs and cost upper bounds. A typed handoff is reported as `contract-compatible-not-executed`: compilation established a compatible producer and consumer, but no evidence has yet been produced or admitted.

| Proposal status | Established |
| --- | --- |
| `declaration-compatible` | Input declarations and compiled prerequisite closure are compatible; no sample was supplied |
| `validated-inputs` | The same checks passed and the supplied sample passed runtime input validation |
| `incomplete` | A compiled composition has missing or invalid inputs, capabilities, bindings or required-gate qualification |
| `invalid` | The selected composition failed `compileGate`, such as a missing prerequisite or incompatible output handoff |

These statuses do not assert that an evaluation will pass. Reports can remain unavailable because of missing or stale observations even when their envelopes have the expected shape. Inspect exact claims, excluded guarantees and current qualification in the included [composition context](./ASSERTION-CONTEXT.md).

## Bound discovery work and evaluation costs

Both positive integer limits are mandatory. `maxAssignments` bounds examined requirement-choice combinations; `maxProposals` bounds returned distinct compiled gates. Enumeration is lazy and deterministic. Equivalent compiled gates are returned once. The returned count, decimal-string total assignment count, `complete` and `truncated` make unfinished enumeration explicit. This ordering is not a preference ranking; a bounded prefix can omit compatible alternatives.

`context.evaluationCostUpperBound` sums each assertion in the compiled closure once, retaining independent units. It covers one evaluation, including selected advisory facets. It does not charge for planning, convert units or reserve money, and it excludes report collection, repairs and repeated rounds. Those operations need their own budgets and authority. Module configuration and calibration remain unchanged throughout planning.

## Installed-package validation

The fixture installs three independently packed packages into an empty temporary consumer and uses only their public exports: `quality-gate-sgd`, `isogloss/quality-sgd` and `quality-sgd-software`. Run it with absolute or relative tarball paths:

```sh
node examples/v2/check-workflow-packages.mjs \
  quality-gate-sgd-2.0.0-dev.2.tgz \
  isogloss-0.6.0-dev.0.tgz \
  quality-sgd-software-0.1.0-dev.1.tgz
```

The verified package artifacts were:

| Package version | Tarball SHA-256 |
| --- | --- |
| `quality-gate-sgd@2.0.0-dev.2` | `68884f3a9262bdb7fd3cb1d7bb2a0fd1f44b2d84d7e4b304e225a137f5c3b346` |
| `isogloss@0.6.0-dev.0` | `1d3db4d574469fe505869bbcf5a23848765159f13b80fc8c99da1546c1304f81` |
| `quality-sgd-software@0.1.0-dev.1` | `2fde599fe467d9fd98cf990a5e254e540eb1e5febfc91d660be73f9cc2c8499a` |

The actual installed run passed a communication composition combining a required arithmetic predicate with optional external Isogloss, then passed a required external software composition using a real TypeScript subprocess and complete evidence report. It also checked a declared schema-version mismatch and that planning had not run an evaluator. The evaluation upper bounds were two and one `evaluations`, respectively. These are synthetic protocol fixtures; they do not qualify human comprehension, general communication quality or semantic program correctness.

`tests/v2/workflows.test.ts` separately covers malformed runtime inputs against actual gate execution, missing schemas and capabilities, shape/path mismatches, bounded and unsupported alternatives, unqualified hard prerequisites, ordered typed handoffs, missing producer closure, immutable configuration and malformed planning declarations.
