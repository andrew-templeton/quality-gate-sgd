import { describe, expect, it } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { bindInput, defineAssertion, schema } from '../../src/v2/contracts.js';
import { runQualityLoop, type QualityLoopOptions } from '../../src/v2/loop.js';
import { digest } from '../../src/v2/validation.js';

const artifact = (loss: number) => ({ id: 'settings-fixture', digest: digest({ loss }), data: { loss } });
function settings(): QualityLoopOptions {
  const assertion = defineAssertion({
    implementation: { id: 'fixture', version: '1', digest: digest('fixture-v1') }, configuration: {}, applicability: { population: 'fixture' },
    input: bindInput({ schemaId: 'fixture', schemaVersion: '1', schema: schema.object({ loss: schema.number() }) }),
    card: { id: 'quality', version: '1', title: 'Fixture', path: ['measurement', 'regression'], claim: 'Loss is zero.',
      input: { schemas: [], capabilities: [], description: 'Exact fixture loss.' }, evidenceKind: 'deterministic', assumptions: ['Fixture only.'], guarantees: ['Measures exact fixture loss.'],
      doesNotGuarantee: ['Application quality.'], requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Fixture.' } },
    async evaluate(_context, input) { return { status: input.loss ? 'fail' : 'pass', findings: input.loss ? [{ address: 'fixture', message: 'Nonzero loss.', evidence: [String(input.loss)] }] : [], evidence: [String(input.loss)], actualCost: { evaluations: 1 }, loss: { lower: input.loss, upper: input.loss, unit: 'loss' } }; },
  });
  const policy = { required: ['quality'], advisory: [] };
  return { gate: compileGate([{ id: 'fixture', version: '1', includes: [], assertions: [assertion] }], ['fixture'], policy),
    artifact: artifact(10), environmentDigest: 'fixture-environment', available: { schemas: ['fixture@1'], capabilities: [] }, budget: new BudgetLedger({ evaluations: 10, tokens: 10 }),
    admission: { gate: policy, objectives: { quality: 1 }, reversalMultiplier: 2, cooldownRounds: 1, maxStalledRounds: 1 }, maxRounds: 2, proposalCostUpperBound: { tokens: 1 },
    async propose() { return { actualCost: { tokens: 1 }, nudges: [{ id: 'improve', assertionId: 'quality', instruction: 'Reduce loss.', reads: ['fixture'], writes: ['fixture'],
      changes: [{ address: 'fixture', variable: 'loss', direction: -1 }], effects: [{ assertionId: 'quality', direction: 'improves', basis: 'hypothesis', evidence: [] }], costUpperBound: { tokens: 1 },
      remediation: { harnessId: 'fixture-repair', prompt: 'Reduce loss.', verification: ['quality'] } }] }; },
  };
}

describe('immutable loop settings', () => {
  it('cannot relax its admission threshold through a proposer mutating the caller object', async () => {
    const options = settings(); const propose = options.propose;
    options.propose = async context => { options.admission.objectives.quality = 0; return propose(context); };
    options.candidateGenerator = async () => ({ artifact: artifact(9), actualCost: { tokens: 1 } });
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('stalled'); expect(result.artifact).toEqual(artifact(10));
    expect(result.events.find(event => event.phase === 'admission')?.reason).toMatch(/deadband/);
  });
  it('cannot enable a registered repair through a proposer mutating caller enablement', async () => {
    const options = settings(); const propose = options.propose; let dispatched = false;
    options.enabledHarnessIds = [];
    options.harnesses = [{ id: 'fixture-repair', async run() { dispatched = true; return { artifact: artifact(0), actualCost: { tokens: 1 } }; } }];
    options.propose = async context => { (options.enabledHarnessIds as string[]).push('fixture-repair'); return propose(context); };
    const result = await runQualityLoop(options);
    expect(result.stopReason).toBe('incomplete'); expect(dispatched).toBe(false);
  });
});
