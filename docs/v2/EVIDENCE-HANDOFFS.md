# Typed prerequisite outputs

An assertion may declare one versioned output schema. A passing result must include a matching `output`; malformed or missing output makes that assertion unavailable. Failed or unavailable results cannot supply downstream evidence. The host validates data and produces the evidence envelope, rather than trusting a runner-supplied receipt.

```ts
const total = defineOutput({
  schemaId: 'example.total', schemaVersion: '1',
  schema: schema.object({ total: schema.number() }),
});

const producer = defineAssertion({
  ...producerDefinition,
  output: total,
  async evaluate(context, input, configuration) {
    return { status: 'pass', findings: [], evidence: ['current-input'],
      output: { total: input.values.reduce((sum, value) => sum + value, 0) },
      actualCost: { evaluations: 1 } };
  },
});

const consumer = defineAssertion({
  ...consumerDefinition, // card.requires explicitly includes producer.card.id.
  prerequisites: { source: fromAssertion(producer.card.id, total) },
  async evaluate(context, input, configuration, upstream) {
    // upstream.source.total is a validated number in a frozen snapshot.
    return checkTotal(upstream.source.total, input, configuration);
  },
});
```

Bindings name required producer assertions. Compilation verifies that they belong to the explicit prerequisite graph and expose the exact matching output schema, including its version and definition. Ordering/eligibility prerequisites that transfer no data continue to work. Output schemas and prerequisite bindings enter the evaluator identity, so changing them invalidates old qualification.

For each eligible result, `outputEvidence` records producer assertion ID and evaluator identity, the current complete evaluation input digest, schema digest, value digest, and the envelope digests of consumed upstream outputs. Its own digest binds all these fields. Inspect these receipts through `Evaluation.results`; the evaluator's fourth argument contains just the typed values, while `context.prerequisites` exposes their frozen envelopes. Input and operation identities belong to the host. A caller cannot inject upstream evidence into `evaluateGate`, and arbitrary result metadata cannot replace an envelope.

Durable execution journals the raw observation. On resume, the host reconstructs and revalidates its output receipt against the current compiled contract and input identity. Reusing an old evaluation under a changed artifact or contract does not make its output current. In-memory execution similarly obtains prerequisite data only from the current ordered evaluation, rather than from a caller cache.

These are integrity and schema guarantees over declared code and supplied inputs. They do not authenticate a source, establish that a producer truthfully computed its output, or transfer empirical qualification between populations. Changing an upstream producer can change the distribution seen by a downstream judge even when the shape is unchanged; reassess applicability and composition-level evidence before reusing that judge's qualification. Use `evaluateGate` for the enforced pipeline; directly invoking a runner bypasses host qualification, accounting and provenance construction.

`tests/v2/outputs.test.ts` covers typed data transfer, frozen values, missing/malformed/failed/unavailable producers, mismatched schemas and versions, spoofed metadata, changed identities and durable replay. `npm run check:types` compiles an independent consumer of the emitted public declarations and checks that numeric input/output types, prerequisite names and readonly configuration remain enforced by TypeScript.
