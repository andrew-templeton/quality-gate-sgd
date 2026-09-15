# Preference experiments and verifier calibration

The calibration module answers two separate questions:

| Question | API | Evidence produced |
| --- | --- | --- |
| Does a reader prefer a candidate to a baseline on the registered task? | `preparePreferenceTrial`, `assessPreferenceTrial` | A blinded, paired, fixed-sample preference comparison |
| Does a verifier keep false acceptance and false rejection below registered limits? | `assessVerifierCalibration` | Class-conditional error estimates and simultaneous upper confidence bounds against supplied reference labels |

Preference does not establish factual correctness, semantic fidelity, safety, or verifier reliability. A verifier's classification error bounds do not establish calibration of its numerical probability predictions. Neither result automatically qualifies an assertion card or a composition.

The implementation is local TypeScript with no model calls, storage service, or browser UI. Build with `npm run build`; the examples below import `./dist/v2/calibration.js` from the repository root. Counts are bounded at 10,000. All data passed to digests must be finite JSON: plain objects, arrays, strings, booleans, finite numbers, or `null`. Omit absent fields; do not supply `undefined`, class instances, dates, functions, or cyclic values.

## Register the experiment before collecting judgments

`preparePreferenceTrial(protocol, cases)` returns `{ packet, answerKey }`. It independently assigns each candidate to A or B using `node:crypto`, randomly permutes pair order, and assigns opaque IDs. The public packet contains display content and those IDs. Condition names, condition versions, source case IDs, and the assignment mapping remain in the separate answer key.

`PreferenceProtocol` has these required fields:

| Field | Meaning |
| --- | --- |
| `id`, `version` | Stable experiment identity and protocol revision |
| `question` | The exact question displayed to the reader |
| `baselineVersion`, `candidateVersion` | Frozen condition identities, retained in the private key |
| `samplingFrame` | Population, task, audience, and case-selection scope supporting interpretation |
| `unitOfIndependence` | What constitutes one independently sampled pair |
| `plannedPairs` | Exact number of supplied cases; integer from 1 through 10,000 |
| `minimumDecisivePairs` | Required number of A/B choices after excluding ties; positive integer no larger than `plannedPairs` |
| `alpha` | Prespecified type I error level, strictly between 0 and 1 |
| `mode` | `confirmatory` or `exploratory` |

Each `PreferenceCase` is `{ id, prompt, baseline, candidate }`; all four fields are nonempty strings and case IDs must be unique. Choose the question, sample size, minimum decisive sample, eligibility rules, audience, condition versions, and alpha before viewing results. A minimum sample alone is not a power calculation. The module does not plan power or a minimum practically worthwhile effect.

The caller must remove identity clues from `question`, `prompt`, and both displayed artifacts. Random assignment hides metadata; it cannot hide recognizable writing style, product names, rendering differences, or other identifying content.

### A small local game

This four-pair example demonstrates the mechanics. It is explicitly exploratory and cannot establish superiority. Save the following as `prepare-preference.mjs` in the repository root, then run `node prepare-preference.mjs`:

```js
import { writeFileSync } from 'node:fs';
import { preparePreferenceTrial } from './dist/v2/calibration.js';

const protocol = {
  id: 'reader-demo', version: '1',
  question: 'Which answer makes the requested decision easier to understand?',
  baselineVersion: 'draft-1', candidateVersion: 'draft-2',
  samplingFrame: 'Four illustrative summaries; no population inference',
  unitOfIndependence: 'One distinct summary prompt',
  plannedPairs: 4, minimumDecisivePairs: 4,
  alpha: 0.05, mode: 'exploratory',
};
const cases = [
  { id: 'timing', prompt: 'Explain when to act.',
    baseline: 'The action window closes Friday.',
    candidate: 'Decide by Friday so the team can start Monday.' },
  { id: 'cost', prompt: 'Explain the total cost.',
    baseline: 'The fee is $20,000, plus $5,000 for setup.',
    candidate: 'The total is $25,000: a $20,000 fee and $5,000 setup.' },
  { id: 'risk', prompt: 'Explain the uncertainty.',
    baseline: 'Savings have not yet been validated.',
    candidate: 'Savings are an estimate. A pilot will test whether they occur.' },
  { id: 'owner', prompt: 'Explain the next action.',
    baseline: 'Finance approval is required before purchase.',
    candidate: 'Ask Finance to approve the purchase before ordering.' },
];
const { packet, answerKey } = preparePreferenceTrial(protocol, cases);
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), {
  flag: 'wx', mode: 0o600,
});
write('preference-packet.json', packet);
write('preference-answer-key.private.json', answerKey);
console.log('Prepared a public play packet and a separate private answer key.');
```

The private key must stay outside the participant's files, application bundle, and logs. On a hosted UI, send only `packet` to the browser; keep the key on the operator side. File permissions in this example are a local convenience, not a complete confidentiality mechanism. The exclusive writes prevent accidentally overwriting a saved trial.

Save the next script as `play-preference.mjs`, then run `node play-preference.mjs`. It reads only the public packet. A production UI can use the same JSON flow:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const packet = JSON.parse(readFileSync('preference-packet.json', 'utf8'));
const terminal = createInterface({ input: stdin, output: stdout });
const responses = [];
try {
  console.log(packet.question);
  for (const pair of packet.pairs) {
    console.log(`\n${pair.prompt}\n\nA: ${pair.A}\n\nB: ${pair.B}`);
    let choice;
    do {
      choice = (await terminal.question('A / B / tie / cannot-judge: ')).trim();
    } while (!['A', 'B', 'tie', 'cannot-judge'].includes(choice));
    responses.push({
      packetId: packet.id, packetDigest: packet.digest,
      pairId: pair.id, choice,
    });
  }
} finally {
  terminal.close();
}
writeFileSync('preference-responses.json', JSON.stringify(responses, null, 2), {
  flag: 'wx', mode: 0o600,
});
```

Each response is exactly the following shape; its identifiers must be copied from the played packet:

```json
{
  "packetId": "opaque-packet-id",
  "packetDigest": "digest-from-the-packet",
  "pairId": "opaque-pair-id",
  "choice": "tie"
}
```

Allowed choices are `A`, `B`, `tie`, and `cannot-judge`. A tie means the reader judges the alternatives equally preferable. `cannot-judge` means the reader cannot supply the comparison; it is incomplete evidence, not a tie. Do not combine ballots from multiple readers on one pair: the API accepts one response per pair. A design with repeated readers or clustered tasks needs an analysis that accounts for that dependence.

Save this final script as `assess-preference.mjs`, then run `node assess-preference.mjs` on the operator side:

```js
import { readFileSync } from 'node:fs';
import { assessPreferenceTrial } from './dist/v2/calibration.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const result = assessPreferenceTrial(
  read('preference-packet.json'),
  read('preference-answer-key.private.json'),
  read('preference-responses.json'),
  {
    priorAnalyses: 0,
    adaptedUsingTheseCases: false,
    independentUnits: true,
  },
);
console.log(JSON.stringify(result, null, 2));
```

These `EvidenceUse` fields are mandatory external attestations, not facts the module verifies. `priorAnalyses` counts previous looks used to assess or select results; `adaptedUsingTheseCases` includes candidate selection, prompt changes, rubric changes, or tuning using these cases; `independentUnits` attests the independence required by the selected analysis. Registering a new protocol ID does not make reused evidence fresh. Inspecting interim win counts and deciding whether to continue is a prior look even if no p-value was computed.

For a confirmatory experiment, use new held-out cases and a frozen design. Do not convert the example to confirmation by relabeling its protocol after play.

## Preference test and result semantics

`assessPreferenceTrial(packet, answerKey, responses, use)` checks packet/key integrity, protocol binding, response IDs, allowed choices, and uniqueness. Changed packet content, changed protocol/key contents, unknown pairs, duplicate ballots, and responses from another packet/version throw an error. Sorting ballots does not change the response digest.

Let `w` be candidate wins, `l` baseline wins, and `n = w + l`. Ties are counted but excluded from the test. The tested null hypothesis is:

> The probability of preferring the candidate, conditional on a decisive pair in the registered sampling frame, is at most one half.

For a complete sample with at least one decisive pair, the one-sided exact sign-test p-value is

`p = sum[j=w..n] choose(n,j) * 2^(-n)`.

For example, 9 candidate wins and 1 loss give `p = 11 / 1024 ≈ 0.010742`. Ten wins and ten ties test the ten decisive comparisons; they do not establish superiority on all twenty cases. Ties, unjudgeable cases, and missing cases remain visible in the report.

| Status | Meaning |
| --- | --- |
| `insufficient-evidence` | At least one missing/unjudgeable pair, or fewer than `minimumDecisivePairs` decisive choices |
| `exploratory-only` | Sample requirements were met, but the protocol was exploratory or fresh independent first use was not attested |
| `supports-preference-improvement` | Complete eligible confirmatory evidence, minimum decisive sample met, and `pValue <= alpha` |
| `no-demonstrated-improvement` | Complete eligible confirmatory evidence did not meet the significance threshold; this is not proof of equality or inferiority |

The report includes `wins`, `losses`, `ties`, `cannotJudge`, `missing`, `decisive`, `plannedPairs`, `pValue`, `alpha`, reasons, scope of the estimand, limitations, and packet/protocol/response digests. `pValue` is `null` until all pairs are answered without `cannot-judge`; it is also `null` for an all-tie sample. A complete but undersized or exploratory sample can carry a descriptive p-value while its status prevents a confirmatory claim.

Alpha is a long-run type I error control for the specified single comparison under its assumptions. A p-value is not the posterior probability that the candidate is worse, an effect size, or the probability that a particular output is correct. The module supplies no confidence interval for the size of a preference improvement.

## Known-label verifier calibration

`assessVerifierCalibration(protocol, cases, use)` evaluates a classifier-style verifier against supplied reference labels. Each case is `{ id, label, verdict }`, with unique nonempty IDs, `label` equal to `acceptable` or `unacceptable`, and `verdict` equal to `accept`, `reject`, or `unavailable`.

`VerifierCalibrationProtocol` requires:

| Field | Meaning |
| --- | --- |
| `id`, `version` | Registered calibration experiment and revision |
| `evaluatorVersion` | Exact assertion/evaluator version under evaluation |
| `datasetId`, `scope` | Reference dataset identity and intended application scope |
| `plannedCases` | Fixed total sample size, integer from 1 through 10,000 |
| `minimumPerClass` | Required evaluated cases in each label class; twice this number cannot exceed `plannedCases` |
| `alpha` | Total simultaneous noncoverage budget, strictly between 0 and 1 |
| `maximumFalseAcceptRate`, `maximumFalseRejectRate` | Prespecified acceptable error ceilings in `[0,1]` |
| `mode` | `confirmatory` or `exploratory` |

This runnable synthetic example demonstrates the computation, not evidence for a real verifier. Save as `calibrate-verifier.mjs` and run `node calibrate-verifier.mjs`:

```js
import { assessVerifierCalibration } from './dist/v2/calibration.js';

const protocol = {
  id: 'synthetic-calibration-demo', version: '1',
  evaluatorVersion: 'example-assertion@1',
  datasetId: 'synthetic-labels@1', scope: 'API demonstration only',
  plannedCases: 200, minimumPerClass: 100, alpha: 0.05,
  maximumFalseAcceptRate: 0.05, maximumFalseRejectRate: 0.05,
  mode: 'exploratory',
};
const cases = Array.from({ length: 200 }, (_, index) => ({
  id: `case-${index}`,
  label: index < 100 ? 'acceptable' : 'unacceptable',
  verdict: index < 100 ? 'accept' : 'reject',
}));
const result = assessVerifierCalibration(protocol, cases, {
  priorAnalyses: 0, adaptedUsingTheseCases: false, independentUnits: true,
});
console.log(JSON.stringify(result, null, 2));
```

With no errors in 100 evaluated cases per class, each observed error rate is zero, but each simultaneous upper bound is approximately `0.036217`, or 3.62%. The example remains `exploratory-only`. A real confirmatory run meeting the same registered conditions and thresholds could return `meets-error-bounds`.

### Error bounds and guarantees

False acceptance is `accept` on an `unacceptable` reference case; its denominator is the evaluated unacceptable class. False rejection is `reject` on an `acceptable` case; its denominator is the evaluated acceptable class. These are different conditional probabilities and need separate denominators.

For `k` errors in `n` independent class examples, the module computes a one-sided Clopper–Pearson upper bound `U` by inverting the binomial CDF:

`P[Binomial(n, U) <= k] = alpha / 2`.

For `k = 0`, `U = 1 - (alpha / 2)^(1/n)`. For `k = n`, `U = 1`. A class with no evaluated examples has a `null` bound. Inversion uses a log-space binomial recurrence and 60 bisection iterations. “Exact” refers to the finite binomial distribution, not a normal approximation or exact real-number computation; implementation arithmetic is floating point.

Allocating `alpha / 2` to each class and applying the union bound gives simultaneous coverage of at least `1 - alpha` for both class-conditional population error rates under the registered fixed-sample design, independent examples within each class, and correct reference labels. The two class estimates need not be assumed independent for that union-bound step. Coverage is a repeated-sampling property, not a posterior probability that either rate lies below its bound.

| Status | Meaning |
| --- | --- |
| `insufficient-evidence` | Missing cases, unavailable verdicts, or a label class below its minimum |
| `exploratory-only` | Adequate sample size, but exploratory, adapted, reused, or dependent evidence |
| `meets-error-bounds` | Eligible confirmation with both upper bounds at or below their registered error ceilings |
| `does-not-meet-error-bounds` | Eligible confirmation did not establish both error ceilings; this alone does not prove either population rate exceeds its ceiling |

The report includes class sizes, error counts, observed rates, upper bounds, missing/unavailable counts, simultaneous confidence level, evaluator version, scope, method, limitations, and protocol/evidence digests. Missing cases and unavailable verdicts block qualification; they are not silently dropped to improve an observed rate. Bounds are `null` until all planned cases have evaluated verdicts. A complete sample can have descriptive bounds while still failing the minimum per class.

The operator must preserve the reference labels, their provenance, the exact evaluated outputs, and the preregistered protocol. Do not adjudicate a disputed label after seeing the verifier's answer and then report the same sample as fresh confirmation. A changed evaluator, label set, audience, scope, or policy requires a new assessment of applicability and usually fresh held-out evidence.

## Incorporating evidence into assertion cards and compositions

Store calibration output alongside its complete protocol, cases, evaluator version, and reference-label provenance. An assertion card can cite the relevant protocol/evidence digests and scope. Its guarantees must describe the actual conditional error bound rather than summarize the result as “correct” or “safe.” The library does not automatically change a card's calibration status. Verifier implementations are independently versioned: record the external verifier and module versions as well as the Quality-SGD contract and composition under evaluation.

[Isogloss](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) is the default external example of a reader-legibility tool; its module integration belongs alongside that implementation, outside this core repository. An assertion supplied by such a module can be composed with source-fidelity and source-arithmetic assertions, but each tests a different claim. A preference win cannot replace fidelity evidence. A child's error bound does not automatically become the error bound of the whole conjunction: component failures may correlate, the composition may use a different acceptance rule, and the target label may differ. Calibrate the actual composed decision rule, or supply a separately justified composition bound. Do not multiply confidence or pass rates without a valid model.

## Limits that remain external to this module

- Digests detect changed supplied inputs; they are not signatures, trusted timestamps, immutable preregistration, or proof that an evaluator produced an output. A caller can reconstruct inputs or conceal earlier analyses.
- The APIs are stateless. They reject duplicate ballots within a call but cannot prevent repeated calls, outcome selection across calls, protocol rewriting, replaying a dataset, or lying in `EvidenceUse`.
- Fixed-sample tests have no optional-stopping, repeated-look, multiple-candidate, or multiple-assertion correction. A new experiment identifier does not reset an error budget. Plan those designs separately.
- Independent pair/case sampling, representative selection, honest exclusion rules, reference-label quality, and sufficient power are supplied assumptions. Correlated prompts, repeated participants, or duplicated underlying cases can violate them despite distinct IDs.
- Numeric limits are policy choices. The module does not infer the cost of false acceptance, false rejection, reader time, or missingness; combine these results with an explicit decision model when those costs matter.
- Abstention currently blocks qualification. This is not a selective-classification analysis with coverage/abstention tradeoffs.
- Neither empirical evidence nor a blinded reader preference is a universal guarantee. Preserve the exact version, scope, experiment design, and unresolved limitations when reusing an assertion subset.

Run `npx vitest run tests/v2/calibration.test.ts` for packet-integrity, sparse-data, adaptation, tie, abstention, and numerical-reference checks.
