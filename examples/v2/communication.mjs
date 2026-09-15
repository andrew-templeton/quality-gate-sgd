// Synthetic plumbing demonstration. The supplied render report is a fixture, not a browser capture.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bindInput, defineAssertion, digest, renderedLegibilityModule, RENDER_INPUT, schema } from '../../dist/v2/index.js';

const content = { text: 'Expected savings are $100. Implementation costs $20. Net benefit is $80 if the proposed change works.', savings: 100, cost: 20, net: 80 };
const artifactDigest = digest(content);
const environmentDigest = digest({ source: content, audience: 'synthetic business reader', view: 'fixture-only' });
const render = { artifactDigest, environmentDigest, screenshotDigest: 'synthetic-fixture-not-a-browser-capture', views: [{ id: 'overview/default', defects: [], folds: [{ id: 'top', quanta: ['savings', 'cost', 'net', 'condition'], novel: [], unexplained: [] }] }] };
// Operator-owned requirements are outside the candidate artifact and become part of the gate contract.
const renderPolicy = { version: 'synthetic-reader-v1', views: [{ id: 'overview/default', maxTotal: 4, maxNovel: 1 }] };

const arithmetic = {
  id: 'business-arithmetic', version: '2', includes: [], assertions: [defineAssertion({
    card: {
      id: 'business.net', version: '1', title: 'Net benefit arithmetic', path: ['measurement', 'arithmetic'],
      input: { schemas: ['example.business-case@1'], capabilities: [], description: 'Supplied savings, cost and net values in one currency/period.' },
      claim: 'Net equals savings minus cost for these supplied values.', evidenceKind: 'deterministic',
      assumptions: ['Values use the same currency, period and scope.'], guarantees: ['The supplied subtraction is consistent.'],
      doesNotGuarantee: ['No realized savings, causal effect, prose fidelity, or independently collected input evidence is established.'],
      requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Synthetic arithmetic fixture.' },
    },
    implementation: { id: 'example/business-arithmetic', version: '1', digest: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') },
    configuration: {}, applicability: { scope: 'synthetic arithmetic only', currency: 'USD', period: 'one-time' },
    input: bindInput({ schemaId: 'example.business-case', schemaVersion: '1', path: ['content'], schema: schema.object({ text: schema.string(), savings: schema.number(), cost: schema.number(), net: schema.number() }) }),
    async evaluate(_context, { savings, cost, net }) {
      const pass = net === savings - cost;
      return { status: pass ? 'pass' : 'fail', findings: pass ? [] : [{ address: 'business/net', message: 'Net does not equal savings minus cost', evidence: ['synthetic-input'] }], evidence: ['synthetic-input'], actualCost: { evaluations: 1 }, loss: { lower: pass ? 0 : 1, upper: pass ? 0 : 1, unit: 'inconsistent-equations' } };
    },
  })],
};
const modules = [arithmetic, renderedLegibilityModule({ policy: renderPolicy, reportPath: ['render'] })];
const required = ['business.net', 'render.geometry', 'render.fold-budget'];
modules.push({ id: 'communication', version: '1', includes: modules.map(module => module.id), assertions: [] });
const available = { schemas: ['example.business-case@1', ...RENDER_INPUT.schemas], capabilities: RENDER_INPUT.capabilities };
export default {
  modules, selected: ['communication'], policy: { required, advisory: [] },
  input: { artifact: { id: 'synthetic-business-case', digest: artifactDigest, data: { content, render } }, environmentDigest, available },
  budget: { evaluations: 8 },
  available,
};
