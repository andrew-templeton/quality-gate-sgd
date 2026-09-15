import { digest, freezeJson, requireThat, text, unique } from './validation.js';
function card(id, title, path, claim, limit, cost) {
    return { id, version: '2.0.0-1', title, path, claim, evidenceKind: 'deterministic',
        input: { schemas: ['quality-sgd.artifact/v2'], capabilities: [], description: 'Adapter-supplied artifact data; validated by the assertion runner.' },
        assumptions: ['Inputs are complete for the declared scope and tied to the current artifact revision.'],
        guarantees: [claim], doesNotGuarantee: [limit], requires: [], costUpperBound: cost,
        calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic predicate over supplied inputs, not empirical validity.' },
    };
}
function observed(failures, evidence, cost, unit = 'violations') {
    return { status: failures.length ? 'fail' : 'pass', findings: failures.map(failure => ({ ...failure, evidence: [evidence] })), evidence: [evidence],
        loss: { lower: failures.length, upper: failures.length, unit }, actualCost: { ...cost } };
}
export function renderedLegibilityModule(read, suppliedPolicy, suppliedCost = { evaluations: 1 }) {
    text(suppliedPolicy.version, 'Render policy version');
    requireThat(Array.isArray(suppliedPolicy.views) && suppliedPolicy.views.length > 0, 'Render policy requires views');
    unique(suppliedPolicy.views.map(view => view.id), 'Render policy view IDs');
    for (const view of suppliedPolicy.views) {
        for (const cap of [view.maxTotal, view.maxNovel])
            requireThat(Number.isSafeInteger(cap) && cap >= 0, 'Render policy caps must be nonnegative safe integers');
    }
    const policy = freezeJson({ version: suppliedPolicy.version, views: suppliedPolicy.views.map(view => ({ id: view.id, maxTotal: view.maxTotal, maxNovel: view.maxNovel })) });
    const policyDigest = digest(policy);
    const version = `2.0.0-2+policy.${policyDigest}`;
    const cost = { ...suppliedCost };
    const evidence = (data, artifact, environment) => {
        const report = read(data);
        requireThat(report.artifactDigest === artifact && report.environmentDigest === environment, 'Stale render identity');
        requireThat(typeof report.screenshotDigest === 'string' && report.screenshotDigest.length > 0, 'Screenshot evidence missing');
        requireThat(!Object.hasOwn(report, 'requiredViews'), 'Required views belong in the trusted render policy, not candidate evidence');
        requireThat(Array.isArray(report.views) && report.views.length === policy.views.length && new Set(report.views.map(view => view.id)).size === report.views.length && policy.views.every(required => report.views.some(view => view.id === required.id)), 'Required view/state evidence incomplete');
        for (const view of report.views) {
            requireThat(Array.isArray(view.folds) && view.folds.length > 0, 'Each view requires measured folds');
            unique(view.folds.map(fold => fold.id), 'Measured fold IDs');
            for (const fold of view.folds)
                requireThat(!Object.hasOwn(fold, 'maxTotal') && !Object.hasOwn(fold, 'maxNovel'), 'Fold caps belong in the trusted render policy, not candidate evidence');
        }
        return report;
    };
    const geometry = {
        card: card('render.geometry', 'Rendered geometry', ['communication', 'geometry'], 'All required supplied rendered states have no reported geometry defects.', 'Does not capture the browser or attest that the measurement collector found every overlap.', cost),
        async evaluate(context) {
            const report = evidence(context.artifact.data, context.artifact.digest, context.environmentDigest);
            return observed(report.views.flatMap(view => view.defects), `render:${report.screenshotDigest};policy:${policyDigest}`, cost);
        },
    };
    const folds = {
        card: card('render.fold-budget', 'Total and novel fold budgets', ['communication', 'legibility'], 'Every supplied fold fits the trusted policy total/novel caps for its required view and has no unexplained first-use concepts.', 'Does not establish cognitive capacity, audience knowledge, or completeness of semantic annotations.', cost),
        async evaluate(context) {
            const report = evidence(context.artifact.data, context.artifact.digest, context.environmentDigest);
            const failures = [];
            for (const view of report.views) {
                const limits = policy.views.find(required => required.id === view.id);
                for (const fold of view.folds) {
                    requireThat(new Set(fold.quanta).size === fold.quanta.length && new Set(fold.novel).size === fold.novel.length, 'Repeated IDs cannot inflate a fold inventory');
                    requireThat(fold.novel.every(id => fold.quanta.includes(id)) && fold.unexplained.every(id => fold.novel.includes(id)), 'Novel/unexplained inventories must be nested subsets');
                    if (fold.quanta.length > limits.maxTotal || fold.novel.length > limits.maxNovel || fold.unexplained.length)
                        failures.push({ address: `${view.id}/${fold.id}`, message: `Total ${fold.quanta.length}/${limits.maxTotal}; novel ${fold.novel.length}/${limits.maxNovel}; unexplained ${fold.unexplained.join(', ') || 'none'}` });
                }
            }
            return observed(failures, `render:${report.screenshotDigest};policy:${policyDigest}`, cost);
        },
    };
    for (const assertion of [geometry, folds]) {
        assertion.card.version = version;
        assertion.card.input = { schemas: ['quality-sgd.render-evidence/v2'], capabilities: ['render-capture', 'semantic-fold-inventory'], description: 'Current render identity, complete policy-required views/states, addressed defects, and total/novel fold inventories. Requirements are supplied separately in the trusted render policy.' };
        assertion.card.assumptions.push(`Trusted render policy ${JSON.stringify(policy)}; policy digest ${policyDigest}.`);
    }
    return { id: 'rendered-legibility', version, includes: [], assertions: [geometry, folds] };
}
//# sourceMappingURL=modules.js.map