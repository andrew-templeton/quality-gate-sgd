import { expect, it } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { digest } from '../../src/v2/validation.js';
import { SURFACE_INPUT, SURFACE_OUTPUT, surfaceEvidenceModule, surfaceRenderDigest, surfaceVisible, surfaceWindowStarts, surfaceWindows, validateSurfacePolicy, type SurfaceEvidence, type SurfacePolicy } from '../../src/v2/surfaces.js';

function fixture(): { policy: SurfacePolicy; report: SurfaceEvidence } {
  const policy: SurfacePolicy = { version: 'mechanics-fixture-only', collectorDigest: digest('collector'), scrollModel: 'integer-css-pixels', knownConcepts: [],
    elements: [{ id: 'cost', address: 'claim/cost', text: 'Cost is $40.', concepts: [], defines: [] }, { id: 'condition', address: 'claim/condition', text: 'Join means matching records.', concepts: ['join'], defines: ['join'] }],
    states: [{ id: 'entry', route: '/decision', viewport: { width: 200, height: 100 }, input: 'keyboard', interaction: 'closed', requiredElements: ['cost', 'condition'], entryElements: ['cost'], actions: [], maxTotal: 2, maxNovel: 1, minFontPx: 16, minTargetPx: 44, maxBlankGapPx: 100, maxScrollScreens: 2 }] };
  const sourceDigest = digest('html'), dataDigest = digest({ cost: 40 });
  const state: SurfaceEvidence['states'][number] = { id: 'entry', route: '/decision', viewport: { width: 200, height: 100 }, input: 'keyboard', interaction: 'closed', complete: true, unavailable: [], documentHeight: 200, chromeHeight: 20,
    scrollProbes: [0.25, 0.5, 0.75, 1.25, 1.5, 1.75].map(requested => ({ requested, observed: Math.round(requested) })), anchors: [{ id: 'natural-section', top: 60 }],
    elements: policy.elements.map((item, index) => ({ id: item.id, address: item.address, text: item.text, fontPx: 16, rects: [{ x: 10, y: index ? 115 : 85, width: 160, height: 20 }] })),
    windows: [], interactions: [], defects: [], captures: [{ id: 'entry', scrollTop: 0, digest: digest('pixel bytes fixture'), path: 'fixture.png' }] };
  state.windows = surfaceWindowStarts(state).map(scrollTop => ({ id: `window/${scrollTop}`, scrollTop, visible: surfaceVisible(state, scrollTop) }));
  const body: Omit<SurfaceEvidence, 'renderDigest'> = { protocol: 'quality-sgd.surface-evidence/v1', scrollModel: 'integer-css-pixels', artifactDigest: digest({ sourceDigest, dataDigest }), environmentDigest: digest('browser'), sourceDigest, dataDigest, collectorDigest: policy.collectorDigest, policyDigest: digest(policy), browser: 'explicit synthetic mechanism fixture', states: [state] };
  return { policy, report: { ...body, renderDigest: surfaceRenderDigest(body) } };
}
function seal(value: ReturnType<typeof fixture>): ReturnType<typeof fixture> {
  value.report.policyDigest = digest(value.policy);
  for (const state of value.report.states) state.windows = surfaceWindowStarts(state).map(scrollTop => ({ id: `window/${scrollTop}`, scrollTop, visible: surfaceVisible(state, scrollTop) }));
  value.report.renderDigest = surfaceRenderDigest(value.report); return value;
}
async function evaluate({ policy, report }: ReturnType<typeof fixture>) {
  const module = surfaceEvidenceModule({ policy });
  const gate = compileGate([module], [module.id], { required: module.assertions.map(assertion => assertion.card.id), advisory: [] });
  return evaluateGate(gate, { artifact: { id: 'fixture', digest: report.artifactDigest, data: report }, environmentDigest: report.environmentDigest, available: SURFACE_INPUT }, new BudgetLedger({ evaluations: 4 }));
}

it('preserves partial visible membership and finds an overloaded window between disjoint bins', async () => {
  const value = fixture();
  expect(surfaceVisible(value.report.states[0], 0)).toEqual(['cost']);
  expect(surfaceVisible(value.report.states[0], 100)).toEqual(['condition']);
  expect(surfaceVisible(value.report.states[0], 50)).toEqual(['condition', 'cost']);
  expect(surfaceWindowStarts(value.report.states[0])).toContain(40); // Natural section minus sticky chrome.
  value.policy.states[0].maxTotal = 1;
  const result = await evaluate(seal(value));
  expect(result.status).toBe('fail');
  expect(result.results.find(result => result.assertionId === 'surface.total-budget')?.findings.some(value => value.message.includes('condition, cost'))).toBe(true);
});

it('uses fractional text boundaries conservatively around verified integer scroll positions', () => {
  const { report } = fixture(); const state = report.states[0];
  state.elements[0].rects[0].y = 85.49; state.elements[1].rects[0].y = 115.51;
  const starts = surfaceWindowStarts(state);
  expect(starts).toEqual(expect.arrayContaining([15, 16, 85, 86]));
  for (let top = 0; top <= 100; top++) expect(starts.some(start => digest(surfaceVisible(state, start)) === digest(surfaceVisible(state, top)))).toBe(true);
});

it('counts a long element in each intersecting window and excludes fragments hidden by sticky chrome', () => {
  const { policy, report } = fixture(); const state = report.states[0];
  state.elements[0].rects = [{ x: 10, y: 0, width: 160, height: 10 }, { x: 10, y: 40, width: 160, height: 120 }];
  expect(surfaceVisible(state, 0)).toEqual(['cost']);
  expect(surfaceVisible(state, 100)).toEqual(['condition', 'cost']);
  const hiddenOnly = structuredClone(state); hiddenOnly.elements[0].rects.pop();
  expect(surfaceVisible(hiddenOnly, 0)).toEqual([]);
  seal({ policy, report });
  const folds = surfaceWindows(state, policy);
  expect(folds.every(window => window.total.filter(id => id === 'cost').length <= 1)).toBe(true);
  expect(folds.filter(window => window.total.includes('cost')).length).toBeGreaterThan(1);
});

it('separates geometry, semantic preservation, total density and novel concepts', async () => {
  const passing = fixture(); const passed = await evaluate(passing);
  expect(passed.status).toBe('pass');
  expect(passed.results.every(result => result.outputEvidence?.schemaDigest === digest(SURFACE_OUTPUT) && (result.outputEvidence?.value as { renderDigest: string }).renderDigest === passing.report.renderDigest)).toBe(true);
  const value = fixture(); value.report.states[0].elements[0].fontPx = 9;
  const result = await evaluate(seal(value));
  expect(result.results.map(result => [result.assertionId, result.status])).toEqual([
    ['surface.geometry', 'fail'], ['surface.inventory', 'pass'], ['surface.total-budget', 'pass'], ['surface.novel-budget', 'pass'],
  ]);
  expect(result.results[0].outputEvidence).toBeUndefined();
});

it('rejects missing states, windows, interactions, screenshots and unsupported fractional scrolling as unavailable', async () => {
  for (const mutate of [
    (report: SurfaceEvidence) => { report.states = []; },
    (report: SurfaceEvidence) => { report.states[0].windows.splice(1, 1); },
    (report: SurfaceEvidence) => { report.states[0].captures = []; },
    (report: SurfaceEvidence) => { report.states[0].scrollProbes[0].observed = 0.25; },
    (report: SurfaceEvidence) => { report.states[0].complete = false; report.states[0].unavailable = ['Font failed to load']; },
  ]) {
    const value = fixture(); mutate(value.report); value.report.renderDigest = surfaceRenderDigest(value.report);
    expect((await evaluate(value)).status).toBe('unavailable');
  }
  const value = fixture(); value.policy.states[0].actions = ['cost']; seal(value);
  expect((await evaluate(value)).status).toBe('unavailable');
});

it('does not trust candidate-provided caps, grouping, novelty or truncated visible membership', async () => {
  for (const field of ['maxTotal', 'maxNovel', 'groupedAsOne', 'knownConcepts']) {
    const value = fixture(); Object.assign(value.report, { [field]: 999 }); value.report.renderDigest = surfaceRenderDigest(value.report);
    expect((await evaluate(value)).status).toBe('unavailable');
  }
  const value = fixture(); value.report.states[0].windows.find(window => window.visible.length === 2)?.visible.pop(); value.report.renderDigest = surfaceRenderDigest(value.report);
  expect((await evaluate(value)).status).toBe('unavailable');
});

it('makes missing definitions fail the novel facet without claiming learned familiarity', async () => {
  const value = fixture(); value.policy.elements[1].defines = [];
  const result = await evaluate(seal(value));
  expect(result.results.find(result => result.assertionId === 'surface.novel-budget')?.status).toBe('fail');
  expect(result.results.find(result => result.assertionId === 'surface.total-budget')?.status).toBe('pass');
});

it('rejects padding through scrolling/entry obligations even when it lowers visible counts', async () => {
  const value = fixture(); const state = value.report.states[0];
  state.elements[0].rects[0].y = 500; state.documentHeight = 600;
  const result = await evaluate(seal(value));
  expect(result.results.find(result => result.assertionId === 'surface.geometry')?.findings.some(value => /Scroll burden|blank gap/.test(value.message))).toBe(true);
  expect(result.results.find(result => result.assertionId === 'surface.inventory')?.findings.some(value => value.message.includes('entry viewport'))).toBe(true);
});

it('invalidates changed source, policy, collector, environment and render content', async () => {
  for (const field of ['sourceDigest', 'collectorDigest', 'policyDigest', 'renderDigest'] as const) {
    const value = fixture(); value.report[field] = digest('changed');
    if (field !== 'renderDigest') value.report.renderDigest = surfaceRenderDigest(value.report);
    expect((await evaluate(value)).status).toBe('unavailable');
  }
  const value = fixture(); value.report.states[0].viewport.width++;
  value.report.renderDigest = surfaceRenderDigest(value.report);
  expect((await evaluate(value)).status).toBe('unavailable');
});

it('rejects unsupported policy fields and binds an immutable fixed policy into evaluator identity', () => {
  const value = fixture(); expect(() => validateSurfacePolicy({ ...value.policy, candidateLimit: 999 } as SurfacePolicy)).toThrow('unsupported');
  Object.assign(value.policy.states[0], { candidateLimit: 999 }); expect(() => validateSurfacePolicy(value.policy)).toThrow('unsupported');
  const clean = fixture(); const module = surfaceEvidenceModule({ policy: clean.policy }); const identity = module.assertions[0].contract?.evaluatorDigest;
  clean.policy.states[0].maxTotal = 999;
  expect(module.assertions[0].contract?.evaluatorDigest).toBe(identity);
  expect(surfaceEvidenceModule({ policy: clean.policy }).assertions[0].contract?.evaluatorDigest).not.toBe(identity);
});
