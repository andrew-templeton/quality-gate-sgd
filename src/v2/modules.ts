import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AssertionCard, AssertionModule, Cost, Observation } from './types.js';
import { bindInput, defineAssertion, schema } from './contracts.js';
import { digest, freezeJson, requireThat, text, unique } from './validation.js';

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
const implementation = {
  id: 'quality-sgd/rendered-legibility', version: '3',
  digest: createHash('sha256').update(['modules', 'contracts', 'validation'].map(name => readFileSync(new URL(`./${name}${extension}`, import.meta.url), 'utf8')).join('\n')).digest('hex'),
};
function card(id: string, title: string, path: string[], claim: string, limit: string, cost: Cost): AssertionCard {
  return { id, version: '3', title, path, claim, evidenceKind: 'deterministic',
    input: { schemas: ['quality-sgd.render-evidence@2'], capabilities: ['render-capture', 'semantic-fold-inventory'], description: 'A typed current render report, separately configured operator policy, and complete view/fold measurements.' },
    assumptions: ['Inputs are complete for the declared scope and tied to the current artifact revision.'],
    guarantees: [claim], doesNotGuarantee: [limit], requires: [], costUpperBound: cost,
    calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic predicate over supplied inputs, not empirical validity.' },
  };
}
function observed(failures: { address: string; message: string }[], evidence: string, cost: Cost): Observation {
  return { status: failures.length ? 'fail' : 'pass', findings: failures.map(failure => ({ ...failure, evidence: [evidence] })), evidence: [evidence],
    loss: { lower: failures.length, upper: failures.length, unit: 'violations' }, actualCost: { ...cost } };
}
export interface FoldMeasurement { id: string; quanta: string[]; novel: string[]; unexplained: string[] }
export interface RenderEvidence { artifactDigest: string; environmentDigest: string; screenshotDigest: string; views: { id: string; folds: FoldMeasurement[]; defects: { address: string; message: string }[] }[] }
export interface RenderPolicy { version: string; views: { id: string; maxTotal: number; maxNovel: number }[] }
export interface RenderModuleOptions { policy: RenderPolicy; reportPath?: string[]; costUpperBound?: Cost }
export const RENDER_INPUT = freezeJson({ schemas: ['quality-sgd.render-evidence@2'], capabilities: ['render-capture', 'semantic-fold-inventory'] });
const nonempty = schema.string({ minLength: 1 });
const reportSchema = schema.object({
  artifactDigest: nonempty, environmentDigest: nonempty, screenshotDigest: nonempty,
  views: schema.array(schema.object({
    id: nonempty,
    folds: schema.array(schema.object({ id: nonempty, quanta: schema.array(nonempty), novel: schema.array(nonempty), unexplained: schema.array(nonempty) }), { minItems: 1 }),
    defects: schema.array(schema.object({ address: nonempty, message: nonempty })),
  }), { minItems: 1 }),
});

/** Required views/caps and the report selector are snapshotted, versioned operator configuration. */
export function renderedLegibilityModule(options: RenderModuleOptions): AssertionModule {
  digest(options);
  const policy = freezeJson(structuredClone(options.policy));
  text(policy.version, 'Render policy version');
  requireThat(Array.isArray(policy.views) && policy.views.length > 0, 'Render policy requires views');
  unique(policy.views.map(view => view.id), 'Render policy view IDs');
  for (const view of policy.views) for (const cap of [view.maxTotal, view.maxNovel]) requireThat(Number.isSafeInteger(cap) && cap >= 0, 'Render policy caps must be nonnegative safe integers');
  const cost = { ...(options.costUpperBound ?? { evaluations: 1 }) };
  const configuration = { policy, cost };
  const input = bindInput({ schemaId: 'quality-sgd.render-evidence', schemaVersion: '2', schema: reportSchema, path: options.reportPath ?? [], capabilities: RENDER_INPUT.capabilities });
  const evidence = (report: RenderEvidence, artifact: string, environment: string, required: RenderPolicy): void => {
    requireThat(report.artifactDigest === artifact && report.environmentDigest === environment, 'Stale render identity');
    requireThat(report.views.length === required.views.length && new Set(report.views.map(view => view.id)).size === report.views.length && required.views.every(view => report.views.some(value => value.id === view.id)), 'Required view/state evidence incomplete');
    for (const view of report.views) unique(view.folds.map(fold => fold.id), 'Measured fold IDs');
  };
  const geometry = defineAssertion({
    card: card('render.geometry', 'Rendered geometry', ['communication', 'geometry'], 'All required supplied rendered states have no reported geometry defects.', 'Does not capture the browser or attest that the measurement collector found every overlap.', cost),
    implementation, configuration, applicability: { domain: 'supplied-render-reports' }, input,
    async evaluate(context, report, config) {
      evidence(report, context.artifact.digest, context.environmentDigest, config.policy);
      return observed(report.views.flatMap(view => view.defects), `render:${report.screenshotDigest};policy:${digest(config.policy)}`, config.cost);
    },
  });
  const folds = defineAssertion({
    card: card('render.fold-budget', 'Total and novel fold budgets', ['communication', 'legibility'], 'Every supplied fold fits the operator total/novel caps for its required view and has no unexplained first-use concepts.', 'Does not establish cognitive capacity, audience knowledge, or completeness of semantic annotations.', cost),
    implementation, configuration, applicability: { domain: 'supplied-render-reports' }, input,
    async evaluate(context, report, config) {
      evidence(report, context.artifact.digest, context.environmentDigest, config.policy);
      const failures: { address: string; message: string }[] = [];
      for (const view of report.views) {
        const limits = config.policy.views.find(required => required.id === view.id);
        requireThat(limits, 'Unrequired view');
        for (const fold of view.folds) {
          unique(fold.quanta, 'Fold inventory'); unique(fold.novel, 'Novel inventory'); unique(fold.unexplained, 'Unexplained inventory');
          requireThat(fold.novel.every(id => fold.quanta.includes(id)) && fold.unexplained.every(id => fold.novel.includes(id)), 'Novel/unexplained inventories must be nested subsets');
          if (fold.quanta.length > limits.maxTotal || fold.novel.length > limits.maxNovel || fold.unexplained.length) failures.push({ address: `${view.id}/${fold.id}`, message: `Total ${fold.quanta.length}/${limits.maxTotal}; novel ${fold.novel.length}/${limits.maxNovel}; unexplained ${fold.unexplained.join(', ') || 'none'}` });
        }
      }
      return observed(failures, `render:${report.screenshotDigest};policy:${digest(config.policy)}`, config.cost);
    },
  });
  return { id: 'rendered-legibility', version: digest([geometry.contract, folds.contract]), includes: [], assertions: [geometry, folds] };
}
