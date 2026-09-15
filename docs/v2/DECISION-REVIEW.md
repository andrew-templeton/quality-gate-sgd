# Independent finite-program evidence review

The review found no numerical or scope defect in the recorded finite decision program. It inspected the fixed protocol, evaluator implementation, finite calibration and nudge-trace APIs, policy enumeration, raw observations and recorded outcomes. A separate Python calculation recounted errors, enumerated decision policies, applied the specified transformations and reconciled spending without calling the Bayesian API or using its stored likelihood tables.

The reviewed report digest is `c1048d01addbc7938301adda9a897aabfe98d75cb63cf09fbc815461f4c60d5d`. The following command passed against the matching built runtime:

```sh
node examples/v2/decision-program/verify-record.mjs \
  examples/v2/decision-program/evidence
```

This confirms the recorded protocol/program/runtime-file identities and recomputed census summaries. It is not a fresh execution or a verification of an external preregistration timestamp. If the program or relevant host implementation changes, the existing command intentionally rejects the old record.

## Denominators, missingness and reference

The complete specified population has 224 ordered records. The independent label calculation gives 32 acceptable and 192 unacceptable records. False acceptance uses all 192 unacceptable members as its denominator; false rejection uses all 32 acceptable members. Neither denominator excludes missing or unavailable outcomes.

| Evaluator | Observed attempts | False accepts | False rejects | Unavailable | Missing |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact | 224 | 0 | 0 | 0 | 0 |
| Approximate | 224 | 44 | 12 | 0 | 0 |
| Outage | 223 | 0 | 0 | 57 | 1 |

For outage, 48 unacceptable members are unavailable; nine acceptable members are unavailable and one is missing. The resulting completion bounds are `[0,48/192]` and `[0,10/32]`. Complete rates remain withheld, and incomplete evidence cannot become a completed census verdict under a permissive threshold. The explicit thrown attempt remains unavailable and conservatively charged.

The BigInt reference is a mathematical definition over the supplied integer records. The runtime comparator uses ordinary JavaScript arithmetic within a range where those integer operations are exact. The population was constructed alongside its evaluators and reused; no sampling confidence, held-out validation or general semantic qualification follows. The `registeredBeforeExecution` flag records an operator attestation, not proof of registration timing.

## Independent decision and intervention calculations

For every assessment outcome alphabet, the independent review enumerated every deterministic accept/reject mapping, computed each record's declared error consequence, averaged uniformly over all 224 records and subtracted the stated assessment cost. All 36 error-cost/assessment-cost scenarios agree with the reported Bayesian API result and assess-versus-stop selection.

At the default consequences, rejecting without assessment has utility `−2/7`; exact assessment has gross decision value `2/7` and net value `2/7−0.1`. Color reveals one bit about the joint label/color state but has zero decision value. The approximate comparator changes beliefs while leaving rejection optimal under every outcome at those default consequences. Information gain, posterior change and action value are kept distinct.

The utility conversion is an explicit operator assumption. It does not estimate money, latency, tokens or human effort. The reported uncertainty range varies those assumptions and crosses zero; it is not a statistical interval. The separate selected-policy executions reuse this same census, so agreement with their expected utility is a bounded replay check.

| Transformation | Arithmetic repairs | Arithmetic regressions | Protected regressions | Arithmetic unchanged |
| --- | ---: | ---: | ---: | ---: |
| Restore total to `a+b` | 192 | 0 | 48 | 32 |
| Clamp total to `min(a+b,3)` | 120 | 12 | 0 | 92 |
| Change color | 0 | 0 | 0 | 224 |

The intervention table is justified inside the completely specified deterministic program: input-field transformations are known and every resulting state has an executed predicate result. It supplies no business or human causal identification. Nudge traces preserve the supplied hypothesis/observation/identified labels, explain required follow-up and state that the planner has not verified those claims or authorized execution. Protected regressions remain deferred or rejected despite attractive local benefit.

## Accounting and verification limits

Independent reconciliation of the observation ledgers, selected-policy records and loop ledgers gives **1,589 assessment dispatches, eight proposer invocations and five candidate-generator invocations**. This includes 1,343 census dispatches, 224 selected-policy dispatches and 22 loop dispatches. Missing cases have no dispatch charge; returned unavailable and thrown attempts do. Rejected candidates retain their costs, and disabled remedies have no generator invocation.

The counters are literal local function-invocation units. They do not measure wall time, machine cost, energy or paid model usage. A fresh ledger per census member is appropriate to the separately enumerated experiments and is documented; it does not let a failed single improvement loop erase its spending or continue after quarantine.

`verify-record.mjs` recomputes the census summaries and verifies record/file digests. It does not independently recompute every decision, intervention and accounting section. The program asserts those relationships during generation; this review additionally recomputed them from raw records. Neither route authenticates an honest executor or extends the finite result to unseen inputs, readers, prose fidelity, external scanner accuracy or composed business utility. Those claims retain their separate evidence requirements.
