# Source commitments and business arithmetic

`sourceCommitmentsModule` checks whether a candidate's **structured commitment inventory** preserves a frozen source inventory, its explicit corrections and its declared numeric relationships. It contributes the required assertion `source.commitments` under `meaning / fidelity`. It can be composed with a lexical or rendered-fold facet; a passing complexity facet cannot cancel a required commitment failure.

Build and run the self-contained example:

```sh
npm run build
node examples/v2/commitments.mjs
```

The example passes a faithful record and rejects a shorter record that drops approval, the unfavorable scenario, setup cost and the recommended action. It demonstrates deterministic comparisons over authored records. It does not establish that an extractor produced correct annotations or that a person understood either version.

## The source contract

`SourceCommitmentContract` includes the actual supplied full `content`, its `contentDigest`, a revision digest, contiguous source sections, a coverage declaration, commitments, numeric relationships and explicit corrections. Section offsets are UTF-16 offsets into that exact content. Sections must partition the full supplied text without gaps; declared covered addresses must equal the section set and cite evidence. Partial/unknown coverage, missing evidence or stale content binding returns unavailable.

That partition check detects missing declared sections. It cannot prove the caller supplied every relevant source document, or that an annotation inventory captured every meaning inside a section. The operator supplies the authoritative source snapshot and domain evidence; prose mode additionally requires a scoped external semantic receipt.

Each `SemanticCommitment` records these explicit facets; `null` denotes an intentionally absent quantity/action, and empty lists denote an explicitly empty facet:

| Field | Preserved meaning |
| --- | --- |
| `id`, `address`, `sourceAddresses`, `proposition` | Stable shared claim identity, source ancestry and canonical proposition. |
| `quantity` | Amount, unit and an optional denominator's amount/unit/population. |
| `actor`, `population`, `period`, `scope` | Who the claim concerns, its denominator population, time and domain. |
| `conditions`, `dependencies` | Conditions and prerequisite obligations under which it holds. |
| `adverseScenarios` | Unfavorable cases that must remain visible. |
| `uncertainty` | Exact/estimate/interval/unknown annotation, bounds, stated confidence and qualifier. |
| `claimStrength` | Description, association, prediction, causal claim or guarantee. These labels are compared for equality, not treated as a proof hierarchy. |
| `materialCosts` | Named material cost components with amount, unit and accounting period. |
| `action` | Recommended actor, operation, target, deadline and conditions. |

These values are canonical semantic annotations, not arbitrary wording to compare verbatim. An extractor must consistently map equivalent wording to the same identifiers. Lists representing sets are compared without order; duplicate identifiers are rejected. Every other declared difference is addressed in a finding, including weakened or strengthened claims, changed units/populations, omitted commitments, and newly invented commitments. No numeric score can silently average those failures away.

## Numeric predicates and source corrections

The source declares which relationships are intended:

- `sum`: a result equals a weighted sum of named commitment quantities. Units, denominator annotations, periods and populations must match.
- `ratio`: an unnormalized numerator divided by an unnormalized denominator, with scale `1` (`ratio`) or `100` (`percent`). Counted units, populations and periods must match; the output's explicit denominator must match the measured denominator. Zero denominators and nested rate operands remain unresolved.
- `all-in-cost`: an unnormalized result equals the sum of its material cost inventory within the same unit and accounting period. Per-unit normalization must be explicit upstream.

Each relationship carries a nonnegative absolute tolerance in the result unit. Arithmetic uses finite JavaScript numbers; choose explicit representation/tolerance appropriate to rounding or use integer minor units. This module does not perform exchange-rate, period, inflation or unit conversions. It does not infer that a relationship is economically appropriate; that relationship is part of the source contract.

The corrected source is checked before the candidate. Inconsistent source arithmetic returns **unavailable**, with an addressed source issue. Copying a source mistake cannot establish a valid all-in total. Correct it through an explicit `SourceCorrection` in trusted configuration: source revision, commitment ID, exact before/after records, approver, reason and evidence. Before-value/revision mismatches are configuration errors. Corrections preserve claim IDs/addresses, remain visible in the model card configuration and output summary, and change the evaluator/reference identity. They are approvals supplied by the operator, not proof that a correction is true. A candidate report cannot approve its own correction.

## Structured evidence versus prose fidelity

`CommitmentPolicy.mode` has two distinct scopes:

| Mode | What a pass establishes |
| --- | --- |
| `structured-only` | The supplied structured records agree with the corrected reference and checked relationships. Contradictory prose can still accompany matching annotations; this mode makes no prose-fidelity guarantee. |
| `qualified-prose` | The structured checks pass **and** an accepted, scoped external semantic evaluator supplies a current passing receipt. The strength of the prose claim remains conditional on that evaluator's qualification and provenance. |

The module does not invoke a model or qualify a judge. In prose mode, the operator configures an allowlist of exact evaluator/applicability digests, scope and qualification evidence. A `SemanticJudgmentReceipt` must bind the exact corrected reference, source revision/content, candidate revision/content/inventory and source coverage. Missing, stale, unavailable or unqualified judgment returns unavailable; a qualified failure returns fail. The receipt should cover full-source semantic extraction, candidate extraction and preservation relative to the explicit corrections. The underlying evidence must justify that scope; preference wins and lexical counts do not qualify it.

These receipts are externally supplied data, not signatures or authenticated proof of model execution. An untrusted candidate cannot grant itself qualification because the allowlist is in trusted configuration, but the caller must authenticate collection/provenance before presenting a receipt. Tests with fabricated receipts test the protocol mechanics only. No such fixture grants a real semantic evaluator qualification.

## Input and downstream output

By default the candidate report is selected from `artifact.data.commitments` and the current candidate text from `artifact.data.text`; configure `reportPath` and `candidateTextPath` explicitly for other payloads. The typed input declaration is:

```js
available: {
  schemas: ['quality-sgd.candidate-commitments@1'],
  capabilities: ['source-commitment-inventory'],
}
```

The report binds the source revision, computed `sourceCoverageDigest(source)`, candidate revision and `digest(currentCandidateText)`. The candidate revision must equal the current host artifact digest. The source, policy, accepted qualifications, corrections, input selectors and cost are immutable evaluator configuration; the full build/statement/input/output identity uses the standard assertion protocol.

A passing assertion emits `COMMITMENT_OUTPUT`, schema `quality-sgd.commitment-summary@1`, containing both revision/content identities, source coverage/reference identity, candidate inventory identity, preserved claim IDs, applied correction IDs and semantic mode. Consumers can declare `fromAssertion('source.commitments', COMMITMENT_OUTPUT)` to receive the host-validated typed output receipt. Failure or unavailable evidence produces no eligible downstream output; prerequisites remain blocked. A receipt cannot be reused across an incompatible source, candidate, environment or evaluator identity.

Findings use stable claim addresses with facet suffixes. A caller can turn them into proposed repairs, but the report does not enable a harness, change trusted source policy, execute a remediation prompt, or admit its own edited artifact. Every edit requires fresh evaluation under the same current contract or explicit rebaselining after a contract change.

## Validation

```sh
npx vitest run tests/v2/commitments.test.ts
npx tsc --noEmit
```

The dedicated cases exercise faithful records; denominator, condition, adverse-scenario, causal-strength, population, all-in-cost and action counterexamples; other facet changes; explicit source corrections; missing source coverage; stale text and scoped judgments; ratio/sum consistency; typed downstream receipts and prerequisite blocking; and a passing complexity facet alongside required fidelity failure. These tests establish implementation behavior, not empirical semantic extraction, reader comprehension or business utility.
