# Discoverable assertion context

`catalogContext(modules)` exposes the locally supplied modules as an assertion zoo: family, sub-facet, exact claim, implementation/configuration identity, applicability, input/output contracts, prerequisites, evidence kind, qualification and costs. The vocabulary is shared by the transport-neutral resources `quality://v2/assertion-zoo`, `quality://v2/assertion-catalog` and `quality://v2/composition-card`.

```js
import { catalogContext, compositionContext, readResource } from 'quality-gate-sgd';

const catalog = catalogContext(modules);
const selectedSubset = compositionContext(compiledGate);
const resource = readResource('quality://v2/composition-card', { gate: compiledGate });
```

The host application supplies modules and the selected gate. An empty catalog does not discover or install packages from a remote service. `readResource` can be registered with a caller-owned transport; core does not start an MCP server or authorize a remediation harness.

## An audience-specific subset

For **business decision-makers unfamiliar with technical jargon**, each facet answers a different question:

| Facet | Requirement or optional diagnostic | Context needed before relying on it |
| --- | --- | --- |
| Source commitments | Required: preserve material amounts, conditions, uncertainty and the recommended action | Full source coverage, explicit corrections and qualification of any semantic extraction/judgment |
| Arithmetic | Required: amounts, units, periods and denominators reconcile | Trusted inputs and the exact numerical relationships; consistent arithmetic does not establish realized savings |
| Rendered geometry | Required: the specified states remain visible and operable | Actual viewport/state coverage and measurement evidence |
| Total/novel fold inventory | Required: respect operator caps while retaining decision-relevant relationships | Stable claim membership, audience assumptions and an actual surface definition; counts do not prove comprehension |
| [External Isogloss text diagnostic](https://github.com/andrew-templeton/isogloss/tree/codex/quality-sgd-module-example/integrations/quality-sgd) | Optional language facet, or a required lexical predicate when that narrow requirement is intended | Exact lexicon, scope, fold policy and implementation; text folds do not establish rendered geometry or semantic fidelity |
| Reader task performance | Separate empirical assessment of the selected composition | Eligible real readers, fixed protocol, source/answer-key separation, identity and uncertainty |

This table describes a composition's responsibilities. It does not imply every listed verifier is already qualified or that including more facets must improve a result. A required fidelity failure cannot be compensated by a lower lexical count. A model judgment remains advisory until its current evaluator and scope have appropriate qualification; an allowed lexical counting predicate still does not qualify the audience assumptions behind that count.

`compositionContext(gate)` produces a documentation card for the **actual selected subset**, with its full prerequisite closure and every component's assumptions and excluded guarantees. It totals the upper bound for one evaluation in separate resource units. Collection, proposals, repairs and repeated rounds remain separate costs. It does not produce an aggregate confidence or multiply pass rates.

For a runnable subset card over the synthetic arithmetic/render fixture, build the package and run:

```sh
node --input-type=module -e "import config from './examples/v2/communication.mjs'; import { compileGate, compositionContext } from './dist/index.js'; console.log(JSON.stringify(compositionContext(compileGate(config.modules, config.selected, config.policy)), null, 2));"
```

That fixture's render measurements are supplied examples, not captured pixels. The card preserves that limitation. Add independently installed facets explicitly and inspect the resulting card before treating its coverage as sufficient for a task.

## Interpreting matches and conflicts

Families are a discovery hierarchy, not an ordered ladder of proof. Two assertions under `communication/legibility` may differ in audience, measurement, output, guarantee and error consequences. An empirical study, deterministic predicate, model judgment and causal-assumption audit support different conclusions. Shared labels or a high score cannot make them interchangeable.

Read configuration, applicability and required evidence together. A signature match can still lack current data or appropriate qualification. Typed output schemas establish handoff compatibility, not semantic truth. Shared sources can produce correlated errors across a conjunction; a composition needs its own utility and burden assessment.

Nudges may also conflict: simplifying a passage could hide a material condition, while adding an explanation could exceed a fold cap. Inspect shared read/write addresses, effect evidence and protected objectives. Conservative interval dominance can partially resolve comparable tradeoffs; unresolved or differently scaled claims require additional evidence. A proposed remedy remains separate from execution permission and candidate admission.

`tests/v2/context.test.ts` exercises hierarchy, exact runtime metadata, unqualified model facets, composed guarantees/costs, immutable cards and resource consistency. These checks establish discoverability and reporting behavior, not reader or verifier validity.
