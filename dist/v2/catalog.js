import { digest, freezeJson, requireThat, text, unique, validateCost } from './validation.js';
import { assertionStatement, inputCompatibility, inputSchemaKey, validateAssertionContract } from './contracts.js';
export const ASSERTION_ZOO = [
    { path: ['structure', 'syntax'], meaning: 'Parse/type/schema predicates over supplied input.' },
    { path: ['structure', 'references'], meaning: 'Reference integrity and current dependency ancestry.' },
    { path: ['measurement', 'arithmetic'], meaning: 'Declared quantities, units, denominators and balance identities.' },
    { path: ['measurement', 'regression'], meaning: 'Observed behavior on the executed test population.' },
    { path: ['meaning', 'fidelity'], meaning: 'Preservation of source commitments and claim strength.' },
    { path: ['communication', 'legibility'], meaning: 'Audience-relative introduction, density and comprehension.' },
    { path: ['communication', 'geometry'], meaning: 'Rendered visibility and operation in tested states.' },
    { path: ['causality', 'identification'], meaning: 'Audit of the assumptions that would support an intervention claim.' },
    { path: ['decision', 'utility'], meaning: 'Conditional decisions under a supplied utility and likelihood model.' },
    { path: ['control', 'reliability'], meaning: 'Evaluator calibration, freshness, budget and update eligibility.' },
];
export function compiledGateDigest(gate) {
    return digest({ modules: gate.modules, assertions: gate.assertions.map(assertion => ({ card: assertion.card, contract: assertion.contract ?? null })), policy: gate.policy });
}
export function compileGate(modules, selected, policy, options = {}) {
    unique(selected, 'Selected modules');
    unique(policy.required, 'Required assertions');
    unique(policy.advisory, 'Advisory assertions');
    requireThat(selected.length > 0 && policy.required.length > 0, 'Select a module and at least one required assertion');
    requireThat(!policy.required.some(id => policy.advisory.includes(id)), 'Required and advisory selections overlap');
    const registry = new Map();
    for (const module of modules) {
        text(module.id, 'Module ID');
        text(module.version, 'Module version');
        unique(module.includes, 'Module includes');
        requireThat(!registry.has(module.id), `Duplicate module ${module.id}`);
        registry.set(module.id, module);
    }
    const visited = new Set();
    const active = new Set();
    const assertions = new Map();
    const visit = (id) => {
        requireThat(!active.has(id), `Module cycle at ${id}`);
        if (visited.has(id))
            return;
        const module = registry.get(id);
        requireThat(module, `Unknown module ${id}`);
        active.add(id);
        module.includes.forEach(visit);
        for (const assertion of module.assertions) {
            const card = assertion.card;
            digest(card);
            requireThat(assertion.contract || options.allowLegacyAssertions === true, `${card.id} needs an explicit assertion contract; migrate the module or explicitly opt into legacy assertions`);
            if (assertion.contract) {
                validateAssertionContract(assertion.contract);
                requireThat(assertion.contract.statementDigest === assertionStatement(card), 'Assertion statement changed without rebuilding its identity');
                requireThat(card.input.schemas.length === 1 && card.input.schemas[0] === inputSchemaKey(assertion.contract.input), 'Card and executable input schemas disagree');
                requireThat(digest(card.input.capabilities) === digest(assertion.contract.input.capabilities), 'Card and executable capabilities disagree');
            }
            for (const key of ['id', 'version', 'title', 'claim'])
                text(card[key], key);
            requireThat(ASSERTION_ZOO.some(entry => entry.path.every((part, index) => card.path[index] === part)), `Unknown taxonomy path for ${card.id}`);
            unique(card.requires, 'Assertion prerequisites');
            validateCost(card.costUpperBound);
            unique(card.input.schemas, 'Input schema IDs');
            unique(card.input.capabilities, 'Required capabilities');
            text(card.input.description, 'Input contract description');
            requireThat(card.input.schemas.length > 0, 'An assertion must describe its input schema');
            requireThat(['deterministic', 'empirical', 'model-judgment', 'causal-assumption-audit'].includes(card.evidenceKind), 'Unknown evidence kind');
            for (const field of ['assumptions', 'guarantees', 'doesNotGuarantee']) {
                requireThat(Array.isArray(card[field]) && card[field].length > 0, `${card.id} requires ${field}`);
                card[field].forEach(value => text(value, field));
            }
            requireThat(['not-applicable', 'unqualified', 'qualified'].includes(card.calibration.status), 'Invalid calibration status');
            text(card.calibration.scope, 'Calibration scope');
            card.calibration.evidence.forEach(value => text(value, 'Calibration evidence'));
            if (card.calibration.status === 'qualified') {
                requireThat(card.calibration.evidence.length > 0, 'Qualification must cite evidence');
                if (assertion.contract) {
                    requireThat(card.calibration.evaluatorDigest === assertion.contract.evaluatorDigest && card.calibration.applicabilityDigest === digest(assertion.contract.applicability), 'Qualification must bind the complete current evaluator and applicability identity');
                }
                else
                    requireThat(card.calibration.evaluatorVersion === card.version, 'Qualification must cite the current evaluator version');
            }
            requireThat(!assertions.has(card.id), `Duplicate assertion ${card.id}`);
            assertions.set(card.id, assertion);
        }
        active.delete(id);
        visited.add(id);
    };
    selected.forEach(visit);
    const order = [];
    const done = new Set();
    const pending = new Set();
    const visitAssertion = (id) => {
        requireThat(!pending.has(id), `Assertion cycle at ${id}`);
        if (done.has(id))
            return;
        const assertion = assertions.get(id);
        requireThat(assertion, `Unknown assertion ${id}`);
        pending.add(id);
        assertion.card.requires.forEach(visitAssertion);
        pending.delete(id);
        done.add(id);
        order.push(assertion);
    };
    [...policy.required, ...policy.advisory].forEach(visitAssertion);
    const moduleVersions = [...visited].map(id => `${id}@${registry.get(id)?.version}`);
    const copiedPolicy = freezeJson(structuredClone(policy));
    // Freeze metadata by copying it; registry callers cannot change a compiled contract after hashing.
    const copied = order.map(assertion => Object.freeze({ card: freezeJson(structuredClone(assertion.card)),
        ...(assertion.contract ? { contract: freezeJson(structuredClone(assertion.contract)) } : {}), evaluate: assertion.evaluate.bind(assertion) }));
    Object.freeze(copied);
    Object.freeze(moduleVersions);
    return Object.freeze({ modules: moduleVersions, assertions: copied, policy: copiedPolicy, digest: compiledGateDigest({ modules: moduleVersions, assertions: copied, policy: copiedPolicy }) });
}
/** Local metadata discovery. A declaration match is a candidate for validation, not proof of semantic compatibility. */
export function discoverAssertions(modules, available, query = '') {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return modules.flatMap(module => module.assertions.map(assertion => {
        const card = assertion.card;
        const searchable = [card.id, card.title, card.claim, ...card.path, card.input.description].join(' ').toLowerCase();
        const compatibility = assertion.contract ? inputCompatibility(assertion.contract.input, available) : {
            missingSchemas: card.input.schemas.filter(schema => !available.schemas.includes(schema)),
            missingCapabilities: card.input.capabilities.filter(capability => !available.capabilities.includes(capability)),
        };
        return { moduleId: module.id, card, protocol: assertion.contract?.protocol ?? 'legacy', matchesQuery: words.every(word => searchable.includes(word)),
            ...compatibility,
        };
    })).filter(entry => entry.matchesQuery).map(entry => ({ ...entry,
        declaredCompatible: entry.missingSchemas.length === 0 && entry.missingCapabilities.length === 0,
        limitation: 'Declared inputs match only; run the adapter, prerequisite checks and scope-specific calibration before relying on the composition.',
    }));
}
export function modelCard(gate) {
    return {
        schemaVersion: 2, contractDigest: gate.digest, modules: gate.modules,
        legacyAssertions: gate.assertions.filter(assertion => !assertion.contract).map(assertion => assertion.card.id),
        selection: gate.policy, evaluatedClosure: gate.assertions.map(a => a.card.id),
        composition: 'Required assertions form a conjunction with their prerequisites; advisory assertions cannot cancel failures. No independence or probability multiplication is assumed.',
        interpretation: 'PASS means the required predicates reported pass for the supplied scope and current evidence. It is not proof of global quality, causal identification, calibrated confidence, or eventual convergence.',
        assertions: gate.assertions.map(a => ({ ...a.card, contract: a.contract ?? null, role: gate.policy.required.includes(a.card.id) ? 'required' : gate.policy.advisory.includes(a.card.id) ? 'advisory' : 'prerequisite' })),
    };
}
//# sourceMappingURL=catalog.js.map