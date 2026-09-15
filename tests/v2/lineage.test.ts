import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetLedger } from '../../src/v2/budget.js';
import { DurableRun } from '../../src/v2/durability.js';
import { bindInput, defineAssertion, defineOutput, schema } from '../../src/v2/contracts.js';
import { compileGate } from '../../src/v2/catalog.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { digest } from '../../src/v2/validation.js';
import { compareLineageGraphs, compileLineageGraph, contentLineageNode, createLineageReceipt, lineageEnvironmentDigest, qualityAddress, reuseLineageReceipt, validateLineageGraph, validateQualityAddress, type LineageNode, type LineageReceipt } from '../../src/v2/lineage.js';

const addresses = {
  source: qualityAddress('artifact', 'example', 'page.html'), asset: qualityAddress('artifact', 'example', 'panel.css'),
  data: qualityAddress('claim', 'example', 'value-model'), render: qualityAddress('component', 'example', 'decision-panel'),
  audience: qualityAddress('artifact', 'example', 'audience'), policy: qualityAddress('artifact', 'example', 'policy'), view: qualityAddress('artifact', 'example', 'viewport'),
  evaluator: qualityAddress('assertion', 'example', 'geometry'), independent: qualityAddress('claim', 'example', 'independent-arithmetic'),
};
const evaluatorDigest = digest({ implementation: 'geometry-v1', policy: 'fixed-v1' });
const expected = { subject: addresses.render, evaluator: addresses.evaluator, evaluatorDigest, inputDigest: digest('scoped-render-input'), schemaDigest: digest('geometry-observation/v1') };
function nodes(content = '<main>Decision</main>', css = '.panel { display: grid; }'): LineageNode[] {
  return [
    contentLineageNode({ address: addresses.source, kind: 'source', content }),
    contentLineageNode({ address: addresses.asset, kind: 'asset', content: css }),
    contentLineageNode({ address: addresses.data, kind: 'derived', content: { value: 5 }, dependencies: [addresses.source] }),
    contentLineageNode({ address: addresses.view, kind: 'view', content: { width: 1440, height: 900, state: 'open' } }),
    contentLineageNode({ address: addresses.policy, kind: 'policy', content: { maxTotal: 7, maxNovel: 2 } }),
    contentLineageNode({ address: addresses.audience, kind: 'audience', content: { background: ['business'] } }),
    contentLineageNode({ address: addresses.render, kind: 'render', content: 'rendered-report-v1', dependencies: [addresses.source, addresses.asset, addresses.data, addresses.view] }),
    { address: addresses.evaluator, kind: 'evaluator', contentDigest: evaluatorDigest, configurationDigest: digest(null), availability: 'available', reason: null, dependencies: [addresses.audience, addresses.policy] },
    contentLineageNode({ address: addresses.independent, kind: 'derived', content: { twoPlusTwo: 4 } }),
  ];
}
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('canonical shared addresses and transitive identities', () => {
  it('uses stable escaped addresses for findings, components, claims and assertions', () => {
    const value = qualityAddress('component', 'example', 'sales case', 'section/one');
    expect(value).toBe('quality://component/example/sales%20case/section%2Fone');
    expect(() => validateQualityAddress(value)).not.toThrow();
    for (const invalid of ['quality://component//x', 'quality://component/example/..', 'quality://component/example/sales case', 'quality://other/example', 'quality://claim/example/%ZZ']) expect(() => validateQualityAddress(invalid)).toThrow();
    expect(() => qualityAddress('claim', '..')).toThrow();
  });
  it('snapshots canonical topology without depending on declaration or edge order', () => {
    const input = structuredClone(nodes());
    const graph = compileLineageGraph(input);
    const reordered = [...input].reverse().map(node => ({ ...node, dependencies: [...node.dependencies].reverse() }));
    expect(compileLineageGraph(reordered)).toEqual(graph);
    input[0].contentDigest = digest('later mutation'); input[6].dependencies.length = 0;
    expect(graph.nodes.find(node => node.address === addresses.source)?.contentDigest).not.toBe(input[0].contentDigest);
    expect(Object.isFrozen(graph.nodes[0].dependencyRevisions)).toBe(true);
    expect(() => validateLineageGraph(graph)).not.toThrow();
  });
  it('rejects missing dependencies, duplicate addresses, self edges and cycles', () => {
    expect(() => compileLineageGraph(nodes().filter(node => node.address !== addresses.asset))).toThrow(/Missing lineage dependency/);
    expect(() => compileLineageGraph([...nodes(), nodes()[0]])).toThrow(/Duplicate lineage address/);
    for (const target of [addresses.source, addresses.render]) {
      const input = structuredClone(nodes()); input[0].dependencies = [target];
      expect(() => compileLineageGraph(input)).toThrow(/cycle/);
    }
  });
  it('detects corrupt derived graph revisions even when an outer digest is recomputed', () => {
    const graph = structuredClone(compileLineageGraph(nodes()));
    graph.nodes[0].revisionDigest = digest('forged');
    const { digest: previous, ...body } = graph;
    graph.digest = digest(body); expect(graph.digest).not.toBe(previous);
    expect(() => validateLineageGraph(graph)).toThrow(/integrity|derived revisions/);
  });
});

describe('scoped receipt reuse', () => {
  it('reuses unchanged evidence but rejects missing, altered and differently scoped receipts', () => {
    const graph = compileLineageGraph(nodes());
    const value = { overlaps: 0 };
    const receipt = createLineageReceipt(graph, expected, value);
    value.overlaps = 9;
    expect(reuseLineageReceipt(graph, receipt, expected)).toEqual({ status: 'reusable', value: { overlaps: 0 } });
    expect(reuseLineageReceipt(graph, null, expected).status).toBe('unavailable');
    const corrupt = structuredClone(receipt); corrupt.value.overlaps = 1;
    expect(reuseLineageReceipt(graph, corrupt, expected)).toMatchObject({ status: 'unavailable', reason: 'Lineage receipt integrity mismatch' });
    for (const field of ['inputDigest', 'schemaDigest'] as const) expect(reuseLineageReceipt(graph, receipt, { ...expected, [field]: digest('changed') }).status).toBe('unavailable');
    expect(reuseLineageReceipt(graph, receipt, { ...expected, evaluatorDigest: digest('different-implementation') }).status).toBe('unavailable');
  });
  it.each(['source', 'asset', 'audience', 'policy', 'view', 'evaluator'] as const)('invalidates current receipts after a changed %s', field => {
    const before = compileLineageGraph(nodes());
    const receipt = createLineageReceipt(before, expected, { overlaps: 0 });
    const input = structuredClone(nodes()); const modified = input.find(node => node.address === addresses[field]);
    if (!modified) throw new Error('Missing test node');
    modified.contentDigest = digest(`changed-${field}`);
    const after = compileLineageGraph(input);
    const requirements = field === 'evaluator' ? { ...expected, evaluatorDigest: modified.contentDigest } : expected;
    expect(reuseLineageReceipt(after, receipt, requirements).status).toBe('unavailable');
    expect(lineageEnvironmentDigest(after, [addresses.render, addresses.evaluator])).not.toBe(lineageEnvironmentDigest(before, [addresses.render, addresses.evaluator]));
  });
  it('rejects dependency-edge and configuration changes even when content is unchanged', () => {
    const before = compileLineageGraph(nodes()); const receipt = createLineageReceipt(before, expected, { overlaps: 0 });
    const configured = structuredClone(nodes());
    const configuredRender = configured.find(node => node.address === addresses.render);
    if (!configuredRender) throw new Error('Missing render');
    configuredRender.configurationDigest = digest('changed-render-options');
    expect(reuseLineageReceipt(compileLineageGraph(configured), receipt, expected).status).toBe('unavailable');
    const rewired = structuredClone(nodes());
    const render = rewired.find(node => node.address === addresses.render);
    if (!render) throw new Error('Missing render'); render.dependencies.push(addresses.independent);
    expect(reuseLineageReceipt(compileLineageGraph(rewired), receipt, expected).status).toBe('unavailable');
  });
  it('preserves independent branch reuse after an actual child asset changes without parent edits', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lineage-files-')); directories.push(directory);
    const page = join(directory, 'page.html'), css = join(directory, 'panel.css');
    writeFileSync(page, '<main>Decision</main>'); writeFileSync(css, '.panel { display: grid; }');
    const read = () => compileLineageGraph(nodes(readFileSync(page, 'utf8'), readFileSync(css, 'utf8')));
    const before = read(); const receipt = createLineageReceipt(before, expected, { overlaps: 0 });
    const independentExpected = { ...expected, subject: addresses.independent, inputDigest: digest({ twoPlusTwo: 4 }) };
    const independentReceipt = createLineageReceipt(before, independentExpected, { result: 4 });
    const oldParent = readFileSync(page, 'utf8'); writeFileSync(css, '.panel { position: absolute; }');
    const after = read(); const difference = compareLineageGraphs(before, after);
    expect(readFileSync(page, 'utf8')).toBe(oldParent);
    expect(difference.changed).toEqual([addresses.asset]); expect(difference.invalidated).toContain(addresses.render);
    expect(difference.reusable).toContain(addresses.independent); expect(difference.reusable).toContain(addresses.source);
    expect(reuseLineageReceipt(after, receipt, expected).status).toBe('unavailable');
    expect(reuseLineageReceipt(after, independentReceipt, independentExpected)).toEqual({ status: 'reusable', value: { result: 4 } });
  });
  it('propagates unavailable source content and rejects disappeared subjects', () => {
    const before = compileLineageGraph(nodes()); const receipt = createLineageReceipt(before, expected, { overlaps: 0 });
    const pending = nodes().map(node => node.address === addresses.asset ? { ...node, availability: 'unavailable' as const, contentDigest: null, reason: 'Required asset was not collected' } : node);
    const unavailable = compileLineageGraph(pending);
    expect(unavailable.nodes.find(node => node.address === addresses.render)?.unavailableDependencies).toEqual([addresses.asset]);
    expect(reuseLineageReceipt(unavailable, receipt, expected).status).toBe('unavailable');
    expect(() => createLineageReceipt(unavailable, expected, { overlaps: 0 })).toThrow(/unavailable/);
    expect(() => lineageEnvironmentDigest(unavailable, [addresses.render])).toThrow(/unavailable/);
    const independentExpected = { ...expected, subject: addresses.independent };
    const independent = createLineageReceipt(before, independentExpected, { result: 4 });
    const removed = compileLineageGraph(nodes().filter(node => node.address !== addresses.independent));
    expect(reuseLineageReceipt(removed, independent, independentExpected).status).toBe('unavailable');
    expect(compareLineageGraphs(before, removed).removed).toEqual([addresses.independent]);
  });
  it('does not let unrelated roots change a selected environment identity', () => {
    const before = compileLineageGraph(nodes()); const input = structuredClone(nodes()); input[input.length - 1].contentDigest = digest('different-arithmetic-branch');
    const after = compileLineageGraph(input);
    expect(after.digest).not.toBe(before.digest);
    expect(lineageEnvironmentDigest(after, [addresses.render, addresses.evaluator])).toBe(lineageEnvironmentDigest(before, [addresses.evaluator, addresses.render]));
    expect(() => lineageEnvironmentDigest(before, [])).toThrow(/at least one/);
  });
});

describe('durable and typed evidence integration', () => {
  it('rejects resumed stale assets, retains spending and requires explicit rebaseline', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lineage-resume-')); directories.push(directory);
    const path = join(directory, 'run.json');
    const before = compileLineageGraph(nodes()), after = compileLineageGraph(nodes(undefined, 'changed child asset'));
    const environmentDigest = lineageEnvironmentDigest(before, [addresses.render, addresses.evaluator]);
    const changedEnvironment = lineageEnvironmentDigest(after, [addresses.render, addresses.evaluator]);
    const contractDigest = digest('fixed-gate-contract'); const limits = { evaluations: 5 };
    let run: DurableRun | undefined;
    try {
      run = DurableRun.open({ path, contractDigest, environmentDigest, limits });
      const receipt = createLineageReceipt(before, expected, { overlaps: 0 });
      run.saveCheckpoint({ receipt }); run.budget.reserve('previous-check', { evaluations: 1 }); run.budget.settle('previous-check', { evaluations: 1 }); run.close(); run = undefined;
      expect(() => DurableRun.open({ path, contractDigest, environmentDigest: changedEnvironment, limits })).toThrow(/contract\/environment changed/);
      run = DurableRun.open({ path, contractDigest, environmentDigest, limits });
      const checkpoint = run.readCheckpoint<{ receipt: LineageReceipt }>();
      expect(run.budget.snapshot().spent).toEqual({ evaluations: 1 });
      expect(reuseLineageReceipt(after, checkpoint?.receipt, expected).status).toBe('unavailable');
      run.rebaseline({ contractDigest, environmentDigest: changedEnvironment, reason: 'Recollect changed child asset and render' });
      expect(run.budget.snapshot().spent).toEqual({ evaluations: 1 }); expect(run.readCheckpoint()).toBeUndefined();
      expect(run.snapshot().archives[0].checkpoint).toEqual(checkpoint);
    } finally { run?.close(); }
  });
  it('can preserve an engine-created typed output envelope without changing its producer lineage', async () => {
    const input = bindInput({ schemaId: 'lineage.source', schemaVersion: '1', schema: schema.object({ value: schema.number() }) });
    const output = defineOutput({ schemaId: 'lineage.total', schemaVersion: '1', schema: schema.object({ doubled: schema.number() }) });
    const assertion = defineAssertion({
      card: { id: 'lineage.fixture', version: '1', title: 'Lineage fixture', path: ['measurement', 'arithmetic'], claim: 'Double the supplied number.', input: { schemas: ['lineage.source@1'], capabilities: [], description: 'Synthetic numeric input.' }, evidenceKind: 'deterministic', assumptions: ['Input is the intended number.'], guarantees: ['Specified arithmetic.'], doesNotGuarantee: ['Source provenance.'], requires: [], costUpperBound: { evaluations: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic arithmetic fixture.' } },
      implementation: { id: 'lineage.fixture', version: '1', digest: digest('fixture-build') }, configuration: {}, applicability: { fixture: true }, input, output,
      async evaluate(_context, value) { return { status: 'pass', findings: [], evidence: ['fixture-arithmetic'], actualCost: { evaluations: 1 }, output: { doubled: value.value * 2 } }; },
    });
    const module = { id: 'lineage-fixture', version: '1', includes: [], assertions: [assertion] };
    const result = await evaluateGate(compileGate([module], [module.id], { required: [assertion.card.id], advisory: [] }), { artifact: { id: 'source', digest: digest({ value: 5 }), data: { value: 5 } }, environmentDigest: 'fixture', available: { schemas: ['lineage.source@1'], capabilities: [] } }, new BudgetLedger({ evaluations: 1 }));
    const envelope = result.results[0].outputEvidence; if (!envelope) throw new Error('Typed output envelope missing');
    const inputNodes = nodes().map(node => node.address === addresses.evaluator ? { ...node, contentDigest: envelope.evaluatorDigest } : node);
    const graph = compileLineageGraph(inputNodes);
    const required = { ...expected, evaluatorDigest: envelope.evaluatorDigest, inputDigest: envelope.inputDigest, schemaDigest: envelope.schemaDigest };
    const receipt = createLineageReceipt(graph, required, envelope);
    const reused = reuseLineageReceipt(graph, receipt, required);
    expect(reused).toEqual({ status: 'reusable', value: envelope });
    if (reused.status === 'reusable') expect(reused.value.digest).toBe(envelope.digest);
    expect(reuseLineageReceipt(graph, receipt, { ...required, inputDigest: digest('different-execution-input') }).status).toBe('unavailable');
  });
});
