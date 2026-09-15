# Bounded decision, verifier and conflict evidence

The [finite program](../../examples/v2/decision-program/README.md) establishes mechanical behavior on an explicit constructed population. It does not establish human comprehension, prose fidelity, external scanner validity, business utility, or a globally optimal improvement policy.

## Population and reference

The [fixed definition](../../examples/v2/decision-program/protocol.json) enumerates every ordered `(a,b,total,color)` with `a,b ∈ {0,1,2,3}`, `total ∈ {0,…,6}`, and `color ∈ {A,B}`. All 224 records appear, with 32 acceptable and 192 unacceptable. The reference is `BigInt(a) + BigInt(b) === BigInt(total)`. It specifies supplied structured records; nothing extracts quantities or meaning from prose. Color is an explicitly irrelevant factor for arithmetic correctness.

The current strict host executes six configured predicates: exact arithmetic, a deliberately approximate comparator, a configured outage comparator, color, a constant result, and a protected `total <= 3` predicate. Input schema/version and capability declarations are explicit. Implementation, configuration, applicability, inputs, environment, current host file hashes and runtime version are bound before dispatch. The approximate comparator and fault profile are fixed in advance; failures are retained rather than used to revise labels.

This is a repeated constructed census designed with its evaluators, not a held-out sample. There is no IID sampling assumption and no population confidence claim. Calling the existing binomial calibration API with exploratory/reused/dependent evidence is demonstrated separately; its sampling bounds are intentionally omitted from the evidence report because the design does not justify them.

## Reusable finite calibration record

```ts
import { assessFiniteVerifier } from 'quality-gate-sgd';

const evidence = assessFiniteVerifier(protocol, observations, currentAssertionContract);
```

`FiniteVerifierProtocol` requires the complete population with fixed labels and input digests, reference provenance, full evaluator and applicability identities, evidence-use/dependence declarations, acceptance thresholds, and separate error consequences. `FiniteVerifierObservation` records the case, bound identities, accept/reject/unavailable verdict, evidence, resource cost, and a reason when unavailable. Unknown or duplicate cases, changed inputs, stale evaluators and incompatible scope fail validation.

For each label class of size `N`, `e` observed errors and `u` unknown outcomes produce the exact completion interval `[e/N, (e+u)/N]`. Unknown includes missing cases and explicit unavailable/failed attempts. These are bounds over completions of this finite census, not confidence intervals. The complete rate is withheld while outcomes are unknown, and `incomplete-census` remains the verdict even if a permissive threshold would pass under the worst completion. Both reference classes must be present.

The report distinguishes `meets-finite-thresholds`, `fails-finite-thresholds`, and `incomplete-census`; none authorizes a general model gate. A digest binds supplied data, not an honest executor, correct labels or a trusted preregistration time. Each external verifier still owns its reference construction, sampling and substantive validity claim.

The executed control population gives:

| Evaluator | False accepts / unacceptable | False rejects / acceptable | Missing or unavailable | Conclusion |
| --- | ---: | ---: | ---: | --- |
| Exact arithmetic | 0 / 192 | 0 / 32 | 0 | Meets zero-error thresholds on this census only |
| Approximate comparator | 44 / 192 | 12 / 32 | 0 | Fails both thresholds |
| Outage comparator | rate withheld; completion range 0–25% | rate withheld; completion range 0–31.25% | 1 missing, 57 unavailable | Incomplete census |

One of the unavailable attempts is an actual configured throw; the other 56 are explicit unavailable returns. The thrown attempt's reservation is conservatively charged and its ledger marked exceeded. A separate ledger for each population member allows the study to observe all other registered members without concealing the failed member. That setup does not permit a failed **single loop** to keep dispatching work.

## Decision value is distinct from information

States are the joint arithmetic label and color. Priors and assessment likelihoods are exact frequencies from the executed census. Actions are accept and reject. Wrong acceptance costs 10 declared utility points; wrong rejection costs 2. Correct decisions have zero error cost. The scope is one uniformly drawn member of this same census after at most one assessment.

The example operator assigns one actual assessment dispatch a cost of 0.1 utility points. This is a declared exchange rate, not measured financial loss, token cost, latency, preference or human effort. Different resource units are never compared implicitly. A milliseconds-versus-utility-points assessment is rejected by the decision API.

| Assessment | Information gain | Gross decision value | Net value at cost 0.1 |
| --- | ---: | ---: | ---: |
| Exact arithmetic | 0.59167 bits | 0.28571 points | +0.18571 |
| Approximate comparator | 0.06115 bits | 0 | −0.1 |
| Color | 1 bit | 0 | −0.1 |
| Constant | 0 bits | 0 | −0.1 |

Color changes the joint posterior substantially while revealing no relevant correctness information. The approximate comparator changes the probability of correctness, but every posterior still favors rejection at these error costs. Exact arithmetic is selected despite providing fewer Shannon bits than color.

The independent calculation enumerates **every** deterministic outcome-to-action mapping and averages its actual class consequences over the records. It does not call the posterior/EVSI functions. Its optimal value and choices agree with the core for 36 declared cost scenarios, including stopping. Randomization cannot improve expected utility over the best deterministic action in this finite linear-utility model; the program makes no claim about a richer action set or adaptive multiround policy.

The no-assessment option has zero additional assessment cost and mean utility `−2/7` under the default consequences. A second actual pass through all 224 records executes the selected exact assessment, makes zero decision errors and has net utility `−0.1` after the assumed conversion. At assessment cost 0.3, the program executes the no-assessment policy with **zero** assessment dispatches. Both observed finite policy utilities agree with independent enumeration. This is a replay of the same census, not independent validation of a learned policy.

The declared uncertainty rectangle sets wrong-rejection cost to `[0.5,2]` and assessment cost to `[0.1,0.3]`. The exact assessment's net benefit ranges from `−0.22857` to `+0.18571`. These are sensitivity bounds over assumptions, not statistical intervals; the assess-versus-stop choice remains unresolved over that rectangle.

## Causal scope and partial resolution

The program composes explicit transformations with the complete measured finite response table. Restoring `total=a+b` repairs 192 arithmetic failures but regresses the protected total predicate for 48 members. Clamping total to 3 avoids protected regressions but creates 12 arithmetic regressions. Changing color leaves arithmetic unchanged in all 224 members.

That table identifies effects **only inside the specified deterministic program**: mutable input fields, known transformations, and executed predicates that are the complete outcome functions. No inferred business causal graph, human mechanism or observational-to-interventional transfer is involved. The `identified` example cites this narrow controlled program; the planner still treats that label and its evidence as caller claims requiring audit.

```ts
import { traceNudgePlan } from 'quality-gate-sgd';

const trace = traceNudgePlan(nudges, protectedAssertions, {
  artifactDigest: baseline.digest,
  scope: 'Current baseline and declared utility assumptions',
});
```

The trace returns selected-for-consideration and deferred entries, conditional preferences, unresolved peers, conflict reasons, protected objectives, claimed evidence basis and required follow-up. Missing benefit bounds require justified common-scale bounds; incompatible units require an operator-approved conversion and sensitivity; overlapping intervals require further outcome evidence or an unresolved tradeoff. Every preference requires complete re-evaluation after the first authorized change, because remaining interventions may interact.

Hypotheses require measured outcomes before an observation claim. Observations require an identification design and supporting intervention evidence before a causal claim. An `identified` string is not verified by the planner. The function never promotes evidence status, reviews a causal argument, authorizes a remedy, or executes a harness. Its pairwise strict interval dominance is conservative partial resolution, not a global optimizer.

The program binds measured local arithmetic differences to actual observation digests. It separately states its net-benefit assumption: one integer-distance reduction is worth one point, with an assumed one-step repair costing one point. Higher protected-objective damage is deferred despite an attractive local benefit. An unsupported color-to-correctness hypothesis receives no automatic credibility; when explicitly tried on a disposable candidate, full-gate admission rejects its lack of measured gain.

## Executed loop accounting

Every configured resource is a literal function-invocation count. An assessment step counts one assertion dispatch, including a returned unavailable or throw. A proposal step counts one proposer invocation. A repair step counts one candidate-generator invocation. Core attempted rounds are recorded separately.

| Scenario | Result | Rounds | Assessment steps | Proposal steps | Repair steps |
| --- | --- | ---: | ---: | ---: | ---: |
| Repair after protected rejection | Pass after one rejected candidate | 2 | 6 | 2 | 2 |
| Unresolved conflict | Stalled with defect retained | 1 | 2 | 1 | 0 |
| Repair budget exhausted | Budget stop | 2 | 4 | 2 | 1 |
| One-round limit | Round-limit stop | 1 | 4 | 1 | 1 |
| Remedy registered but disabled | Incomplete; no remedy execution | 1 | 2 | 1 | 0 |
| Unsupported color hypothesis | Candidate rejected; stalled | 1 | 4 | 1 | 1 |

The entire execution comprises 1,343 census dispatches, 224 selected-policy dispatches, 22 loop dispatches, 8 proposals and 5 repairs. Total: **1,589 assessment steps, 8 proposal steps, 5 repair steps**. No token or currency costs are simulated as actual spending. Wall time, energy and machine ownership cost are unmeasured.

## Evidence and reproducibility

Run the [CLI](../../examples/v2/decision-program/README.md) to create a new record. The [checked-in report](../../examples/v2/decision-program/evidence/report.json), [registration](../../examples/v2/decision-program/evidence/registration.json), and [raw census observations](../../examples/v2/decision-program/evidence/observations.json) preserve all outcomes and the original evaluator identities. The verifier checks integrity, current protocol/program/host hashes, and recomputed census results. It intentionally fails when the current implementation differs; rerun instead of transferring an old qualification.

The focused tests guard stale-identity rejection, full error denominators, unavailable bounds, distinct evidence bases, action-irrelevant information, exhaustive policy agreement, protected admission and literal cost accounting. Passing tests demonstrate those mechanics; the separately executed evidence record supplies the bounded observations. Human reader calibration and composition validity remain independent work.
