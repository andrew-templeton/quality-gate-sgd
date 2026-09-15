# A communication gate for a particular reader and decision

`defineCommunicationContract` registers audience background, decision experience, known/unfamiliar concepts, the decision to make, required source commitments and essential entry elements. It binds the full source reference, semantic-evidence mode, surface policy and collector identity. Audience knowledge must agree with the surface policy; every concept needs an explicit familiarity declaration, every required source ID must exist, and every entry state must retain the specified entry elements.

`communicationScopeModule` then consumes five typed passing prerequisite outputs: source preservation plus surface inventory, geometry, total-quanta and novel-quanta predicates. It verifies that their source, candidate, render, collector and policy identities match the registered contract. Its output is an addressed receipt that downstream modules can require. Missing or failed prerequisites block it; mismatched identities remain unavailable. Changing the audience or decision contract changes the evaluator identity.

```js
const contract = defineCommunicationContract({
  audience, task, source, fidelityMode: 'structured-only', surfacePolicy,
});
const scope = communicationScopeModule(contract);
const gate = compileGate(
  [sourceModule, surfaceModule, scope, externallyConfiguredLanguageFacet],
  [scope.id, externallyConfiguredLanguageFacet.id],
  { required: ['communication.scope'], advisory: ['isogloss.text-folds'] },
);
```

Configure `sourceCommitmentsModule` with the same source and semantic mode, and `surfaceEvidenceModule` with the registered policy. The selected source/surface modules retain their full prerequisite contracts and guarantees. Supply `COMMUNICATION_INPUT` alongside their input declarations, and set `artifact.data.communication.contractDigest` to `digest(contract)`. The [complete rendered example](../../examples/v2/rendered/composition.mjs) defines all these values and uses the separately installed Isogloss public module.

The scope assertion performs only a deterministic identity/conjunction check and has no additional declared resource charge. Collecting renders, evaluating its prerequisites, collecting reader responses and producing candidates have their own budgets. A passing scope receipt cannot average away a required failure or authorize a remediation harness.

## Executed business-reader example

The audience is **business decision-makers unfamiliar with technical jargon**. The invented decision concerns requesting a two-week pilot review for ten stores: expected annual savings of $120,000, all-in annual cost of $40,000 and expected annual net benefit of $80,000. Rollout depends on a successful product-record matching pilot. A downside with $30,000 annual savings yields a $10,000 annual loss.

The fixed surface policy permits seven total elements in closed states, nine in open states and two novel concepts per state. These are provisional design budgets selected before candidate evaluation. The main view retains benefit, cost, the pilot condition, downside and action; the labeled disclosure holds supporting calculations and explanations. Six required states cover desktop/mobile dimensions, keyboard/browser-emulated touch, closed/open disclosures and independent entry into the open state. [Surface evidence](SURFACES.md) defines the supported geometry and scroll model.

The full conjunction was actually executed on six rendered variants under the same source, audience, task, policy and environment:

| Candidate | Full gate | Admission against baseline |
| --- | --- | --- |
| Overloaded baseline | Fail | Reference |
| Progressive disclosure | Pass | Accepted; required defect repaired without regression |
| Hidden material cost | Fail | Rejected; source commitment regressed |
| Removed main downside | Fail | Rejected; source commitment regressed |
| Added unreviewed filler | Fail | Rejected; rendered geometry/inventory coverage regressed |
| Shrunken text | Fail | Rejected; readable geometry regressed |

The addressed nudge changes the calculation disclosure, rather than removing business facts. The improved result retains all twelve reviewed surface elements across its supported states. Its downstream scope output contains five host-generated dependency receipt digests. The Isogloss facet remains an advisory text proxy over the complete text; its lexical diagnostic cannot establish whether the rendered layout improved.

The [recorded composition](../../examples/v2/rendered/communication-evidence.json) preserves the exact contract, component cards, source annotations, measurements, comparisons, rejection reasons and spending: six render-collection invocations and sixty assertion evaluations. Each capture helper performs four surface checks, and each full gate performs six charged checks plus the uncharged scope handoff. The counterexample candidates are independently compared with the same baseline; this is not a global search or an estimated best layout.

To rerun, install the optional rendered example's Playwright dependency, the current core and the external Isogloss package, then run `node composition.mjs /path/to/new-artifacts` in `examples/v2/rendered`. Its public package imports also work in an independently installed consumer; the end-to-end guide records that workflow. The optional `QUALITY_SGD_ISOGLOSS_ENTRY` path supports a separately built public adapter during development only.

## What remains unverified

The source annotations and the mapping from reviewed rendered IDs to those annotations are authored fixture data. The source module checks their equality and declared arithmetic; it does not perform independent semantic extraction. Its all-in-cost example has one supplied package total including support, not an independently audited cost breakdown. The receipt guard establishes agreement among the declared producers, not semantic alignment of arbitrary unreviewed source documents and visual elements.

`structured-only` can pass when prose contradicts matching annotations; the dedicated test preserves this limitation. `qualified-prose` additionally requires an accepted external semantic receipt under its exact source, candidate, rubric and scope. Test receipts do not qualify a real judge. Actual browser text is checked against the separately configured reviewed inventory in this example, which is a narrower claim than general prose fidelity.

There are **zero real reader responses** in this evidence. Human comprehension, preference, decision utility and understood information density remain unverified. The staged reader study must measure those outcomes under an explicit comparison protocol. Neither a passing rendered count nor the finite arithmetic calibration supplies that evidence.
