// Synthetic plumbing demonstration. The supplied render report is a fixture, not a browser capture.
import { pathToFileURL } from 'node:url';
import { digest, renderedLegibilityModule, isoglossModule } from '../../dist/v2/index.js';

const content = { text: 'Expected savings are $100. Implementation costs $20. Net benefit is $80 if the proposed change works.', savings: 100, cost: 20, net: 80 };
const artifactDigest = digest(content);
const environmentDigest = digest({ source: content, audience: 'synthetic business reader', view: 'fixture-only' });
const render = { artifactDigest, environmentDigest, screenshotDigest: 'synthetic-fixture-not-a-browser-capture', requiredViews: ['overview/default'], views: [{ id: 'overview/default', defects: [], folds: [{ id: 'top', quanta: ['savings', 'cost', 'net', 'condition'], novel: [], unexplained: [], maxTotal: 4, maxNovel: 1 }] }] };

const arithmetic = {
  id: 'business-arithmetic', version: '1', includes: [], assertions: [{
    card: {
      id: 'business.net', version: '1', title: 'Net benefit arithmetic', path: ['measurement', 'arithmetic'],
      input: { schemas: ['example.business-case/v1'], capabilities: [], description: 'Supplied savings, cost and net values in one currency/period.' },
      claim: 'Net equals savings minus cost for these supplied values.', evidenceKind: 'deterministic',
      assumptions: ['Values use the same currency, period and scope.'], guarantees: ['The supplied subtraction is consistent.'],
      doesNotGuarantee: ['No realized savings, causal effect, prose fidelity, or independently collected input evidence is established.'],
      requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Synthetic arithmetic fixture.' },
    },
    async evaluate({ artifact }) {
      const { savings, cost, net } = artifact.data;
      if (![savings, cost, net].every(Number.isFinite)) throw new Error('Finite supplied amounts required');
      const pass = net === savings - cost;
      return { status: pass ? 'pass' : 'fail', findings: pass ? [] : [{ address: 'business/net', message: 'Net does not equal savings minus cost', evidence: ['synthetic-input'] }], evidence: ['synthetic-input'], actualCost: { evaluations: 1 }, loss: { lower: pass ? 0 : 1, upper: pass ? 0 : 1, unit: 'inconsistent-equations' } };
    },
  }],
};
const modules = [arithmetic, renderedLegibilityModule(data => data.render)];
const required = ['business.net', 'render.geometry', 'render.fold-budget'];
// Optional local Isogloss build. Loading it invokes its real deterministic foldReport; no API calls.
if (process.env.ISOGLOSS_MODULE) {
  const engine = await import(pathToFileURL(process.env.ISOGLOSS_MODULE).href);
  modules.push(isoglossModule(engine, { terms: [], cap: 4, foldWords: 180, engineVersion: process.env.ISOGLOSS_VERSION || 'local-explicit-build' }));
  required.push('isogloss.text-folds');
}
modules.push({ id: 'communication', version: '1', includes: modules.map(module => module.id), assertions: [] });
export default {
  modules, selected: ['communication'], policy: { required, advisory: [] },
  input: { artifact: { id: 'synthetic-business-case', digest: artifactDigest, data: { ...content, render } }, environmentDigest },
  budget: { evaluations: 8 },
  available: { schemas: ['example.business-case/v1', 'quality-sgd.render-evidence/v2', 'quality-sgd.text/v1'], capabilities: ['render-capture', 'semantic-fold-inventory', 'audience-lexicon'] },
};
