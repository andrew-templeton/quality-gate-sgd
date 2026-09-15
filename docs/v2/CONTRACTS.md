# Assertion execution contracts

The default compiler accepts assertions with protocol `quality-sgd.assertion/v1`. An assertion binds implementation identity, semantic configuration, applicability, its substantive statement and its runtime input contract into one `evaluatorDigest`. Module and card versions remain useful display/release identifiers; they no longer substitute for that identity.

```ts
import { bindInput, defineAssertion, schema } from 'quality-gate-sgd';

const input = bindInput({
  schemaId: 'example.measurement', schemaVersion: '1',
  path: ['measurement'], capabilities: ['current-measurement'],
  schema: schema.object({ value: schema.number() }),
});
const assertion = defineAssertion({
  card, // Complete AssertionCard, including assumptions and unsupported conclusions.
  implementation: { id: 'example/threshold', version: '2', digest: buildSha256 },
  configuration: { maximum: 10 },
  applicability: { instrument: 'registered-instrument-v1', population: 'registered-population' },
  input,
  async evaluate(context, measurement, configuration) {
    // measurement.value is a number; both data and configuration are frozen snapshots.
    // Validate current revision, collection completeness and domain assumptions here.
    return observeThreshold(measurement.value, configuration.maximum, context);
  },
});
```

The complete runnable arithmetic example is [communication.mjs](../../examples/v2/communication.mjs). It deliberately uses synthetic data and makes only an arithmetic claim.

## Semantic identity

`implementation` includes an ID, version and 64-character lowercase SHA-256 build digest. A producer must cover all behaviorally relevant code, dependencies, prompts, rubric and model settings in its implementation/configuration declaration. The helper does not discover a JavaScript closure or automatically attest a build. Use explicit immutable configuration passed to the evaluator instead of consulting a mutable instance or closure.

`defineAssertion` copies and recursively freezes JSON configuration, applicability, inputs and card metadata. It captures the evaluator function. Modifying the producer's later instance state or configuration does not alter the supplied snapshot. JSON integrity rejects accessors, hidden/symbol metadata, sparse arrays, cycles, custom instances and nonfinite values rather than silently discarding them.

The semantic statement includes assertion ID, claim, evidence kind, assumptions, guarantees, excluded conclusions and prerequisites. Changing these, implementation, configuration, applicability or input definition changes the evaluator identity. Editing only a display title leaves that identity intact; the containing gate digest still records the edited card. Equivalent object-key order does not change a digest.

A digest binds declared content. It cannot establish honest metering, trusted execution, complete dependency inventory, authentic source provenance, a correct reference label or the absence of undeclared mutable code behavior. External modules remain trusted executable code. A structurally compatible producer may create the same descriptor without importing core, provided it follows the contract and identity rules.

## Executable inputs

Each assertion has one versioned binding. Its `path` selects own properties starting at `artifact.data`; an empty path selects the entire payload. Schema IDs and versions exclude `@`, and declarations use the unambiguous `schemaId@schemaVersion` key. Evaluation requires an explicit `available` record:

```ts
const available = {
  schemas: ['example.measurement@1'],
  capabilities: ['current-measurement'],
};
```

All capabilities are required. Multiple required values belong in an object schema. Alternative value shapes use `schema.union(...)` within a single versioned schema. There is no implicit fallback between incompatible versions. The bounded schema algebra supports JSON, strings, finite numbers, booleans, literals, arrays, objects and unions. It is **not JSON Schema**; unsupported keywords are rejected. Builder object fields are required and additional properties are rejected. The explicit object AST also supports declared optional fields and an explicit additional-property policy.

The host inspects bindings before dispatching assertion work. A missing path, incompatible declaration or malformed value yields `unavailable` with a reason and no evaluator charge. Its dependent assertions do not run. A declared match from `discoverAssertions` uses these same version/capability rules; it does not promise valid payloads. `schema.json()` intentionally supplies an unknown JSON value and does not claim a more specific validated type.

Runtime shape validation does not authenticate a capability declaration or establish freshness, completeness, population fit or semantic truth. Those obligations remain explicit in the card and evaluator. For example, a correctly shaped render report still must cover every operator-required view and match the current artifact/environment.

## Qualification and migration

A qualified card must cite evidence and set `calibration.evaluatorDigest` to the current contract digest and `calibration.applicabilityDigest` to `digest(contract.applicability)`. The compiler rejects stale qualification after relevant changes. A new hash does not make old evidence applicable; review or rerun the study for the new implementation/configuration and scope before issuing a new qualification record. A display-title edit alone need not trigger such a study.

Unqualified model judgments can be advisory. They cannot satisfy a required assertion or prerequisite. Deterministic predicates may use `not-applicable` when they claim only the implemented calculation over supplied inputs; that does not qualify their measurements or establish application utility.

Legacy `{ card, evaluate }` assertions require explicit `compileGate(..., { allowLegacyAssertions: true })` as the fourth argument. Composed model cards list their IDs in `legacyAssertions`. This escape hatch preserves deliberate development migrations and class receivers; it supplies no implicit new identity or input guarantee. The CLI uses strict defaults. Migrate modules to the protocol before claiming interoperability under it.

The render factory now takes `{ policy, reportPath?, costUpperBound? }`; arbitrary reader callbacks have been replaced by a snapshotted own-property path. Recompile and rebaseline after migrating. The external SonarQube and Isogloss repositories own their corresponding adapters and migrations.

## Verification scope

`tests/v2/contracts.test.ts` exercises strict migration, class/nested configuration mutation, typed frozen inputs, changed implementation/configuration/scope/claims, stale qualification, malformed identity, unsupported schemas, declaration mismatch and zero-cost preflight failures. Render policy tests exercise policy-bound identity and required view coverage. These are protocol and deterministic control tests; they do not qualify a semantic verifier or establish human comprehension.
