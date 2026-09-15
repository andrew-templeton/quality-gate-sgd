import { describe, expect, it } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { compileGate } from '../../src/v2/catalog.js';
import { evaluateGate } from '../../src/v2/evaluate.js';
import { renderedLegibilityModule, RENDER_INPUT, type RenderEvidence, type RenderPolicy } from '../../src/v2/modules.js';
import type { CompiledGate } from '../../src/v2/types.js';

function policy(): RenderPolicy {
  return { version: 'reader-1', views: [
    { id: 'desktop:closed', maxTotal: 3, maxNovel: 1 },
    { id: 'mobile:expanded', maxTotal: 2, maxNovel: 1 },
  ] };
}

function report(): RenderEvidence {
  return { artifactDigest: 'same-content', environmentDigest: 'same-reader', screenshotDigest: 'measured-views',
    views: ['desktop:closed', 'mobile:expanded'].map(id => ({ id, defects: [],
      folds: [{ id: 'top', quanta: ['price', 'condition', 'risk'], novel: ['condition'], unexplained: [] }],
    })),
  };
}

function compile(renderPolicy = policy()): CompiledGate {
  return compileGate([renderedLegibilityModule({ policy: renderPolicy })], ['rendered-legibility'], {
    required: ['render.geometry', 'render.fold-budget'], advisory: [],
  });
}

function evaluate(gate: CompiledGate, measurements = report()) {
  return evaluateGate(gate, {
    artifact: { id: 'proposal', digest: 'same-content', data: measurements }, environmentDigest: 'same-reader', available: RENDER_INPUT,
  }, new BudgetLedger({ evaluations: 10 }));
}

describe('trusted render policy', () => {
  it('applies independent per-view caps from the compiled policy', async () => {
    const gate = compile();
    const result = await evaluate(gate);
    expect(result.status).toBe('fail');
    expect(result.results.find(value => value.assertionId === 'render.fold-budget')?.findings).toMatchObject([
      { address: 'mobile:expanded/top', message: 'Total 3/2; novel 1/1; unexplained none' },
    ]);

    const improved = report();
    improved.views[1].folds[0].quanta.pop();
    expect((await evaluate(gate, improved)).status).toBe('pass');
    const stricterNovelty = policy();
    stricterNovelty.views[1].maxNovel = 0;
    expect((await evaluate(compile(stricterNovelty), improved)).status).toBe('fail');
  });

  it('cannot turn the same content into a pass by attaching larger candidate-owned caps', async () => {
    const gate = compile();
    const baseline = await evaluate(gate);
    const tampered = report();
    Object.assign(tampered.views[1].folds[0], { maxTotal: 100, maxNovel: 100 });
    const candidate = await evaluate(gate, tampered);
    expect(baseline.status).toBe('fail');
    expect(candidate.status).toBe('unavailable');
    expect(candidate.contractDigest).toBe(baseline.contractDigest);
    expect(candidate.artifactDigest).toBe(baseline.artifactDigest);
    expect(candidate.results.some(value => /unexpected property/.test(value.reason ?? ''))).toBe(true);
  });

  it('cannot turn the same content into a pass by dropping a failing view or redefining required views', async () => {
    const gate = compile();
    const baseline = await evaluate(gate);
    const incomplete = report();
    incomplete.views.pop();
    const missing = await evaluate(gate, incomplete);
    expect(missing.status).toBe('unavailable');
    expect(missing.contractDigest).toBe(baseline.contractDigest);

    Object.assign(incomplete, { requiredViews: ['desktop:closed'] });
    expect((await evaluate(gate, incomplete)).status).toBe('unavailable');
  });

  it('requires exact policy coverage, including view identities and unique measurements', async () => {
    const gate = compile();
    for (const change of [
      (value: RenderEvidence) => { value.views[1].id = 'unrequired-view'; },
      (value: RenderEvidence) => { value.views[1].id = value.views[0].id; },
      (value: RenderEvidence) => { value.views.push({ ...structuredClone(value.views[0]), id: 'extra-view' }); },
      (value: RenderEvidence) => { value.views[1].folds = []; },
    ]) {
      const invalid = report();
      change(invalid);
      expect((await evaluate(gate, invalid)).status).toBe('unavailable');
    }
  });

  it('captures policy independently of subsequent caller mutation', async () => {
    const supplied = policy();
    const module = renderedLegibilityModule({ policy: supplied });
    supplied.views[1].maxTotal = 100;
    const gate = compileGate([module], ['rendered-legibility'], {
      required: ['render.geometry', 'render.fold-budget'], advisory: [],
    });
    const originalDigest = gate.digest;
    supplied.views.pop();
    supplied.views[0].maxNovel = 100;
    supplied.version = 'caller-revised';

    expect((await evaluate(gate)).status).toBe('fail');
    const missing = report();
    missing.views.pop();
    expect((await evaluate(gate, missing)).status).toBe('unavailable');
    expect(gate.digest).toBe(originalDigest);
    expect(gate.digest).toBe(compile().digest);
  });

  it('changes module/card identities and the contract when any policy authority changes', async () => {
    const original = compile();
    for (const change of [
      (value: RenderPolicy) => { value.version = 'reader-2'; },
      (value: RenderPolicy) => { value.views[1].maxTotal = 3; },
      (value: RenderPolicy) => { value.views[1].maxNovel = 2; },
      (value: RenderPolicy) => { value.views[1].id = 'mobile:closed'; },
      (value: RenderPolicy) => { value.views.pop(); },
    ]) {
      const revised = policy();
      change(revised);
      const gate = compile(revised);
      expect(gate.digest).not.toBe(original.digest);
      expect(gate.modules).not.toEqual(original.modules);
      expect(gate.assertions.map(value => value.contract?.evaluatorDigest)).not.toEqual(original.assertions.map(value => value.contract?.evaluatorDigest));
      expect((await evaluate(gate)).contractDigest).not.toBe((await evaluate(original)).contractDigest);
    }
  });

  it.each([
    { version: '', views: [{ id: 'desktop', maxTotal: 2, maxNovel: 1 }] },
    { version: '1', views: [] },
    { version: '1', views: [{ id: '', maxTotal: 2, maxNovel: 1 }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: 2, maxNovel: 1 }, { id: 'desktop', maxTotal: 2, maxNovel: 1 }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: -1, maxNovel: 1 }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: 1.5, maxNovel: 1 }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: 2, maxNovel: NaN }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: Infinity, maxNovel: 1 }] },
    { version: '1', views: [{ id: 'desktop', maxTotal: Number.MAX_SAFE_INTEGER + 1, maxNovel: 1 }] },
  ])('rejects invalid trusted policy before any evaluation: %j', invalid => {
    expect(() => compile(invalid)).toThrow();
  });
});
