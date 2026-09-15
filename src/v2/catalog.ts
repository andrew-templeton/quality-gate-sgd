import type { Assertion, AssertionModule, CompiledGate, GatePolicy } from './types.js';
import { digest, freezeJson, requireThat, text, unique, validateCost } from './validation.js';

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
] as const;

export function compileGate(modules: AssertionModule[], selected: string[], policy: GatePolicy): CompiledGate {
  unique(selected, 'Selected modules'); unique(policy.required, 'Required assertions'); unique(policy.advisory, 'Advisory assertions');
  requireThat(selected.length > 0 && policy.required.length > 0, 'Select a module and at least one required assertion');
  requireThat(!policy.required.some(id => policy.advisory.includes(id)), 'Required and advisory selections overlap');
  const registry = new Map<string, AssertionModule>();
  for (const module of modules) {
    text(module.id, 'Module ID'); text(module.version, 'Module version'); unique(module.includes, 'Module includes');
    requireThat(!registry.has(module.id), `Duplicate module ${module.id}`); registry.set(module.id, module);
  }
  const visited = new Set<string>(); const active = new Set<string>(); const assertions = new Map<string, Assertion>();
  const visit = (id: string): void => {
    requireThat(!active.has(id), `Module cycle at ${id}`); if (visited.has(id)) return;
    const module = registry.get(id); requireThat(module, `Unknown module ${id}`); active.add(id);
    module.includes.forEach(visit);
    for (const assertion of module.assertions) {
      const card = assertion.card;
      for (const key of ['id', 'version', 'title', 'claim'] as const) text(card[key], key);
      requireThat(ASSERTION_ZOO.some(entry => entry.path.every((part, index) => card.path[index] === part)), `Unknown taxonomy path for ${card.id}`);
      unique(card.requires, 'Assertion prerequisites'); validateCost(card.costUpperBound);
      unique(card.input.schemas, 'Input schema IDs'); unique(card.input.capabilities, 'Required capabilities');
      text(card.input.description, 'Input contract description');
      requireThat(card.input.schemas.length > 0, 'An assertion must describe its input schema');
      requireThat(['deterministic', 'empirical', 'model-judgment', 'causal-assumption-audit'].includes(card.evidenceKind), 'Unknown evidence kind');
      for (const field of ['assumptions', 'guarantees', 'doesNotGuarantee'] as const) {
        requireThat(Array.isArray(card[field]) && card[field].length > 0, `${card.id} requires ${field}`);
        card[field].forEach(value => text(value, field));
      }
      requireThat(['not-applicable', 'unqualified', 'qualified'].includes(card.calibration.status), 'Invalid calibration status');
      text(card.calibration.scope, 'Calibration scope');
      card.calibration.evidence.forEach(value => text(value, 'Calibration evidence'));
      if (card.calibration.status === 'qualified') requireThat(card.calibration.evidence.length > 0 && card.calibration.evaluatorVersion === card.version, 'Qualification must cite evidence and the current evaluator version');
      requireThat(!assertions.has(card.id), `Duplicate assertion ${card.id}`);
      assertions.set(card.id, assertion);
    }
    active.delete(id); visited.add(id);
  };
  selected.forEach(visit);
  const order: Assertion[] = []; const done = new Set<string>(); const pending = new Set<string>();
  const visitAssertion = (id: string): void => {
    requireThat(!pending.has(id), `Assertion cycle at ${id}`); if (done.has(id)) return;
    const assertion = assertions.get(id); requireThat(assertion, `Unknown assertion ${id}`); pending.add(id);
    assertion.card.requires.forEach(visitAssertion);
    pending.delete(id); done.add(id); order.push(assertion);
  };
  [...policy.required, ...policy.advisory].forEach(visitAssertion);
  const moduleVersions = [...visited].map(id => `${id}@${registry.get(id)?.version}`);
  const copiedPolicy = freezeJson(structuredClone(policy));
  // Freeze metadata by copying it; registry callers cannot change a compiled contract after hashing.
  const copied = order.map(assertion => Object.freeze({ card: freezeJson(structuredClone(assertion.card)), evaluate: assertion.evaluate.bind(assertion) }));
  Object.freeze(copied); Object.freeze(moduleVersions);
  return Object.freeze({ modules: moduleVersions, assertions: copied, policy: copiedPolicy, digest: digest({ modules: moduleVersions, cards: copied.map(a => a.card), policy: copiedPolicy }) });
}

/** Local metadata discovery. A declaration match is a candidate for validation, not proof of semantic compatibility. */
export function discoverAssertions(modules: AssertionModule[], available: { schemas: string[]; capabilities: string[] }, query = '') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return modules.flatMap(module => module.assertions.map(assertion => {
    const card = assertion.card;
    const searchable = [card.id, card.title, card.claim, ...card.path, card.input.description].join(' ').toLowerCase();
    return { moduleId: module.id, card, matchesQuery: words.every(word => searchable.includes(word)),
      missingSchemas: card.input.schemas.filter(schema => !available.schemas.includes(schema)),
      missingCapabilities: card.input.capabilities.filter(capability => !available.capabilities.includes(capability)),
    };
  })).filter(entry => entry.matchesQuery).map(entry => ({ ...entry,
    declaredCompatible: entry.missingSchemas.length === 0 && entry.missingCapabilities.length === 0,
    limitation: 'Declared inputs match only; run the adapter, prerequisite checks and scope-specific calibration before relying on the composition.',
  }));
}

export function modelCard(gate: CompiledGate): object {
  return {
    schemaVersion: 2, contractDigest: gate.digest, modules: gate.modules,
    selection: gate.policy, evaluatedClosure: gate.assertions.map(a => a.card.id),
    composition: 'Required assertions form a conjunction with their prerequisites; advisory assertions cannot cancel failures. No independence or probability multiplication is assumed.',
    interpretation: 'PASS means the required predicates reported pass for the supplied scope and current evidence. It is not proof of global quality, causal identification, calibrated confidence, or eventual convergence.',
    assertions: gate.assertions.map(a => ({ ...a.card, role: gate.policy.required.includes(a.card.id) ? 'required' : gate.policy.advisory.includes(a.card.id) ? 'advisory' : 'prerequisite' })),
  };
}
