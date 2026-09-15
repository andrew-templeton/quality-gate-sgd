import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { BudgetLedger, compileGate, evaluateGate, surfaceEvidenceModule, surfaceRenderDigest, SURFACE_INPUT, surfaceVisible } from 'quality-gate-sgd';
import { captureFixture } from './run.mjs';

let browser; const results = new Map();
before(async () => { browser = await chromium.launch(); });
after(async () => {
  if (results.size) await writeFile(resolve('artifacts', 'browser-test-summary.json'), `${JSON.stringify({ browser: browser.version(), collectedAt: new Date().toISOString(), fixtures: [...results.values()].map(value => value.summary) }, null, 2)}\n`);
  await browser?.close();
});
async function capture(variant) {
  if (!results.has(variant)) results.set(variant, await captureFixture(variant, { browser, outputDir: resolve('artifacts', variant) }));
  return results.get(variant);
}
const facet = (result, id) => result.evaluation.results.find(value => value.assertionId === `surface.${id}`);

test('real Chromium baseline and improved states use the same trusted caps and preserve all independent elements', { timeout: 120000 }, async () => {
  const baseline = await capture('baseline'), improved = await capture('improved');
  assert.equal(baseline.evaluation.status, 'fail');
  assert.equal(facet(baseline, 'total-budget').status, 'fail');
  assert.equal(improved.evaluation.status, 'pass', JSON.stringify(improved.summary));
  assert.deepEqual(baseline.policy, improved.policy);
  assert.equal(improved.report.states.length, 6);
  assert.ok(improved.report.states.every(state => state.complete && !state.unavailable.length));
  assert.ok(improved.report.states.filter(state => state.interaction === 'open').every(state => state.elements.filter(element => element.rects.length).length === 12));
  assert.ok(improved.report.states.filter(state => state.interaction === 'closed').every(state => state.elements.filter(element => element.rects.length).length === 7));
  assert.ok(improved.report.states.some(state => state.route.includes('?disclosure=')));
  assert.ok(improved.report.states.some(state => state.input === 'touch'));
  for (const state of improved.report.states) {
    assert.equal(state.chromeHeight, 56);
    for (const trace of state.interactions) {
      assert.ok(trace.reachable && trace.activated && trace.targetVisible);
      if (trace.method === 'keyboard') assert.ok(trace.focusVisible);
      assert.ok(trace.targetWidth >= 44 && trace.targetHeight >= 44);
    }
    for (const capture of state.captures) {
      const bytes = await readFile(join('artifacts', 'improved', capture.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.digest);
    }
    // Exhaustively check all integer scroll positions, independent of the collector's sampled starts.
    const measuredMemberships = new Set(state.windows.map(window => JSON.stringify(window.visible)));
    for (let top = 0; top <= state.documentHeight - state.viewport.height; top++) assert.ok(measuredMemberships.has(JSON.stringify(surfaceVisible(state, top))));
  }
  const narrow = improved.report.states.find(state => state.id === 'narrow/open/touch');
  assert.ok(narrow.documentHeight > narrow.viewport.height);
  assert.ok(narrow.elements.find(element => element.id === 'calculation').rects.length > 1);
  assert.ok(narrow.windows.some(window => {
    const element = narrow.elements.find(value => value.id === 'condition');
    return window.visible.includes('condition') && element.rects.some(rect => rect.y < window.scrollTop + narrow.chromeHeight) && element.rects.some(rect => rect.y + rect.height > window.scrollTop + narrow.chromeHeight);
  }));
});

for (const [variant, failingFacet] of [
  ['padding', 'geometry'], ['boundary', 'total-budget'], ['candidate-caps', 'total-budget'], ['diagram', 'geometry'], ['small-text', 'geometry'],
  ['hidden-cost', 'inventory'], ['removed-downside', 'inventory'], ['filler', 'geometry'], ['overlap', 'geometry'], ['clipping', 'geometry'], ['overflow', 'geometry'],
  ['bad-focus', 'geometry'], ['bad-keyboard', 'geometry'], ['bad-touch', 'geometry'],
]) test(`actual rendered ${variant} cannot manufacture a passing result`, { timeout: 120000 }, async () => {
  const result = await capture(variant);
  assert.equal(result.evaluation.status, 'fail', JSON.stringify(result.summary));
  assert.equal(facet(result, failingFacet).status, 'fail', JSON.stringify(result.summary));
});

test('missing browser states, omitted boundary windows, stale identities and candidate caps are unavailable', async () => {
  const original = await capture('improved');
  const module = surfaceEvidenceModule({ policy: original.policy });
  const gate = compileGate([module], [module.id], { required: module.assertions.map(assertion => assertion.card.id), advisory: [] });
  for (const mutate of [
    report => { report.states.pop(); },
    report => { report.states.find(state => state.windows.length > 1).windows.pop(); },
    report => { report.sourceDigest = '0'.repeat(64); },
    report => { report.states[0].captures = []; },
    report => { report.states[0].interactions.pop(); },
    report => { report.maxTotal = 999; },
    report => { report.states[0].complete = false; report.states[0].unavailable = ['Required font unavailable']; },
  ]) {
    const report = structuredClone(original.report); mutate(report); report.renderDigest = surfaceRenderDigest(report);
    const evaluation = await evaluateGate(gate, { artifact: { id: 'changed', digest: report.artifactDigest, data: report }, environmentDigest: report.environmentDigest, available: SURFACE_INPUT }, new BudgetLedger({ evaluations: 4 }));
    assert.equal(evaluation.status, 'unavailable');
  }
});
