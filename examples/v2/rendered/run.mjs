import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BudgetLedger, compileGate, evaluateGate, surfaceEvidenceModule, SURFACE_INPUT, surfaceWindows } from 'quality-gate-sgd';
import { collectorIdentity, collectSurface } from './collector.mjs';
import { approvedLabels, data, fixtureHtml, fixturePolicy } from './fixture.mjs';

export const settings = Object.freeze({ chromeSelector: 'header', dataSelector: '#quality-data', disclosureId: 'disclosure', disclosureTarget: '#calculations', approvedLabels,
  actions: [{ id: 'approve', kind: 'text', target: '#confirmation', value: 'Review requested' }, { id: 'disclosure', kind: 'toggle', target: '#calculations' }] });

export async function captureFixture(variant, { browser, outputDir }) {
  const html = fixtureHtml(variant);
  const server = createServer((request, response) => {
    if (!request.url?.startsWith('/decision')) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const policy = fixturePolicy(collectorIdentity(settings));
    const report = await collectSurface({ browser, baseURL: `http://127.0.0.1:${server.address().port}`, policy, settings, data, outputDir });
    const module = surfaceEvidenceModule({ policy });
    const gate = compileGate([module], [module.id], { required: module.assertions.map(assertion => assertion.card.id), advisory: [] });
    const evaluation = await evaluateGate(gate, { artifact: { id: `public-business-case/${variant}`, digest: report.artifactDigest, data: report }, environmentDigest: report.environmentDigest, available: SURFACE_INPUT }, new BudgetLedger({ evaluations: 4 }));
    const summary = { variant, status: evaluation.status, artifactDigest: report.artifactDigest, renderDigest: report.renderDigest,
      facets: evaluation.results.map(result => ({ id: result.assertionId, status: result.status, findings: result.findings, ...(result.reason ? { reason: result.reason } : {}) })),
      states: report.states.map(state => ({ id: state.id, complete: state.complete, unavailable: state.unavailable, windows: state.windows.length, captures: state.captures.length, documentHeight: state.documentHeight,
        peakTotal: Math.max(0, ...surfaceWindows(state, policy).map(window => window.total.length)), peakNovel: Math.max(0, ...surfaceWindows(state, policy).map(window => window.novel.length)) })) };
    await writeFile(resolve(outputDir, 'evaluation.json'), `${JSON.stringify({ summary, evaluation }, null, 2)}\n`);
    return { policy, report, evaluation, summary };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const variants = process.argv.slice(2); if (!variants.length) variants.push('baseline', 'improved');
  const browser = await chromium.launch();
  try {
    const summaries = [];
    for (const variant of variants) {
      const result = await captureFixture(variant, { browser, outputDir: resolve('artifacts', variant) });
      summaries.push(result.summary); console.log(JSON.stringify(result.summary));
    }
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/summary.json', `${JSON.stringify(summaries, null, 2)}\n`);
  } finally { await browser.close(); }
}
