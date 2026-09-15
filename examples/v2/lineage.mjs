import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLineageGraph, compareLineageGraphs, contentLineageNode, createLineageReceipt, lineageEnvironmentDigest, qualityAddress, reuseLineageReceipt } from '../../dist/v2/lineage.js';
import { DurableRun } from '../../dist/v2/durability.js';
import { digest } from '../../dist/v2/validation.js';

const directory = mkdtempSync(join(tmpdir(), 'quality-lineage-example-'));
const source = qualityAddress('artifact', 'example', 'page.html');
const asset = qualityAddress('artifact', 'example', 'panel.css');
const render = qualityAddress('component', 'example', 'panel');
const arithmetic = qualityAddress('claim', 'example', 'independent-total');
const evaluator = qualityAddress('assertion', 'example', 'fixture-evaluator');
const evaluatorDigest = digest({ implementation: 'explicit-fixture-v1', policy: 'fixed-v1' });
const requirement = { subject: render, evaluator, evaluatorDigest, inputDigest: digest('fixture-render-input'), schemaDigest: digest('fixture-observation/v1') };
const roots = [render, evaluator];
const graph = () => compileLineageGraph([
  contentLineageNode({ address: source, kind: 'source', content: readFileSync(join(directory, 'page.html'), 'utf8') }),
  contentLineageNode({ address: asset, kind: 'asset', content: readFileSync(join(directory, 'panel.css'), 'utf8') }),
  contentLineageNode({ address: render, kind: 'render', content: { report: 'fixture-only' }, configuration: { width: 1440, height: 900, state: 'open' }, dependencies: [source, asset] }),
  contentLineageNode({ address: arithmetic, kind: 'derived', content: { total: 4 } }),
  { address: evaluator, kind: 'evaluator', contentDigest: evaluatorDigest, configurationDigest: digest(null), dependencies: [], availability: 'available', reason: null },
]);
let run;
try {
  writeFileSync(join(directory, 'page.html'), '<main class="panel">Decision</main>');
  writeFileSync(join(directory, 'panel.css'), '.panel { display: grid; }');
  const parentBefore = readFileSync(join(directory, 'page.html'), 'utf8');
  const before = graph();
  const receipt = createLineageReceipt(before, requirement, { overlaps: 0, evidence: 'explicit-fixture-only' });
  const independentRequirement = { ...requirement, subject: arithmetic, inputDigest: digest({ two: 2 }) };
  const independent = createLineageReceipt(before, independentRequirement, { total: 4 });
  const path = join(directory, 'run.json');
  const contractDigest = digest('fixture-gate'); const limits = { evaluations: 3 };
  const environmentDigest = lineageEnvironmentDigest(before, roots);
  run = DurableRun.open({ path, contractDigest, environmentDigest, limits });
  run.saveCheckpoint({ receipt });
  run.budget.reserve('fixture-check', { evaluations: 1 }); run.budget.settle('fixture-check', { evaluations: 1 }); run.close(); run = undefined;

  writeFileSync(join(directory, 'panel.css'), '.panel { position: absolute; }');
  const after = graph(); const currentEnvironment = lineageEnvironmentDigest(after, roots);
  const parentUnchanged = readFileSync(join(directory, 'page.html'), 'utf8') === parentBefore;
  const stale = reuseLineageReceipt(after, receipt, requirement);
  const retained = reuseLineageReceipt(after, independent, independentRequirement);
  assert.equal(parentUnchanged, true); assert.equal(stale.status, 'unavailable'); assert.equal(retained.status, 'reusable');
  assert.throws(() => DurableRun.open({ path, contractDigest, environmentDigest: currentEnvironment, limits }), /contract\/environment changed/);
  run = DurableRun.open({ path, contractDigest, environmentDigest, limits });
  run.rebaseline({ contractDigest, environmentDigest: currentEnvironment, reason: 'Child asset changed; recollect affected evidence' });
  assert.equal(run.budget.snapshot().spent.evaluations, 1);
  console.log(JSON.stringify({ fixture: 'dependency invalidation; no browser measurement', parentUnchanged, ...compareLineageGraphs(before, after),
    oldRenderReceipt: stale.status, independentReceipt: retained.status, staleResume: 'rejected', spendingAfterExplicitRebaseline: run.budget.snapshot().spent }, null, 2));
} finally { run?.close(); rmSync(directory, { recursive: true, force: true }); }
