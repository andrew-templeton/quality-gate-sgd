// Compile this consumer against emitted public declarations. Negative cases must remain type errors.
import { bindInput, defineAssertion, defineOutput, fromAssertion, schema, type AssertionCard } from '../dist/index.js';

declare const card: AssertionCard;
const output = defineOutput({ schemaId: 'example.total', schemaVersion: '1', schema: schema.object({ total: schema.number() }) });
const assertion = defineAssertion({
  card,
  implementation: { id: 'example/typed', version: '1', digest: '0'.repeat(64) },
  configuration: { maximum: 10 }, applicability: { scope: 'type-check only' },
  input: bindInput({ schemaId: 'example.input', schemaVersion: '1', schema: schema.object({ label: schema.string(), amounts: schema.array(schema.number()) }) }),
  output,
  prerequisites: { source: fromAssertion('source', output) },
  async evaluate(context, input, configuration, prerequisites) {
    input.label.toUpperCase(); input.amounts.reduce((sum, amount) => sum + amount, 0);
    prerequisites.source.total.toFixed(2); configuration.maximum.toFixed();
    context.operationId?.toUpperCase();
    // @ts-expect-error Numbers from input schemas are not strings.
    input.amounts[0].toUpperCase();
    // @ts-expect-error Prerequisite outputs preserve the producer's numeric type.
    prerequisites.source.total.toUpperCase();
    // @ts-expect-error Semantic configuration is readonly.
    configuration.maximum = 999;
    // @ts-expect-error Unknown prerequisite keys are not silently accepted.
    prerequisites.missing.total.toFixed();
    return { status: 'pass', findings: [], evidence: ['type-fixture'], output: { total: 5 }, actualCost: { evaluations: 1 } };
  },
});
void assertion;
