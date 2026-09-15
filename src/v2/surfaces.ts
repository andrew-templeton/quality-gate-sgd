import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bindInput, defineAssertion, defineOutput, parseSchema, schema, type SchemaValue } from './contracts.js';
import type { AssertionCard, AssertionModule, Observation } from './types.js';
import { digest, freezeJson, requireThat, text, unique } from './validation.js';

const word = schema.string({ minLength: 1 });
const pixel = schema.number({ minimum: 0 });
const viewportSchema = schema.object({ width: schema.number({ integer: true, minimum: 1 }), height: schema.number({ integer: true, minimum: 1 }) });
const methodSchema = schema.union(schema.literal('keyboard'), schema.literal('touch'));
const rectSchema = schema.object({ x: schema.number(), y: schema.number(), width: pixel, height: pixel });
export type SurfaceRect = SchemaValue<typeof rectSchema>;

/** Every item is independently accounted for. Candidate-declared grouping earns no compression credit. */
export interface SurfaceElementPolicy { id: string; address: string; text: string; concepts: string[]; defines: string[] }
export interface SurfaceStatePolicy {
  id: string; route: string; viewport: { width: number; height: number }; input: 'keyboard' | 'touch'; interaction: string;
  requiredElements: string[]; entryElements: string[]; actions: string[];
  maxTotal: number; maxNovel: number; minFontPx: number; minTargetPx: number; maxBlankGapPx: number; maxScrollScreens: number;
}
export interface SurfacePolicy { version: string; collectorDigest: string; scrollModel: 'integer-css-pixels'; knownConcepts: string[]; elements: SurfaceElementPolicy[]; states: SurfaceStatePolicy[] }
export const SURFACE_INPUT = freezeJson({ schemas: ['quality-sgd.surface-evidence@1'], capabilities: ['render-capture', 'semantic-surface-inventory', 'browser-interactions'] });
export const SURFACE_OUTPUT = defineOutput({ schemaId: 'quality-sgd.surface-verification', schemaVersion: '1', schema: schema.object({ artifactDigest: word, environmentDigest: word, renderDigest: word, policyDigest: word, collectorDigest: word }) });
export const surfaceEvidenceSchema = schema.object({
  protocol: schema.literal('quality-sgd.surface-evidence/v1'), artifactDigest: word, environmentDigest: word,
  sourceDigest: word, dataDigest: word, collectorDigest: word, policyDigest: word, browser: word, renderDigest: word, scrollModel: schema.literal('integer-css-pixels'),
  states: schema.array(schema.object({
    id: word, route: word, viewport: viewportSchema, input: methodSchema, interaction: word,
    complete: schema.boolean(), unavailable: schema.array(word), documentHeight: pixel, chromeHeight: pixel,
    scrollProbes: schema.array(schema.object({ requested: pixel, observed: pixel })),
    anchors: schema.array(schema.object({ id: word, top: pixel })),
    elements: schema.array(schema.object({ id: word, address: word, text: word, fontPx: pixel, rects: schema.array(rectSchema) })),
    windows: schema.array(schema.object({ id: word, scrollTop: pixel, visible: schema.array(word) })),
    interactions: schema.array(schema.object({ id: word, method: methodSchema, reachable: schema.boolean(), focusVisible: schema.boolean(), activated: schema.boolean(), targetVisible: schema.boolean(), targetWidth: pixel, targetHeight: pixel })),
    defects: schema.array(schema.object({ code: word, address: word, message: word })),
    captures: schema.array(schema.object({ id: word, scrollTop: pixel, digest: word, path: word })),
  }), { minItems: 1 }),
});
export type SurfaceEvidence = SchemaValue<typeof surfaceEvidenceSchema>;
export type SurfaceVerification = Pick<SurfaceEvidence, 'artifactDigest' | 'environmentDigest' | 'renderDigest' | 'policyDigest' | 'collectorDigest'>;
export type SurfaceStateEvidence = SurfaceEvidence['states'][number];
export interface SurfaceWindow { id: string; scrollTop: number; visible: string[]; total: string[]; novel: string[]; unexplained: string[] }

function sha(value: string, label: string): void { requireThat(/^[a-f0-9]{64}$/.test(value), `${label} must be SHA-256`); }
const sorted = (values: string[]): string[] => [...values].sort();
const same = (left: unknown, right: unknown): boolean => digest(left) === digest(right);

/**
 * Sweep viewport membership boundaries, plus natural section starts and the page ends.
 * Integer-pixel midpoints cover every interval between entering/leaving text fragments. This is
 * deliberately not a partition into disjoint folds; partially visible items count.
 * Requires verified integer CSS pixel scrolling, stationary document-coordinate text
 * geometry and one measured top chrome band. Fractional scrolling is unsupported.
 */
export function surfaceWindowStarts(state: Pick<SurfaceStateEvidence, 'viewport' | 'documentHeight' | 'chromeHeight' | 'elements' | 'anchors'>): number[] {
  const { height } = state.viewport;
  requireThat(height > state.chromeHeight && state.chromeHeight >= 0 && Number.isSafeInteger(state.documentHeight) && state.documentHeight >= height, 'Invalid surface dimensions');
  const end = Math.max(0, state.documentHeight - height);
  const clamp = (value: number): number => Math.max(0, Math.min(end, value));
  const boundaries = new Set<number>([0, end]);
  const add = (value: number): void => { boundaries.add(clamp(Math.floor(value))); boundaries.add(clamp(Math.ceil(value))); };
  for (const anchor of state.anchors) add(anchor.top - state.chromeHeight);
  for (const element of state.elements) for (const rect of element.rects) {
    requireThat([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0, 'Invalid text fragment');
    add(rect.y - height);
    add(rect.y + rect.height - state.chromeHeight);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  const result = new Set(ordered);
  for (let index = 1; index < ordered.length; index++) result.add(Math.floor((ordered[index - 1] + ordered[index]) / 2));
  requireThat(result.size <= 4000, 'Surface boundary sweep exceeds the collector limit; split and version the declared surface');
  return [...result].sort((a, b) => a - b);
}

/** Rectangles include visible text fragments, in document coordinates, before viewport clipping. */
export function surfaceVisible(state: Pick<SurfaceStateEvidence, 'viewport' | 'chromeHeight' | 'elements'>, scrollTop: number): string[] {
  return sorted(state.elements.filter(element => element.rects.some(rect => rect.width > 0 && rect.height > 0 && rect.x < state.viewport.width && rect.x + rect.width > 0 && rect.y + rect.height > scrollTop + state.chromeHeight && rect.y < scrollTop + state.viewport.height)).map(element => element.id));
}

export function surfaceRenderDigest(evidence: Omit<SurfaceEvidence, 'renderDigest'> | SurfaceEvidence): string {
  const body = { ...evidence } as Partial<SurfaceEvidence>; delete body.renderDigest;
  return digest(body);
}

function statePolicy(policy: SurfacePolicy, id: string): SurfaceStatePolicy {
  const state = policy.states.find(value => value.id === id); requireThat(state, `Unknown surface state: ${id}`); return state;
}
function elementPolicy(policy: SurfacePolicy, id: string): SurfaceElementPolicy {
  const element = policy.elements.find(value => value.id === id); requireThat(element, `Unknown semantic element: ${id}`); return element;
}

export function validateSurfacePolicy(supplied: SurfacePolicy): SurfacePolicy {
  digest(supplied);
  const policy = freezeJson(structuredClone(supplied));
  const fields = (value: object, allowed: string[], label: string): void => requireThat(Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key)), `${label} has missing or unsupported fields`);
  fields(policy, ['version', 'collectorDigest', 'scrollModel', 'knownConcepts', 'elements', 'states'], 'Surface policy');
  requireThat(policy.scrollModel === 'integer-css-pixels', 'Unsupported scrolling model');
  text(policy.version, 'Surface policy version'); sha(policy.collectorDigest, 'Collector digest'); unique(policy.knownConcepts, 'Known concepts');
  requireThat(policy.states.length > 0 && policy.elements.length > 0, 'Surface policy requires states and an independent semantic inventory');
  unique(policy.states.map(state => state.id), 'Required surface states'); unique(policy.elements.map(element => element.id), 'Semantic inventory IDs'); unique(policy.elements.map(element => element.address), 'Semantic addresses');
  for (const element of policy.elements) {
    fields(element, ['id', 'address', 'text', 'concepts', 'defines'], 'Element policy');
    text(element.text, 'Expected semantic text'); unique(element.concepts, 'Element concepts'); unique(element.defines, 'Element definitions');
    requireThat(element.defines.every(id => element.concepts.includes(id)), 'Definitions must refer to declared concepts');
  }
  for (const state of policy.states) {
    fields(state, ['id', 'route', 'viewport', 'input', 'interaction', 'requiredElements', 'entryElements', 'actions', 'maxTotal', 'maxNovel', 'minFontPx', 'minTargetPx', 'maxBlankGapPx', 'maxScrollScreens'], 'State policy');
    fields(state.viewport, ['width', 'height'], 'Viewport policy');
    text(state.route, 'Entry route'); text(state.interaction, 'Interaction state');
    requireThat(state.input === 'keyboard' || state.input === 'touch', 'Supported input method required');
    for (const size of [state.viewport.width, state.viewport.height]) requireThat(Number.isSafeInteger(size) && size > 0, 'Positive integral viewport required');
    for (const cap of [state.maxTotal, state.maxNovel]) requireThat(Number.isSafeInteger(cap) && cap >= 0, 'Semantic caps must be nonnegative safe integers');
    for (const minimum of [state.minFontPx, state.minTargetPx, state.maxBlankGapPx, state.maxScrollScreens]) requireThat(Number.isFinite(minimum) && minimum > 0, 'Positive geometry limits required');
    for (const ids of [state.requiredElements, state.entryElements, state.actions]) {
      unique(ids, 'State inventory'); requireThat(ids.every(id => policy.elements.some(element => element.id === id)), 'Unknown state element');
    }
    requireThat(state.entryElements.every(id => state.requiredElements.includes(id)) && state.actions.every(id => state.requiredElements.includes(id)), 'Entry elements and actions must be required');
  }
  return policy;
}

/** Validation checks identity and measurement coverage. It cannot attest an honest browser or semantic inventory. */
export function validateSurfaceEvidence(supplied: unknown, policy: SurfacePolicy, identity: { artifactDigest: string; environmentDigest: string }): SurfaceEvidence {
  const report = parseSchema(surfaceEvidenceSchema, supplied);
  for (const id of [report.sourceDigest, report.dataDigest, report.collectorDigest, report.policyDigest, report.renderDigest, report.artifactDigest, report.environmentDigest]) sha(id, 'Surface identity');
  requireThat(report.artifactDigest === digest({ sourceDigest: report.sourceDigest, dataDigest: report.dataDigest }) && report.artifactDigest === identity.artifactDigest && report.environmentDigest === identity.environmentDigest, 'Stale surface identity');
  requireThat(report.policyDigest === digest(policy) && report.collectorDigest === policy.collectorDigest, 'Surface collector or policy identity mismatch');
  requireThat(report.scrollModel === policy.scrollModel, 'Surface scrolling model mismatch');
  requireThat(report.renderDigest === surfaceRenderDigest(report), 'Surface render integrity mismatch');
  unique(report.states.map(state => state.id), 'Rendered state IDs');
  requireThat(same(sorted(report.states.map(state => state.id)), sorted(policy.states.map(state => state.id))), 'Required rendered state coverage is incomplete');
  for (const state of report.states) {
    const required = statePolicy(policy, state.id);
    requireThat(state.complete && state.unavailable.length === 0, `Required render unavailable: ${state.id}: ${state.unavailable.join('; ')}`);
    requireThat(state.route === required.route && same(state.viewport, required.viewport) && state.input === required.input && state.interaction === required.interaction, 'Rendered entry, viewport, or interaction state mismatch');
    const expectedProbes = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75].map(value => Math.min(state.documentHeight - state.viewport.height, value));
    requireThat(same(expectedProbes, state.scrollProbes.map(value => value.requested)) && state.scrollProbes.every(value => Number.isSafeInteger(value.observed) && Math.abs(value.observed - value.requested) <= 0.50001), 'Integer CSS pixel scrolling was not verified');
    unique(state.elements.map(element => element.id), 'Measured element IDs'); unique(state.windows.map(window => window.id), 'Measured window IDs'); unique(state.anchors.map(anchor => anchor.id), 'Natural anchor IDs');
    for (const element of state.elements) requireThat(policy.elements.some(value => value.id === element.id && value.address === element.address), 'Measured element lacks a trusted semantic address');
    requireThat(state.captures.length > 0 && state.captures.some(capture => capture.scrollTop === 0), 'Required state screenshot missing');
    for (const capture of state.captures) sha(capture.digest, 'Screenshot digest');
    const starts = surfaceWindowStarts(state);
    requireThat(same(starts, state.windows.map(window => window.scrollTop)), 'Required natural/boundary window coverage is incomplete');
    for (const window of state.windows) {
      unique(window.visible, 'Visible inventory');
      requireThat(same(surfaceVisible(state, window.scrollTop), sorted(window.visible)), 'Visible membership disagrees with measured text geometry');
    }
    unique(state.interactions.map(value => `${value.id}/${value.method}`), 'Interaction coverage');
    requireThat(same(sorted(state.interactions.map(value => `${value.id}/${value.method}`)), sorted(required.actions.map(id => `${id}/${required.input}`))), 'Required action/input evidence is incomplete');
  }
  return report;
}

/** Novelty is recomputed from trusted knowledge and concept membership; no learning is inferred across states/windows. */
export function surfaceWindows(state: SurfaceStateEvidence, policy: SurfacePolicy): SurfaceWindow[] {
  return state.windows.map(window => {
    const elements = window.visible.map(id => elementPolicy(policy, id));
    const novel = sorted([...new Set(elements.flatMap(element => element.concepts).filter(id => !policy.knownConcepts.includes(id)))]);
    const definitions = new Set(elements.flatMap(element => element.defines));
    return { ...window, total: [...window.visible], novel, unexplained: novel.filter(id => !definitions.has(id)) };
  });
}

function result(failures: { address: string; message: string }[], report: SurfaceEvidence): Observation<SurfaceVerification> {
  const evidence = [`surface:${report.renderDigest}`, `policy:${report.policyDigest}`, `collector:${report.collectorDigest}`];
  return { status: failures.length ? 'fail' : 'pass', findings: failures.map(failure => ({ ...failure, evidence })), evidence, actualCost: { evaluations: 1 }, loss: { lower: failures.length, upper: failures.length, unit: 'violations' },
    ...(failures.length ? {} : { output: { artifactDigest: report.artifactDigest, environmentDigest: report.environmentDigest, renderDigest: report.renderDigest, policyDigest: report.policyDigest, collectorDigest: report.collectorDigest } }) };
}

/** Browser-independent predicates over evidence from an explicitly trusted external collector. */
export function surfaceEvidenceModule(options: { policy: SurfacePolicy; reportPath?: string[] }): AssertionModule {
  const policy = validateSurfacePolicy(options.policy);
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  const implementation = { id: 'quality-sgd/surface-evidence', version: '1', digest: createHash('sha256').update(['surfaces', 'contracts', 'validation'].map(name => readFileSync(new URL(`./${name}${extension}`, import.meta.url), 'utf8')).join('\n')).digest('hex') };
  const input = bindInput({ schemaId: 'quality-sgd.surface-evidence', schemaVersion: '1', schema: surfaceEvidenceSchema, path: options.reportPath ?? [], capabilities: SURFACE_INPUT.capabilities });
  const make = (id: string, claim: string, inspect: (report: SurfaceEvidence, policy: SurfacePolicy) => { address: string; message: string }[]) => {
    const card: AssertionCard = { id, version: '1', title: id, path: ['communication', id === 'surface.geometry' ? 'geometry' : 'legibility', id.slice(id.indexOf('.') + 1)], claim, evidenceKind: 'deterministic',
      input: { schemas: SURFACE_INPUT.schemas, capabilities: SURFACE_INPUT.capabilities, description: 'Current browser text geometry, interaction traces, screenshots and independently configured semantic inventory.' },
      assumptions: ['The pinned collector reports honest complete captures within its documented supported surface model.', 'The operator inventory and concept knowledge were reviewed independently of the candidate.'],
      guarantees: [claim], doesNotGuarantee: ['No audience comprehension, universal cognitive capacity, causal benefit, semantic completeness outside the reviewed inventory, or pixel attestation is established.'], requires: [], costUpperBound: { evaluations: 1 },
      calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic predicates over supplied browser measurements, with explicit collector trust.' } };
    return defineAssertion({ card, implementation, configuration: { policy }, applicability: { domain: 'reviewed-stationary-dom-surfaces' }, input, output: SURFACE_OUTPUT,
      async evaluate(context, supplied, config) { const report = validateSurfaceEvidence(supplied, config.policy, { artifactDigest: context.artifact.digest, environmentDigest: context.environmentDigest }); return result(inspect(report, config.policy), report); },
    });
  };
  const geometry = make('surface.geometry', 'Required supplied renders satisfy the configured geometry and interaction predicates.', (report, trusted) => report.states.flatMap(state => {
    const required = statePolicy(trusted, state.id);
    const failures = state.defects.map(defect => ({ address: `${state.id}/${defect.address}`, message: `${defect.code}: ${defect.message}` }));
    for (const element of state.elements.filter(value => value.rects.length)) if (element.fontPx < required.minFontPx) failures.push({ address: element.address, message: `Text ${element.fontPx}px below ${required.minFontPx}px` });
    for (const action of state.interactions) if (!action.reachable || action.method === 'keyboard' && !action.focusVisible || !action.activated || !action.targetVisible || action.targetWidth < required.minTargetPx || action.targetHeight < required.minTargetPx) failures.push({ address: action.id, message: `Action fails ${action.method} access, focus, effect, visibility or ${required.minTargetPx}px target minimum` });
    if (state.documentHeight / state.viewport.height > required.maxScrollScreens) failures.push({ address: state.id, message: `Scroll burden ${state.documentHeight / state.viewport.height} screens exceeds ${required.maxScrollScreens}` });
    const intervals = state.elements.flatMap(element => element.rects.map(rect => [rect.y, rect.y + rect.height])).sort((left, right) => left[0] - right[0]);
    let end = state.chromeHeight;
    for (const [top, bottom] of intervals) { if (top - end > required.maxBlankGapPx) failures.push({ address: state.id, message: `Unaccounted blank gap ${top - end}px exceeds ${required.maxBlankGapPx}px` }); end = Math.max(end, bottom); }
    return failures;
  }));
  const inventory = make('surface.inventory', 'Required semantic elements and entry commitments remain present with their reviewed text and addresses.', (report, trusted) => report.states.flatMap(state => {
    const required = statePolicy(trusted, state.id);
    const failures: { address: string; message: string }[] = [];
    for (const id of required.requiredElements) if (!state.elements.some(value => value.id === id && value.rects.length)) failures.push({ address: id, message: `Required element absent in ${state.id}` });
    for (const id of required.entryElements) if (!state.windows[0].visible.includes(id)) failures.push({ address: id, message: `Material entry element is outside the entry viewport in ${state.id}` });
    for (const element of state.elements) if (element.text !== elementPolicy(trusted, element.id).text) failures.push({ address: element.address, message: 'Rendered text differs from the independently reviewed inventory' });
    return failures;
  }));
  const total = make('surface.total-budget', 'Every required integer CSS pixel viewport window fits its independently configured total decision-element cap.', (report, trusted) => report.states.flatMap(state => {
    const required = statePolicy(trusted, state.id);
    return surfaceWindows(state, trusted).filter(window => window.total.length > required.maxTotal).map(window => ({ address: `${state.id}/${window.id}`, message: `Total ${window.total.length} exceeds ${required.maxTotal}: ${window.total.join(', ')}` }));
  }));
  const novel = make('surface.novel-budget', 'Every required integer CSS pixel viewport window fits its novel-concept cap and visible novel concepts have a colocated reviewed explanation.', (report, trusted) => report.states.flatMap(state => {
    const required = statePolicy(trusted, state.id);
    return surfaceWindows(state, trusted).filter(window => window.novel.length > required.maxNovel || window.unexplained.length).map(window => ({ address: `${state.id}/${window.id}`, message: `Novel ${window.novel.length}/${required.maxNovel}; unexplained: ${window.unexplained.join(', ') || 'none'}` }));
  }));
  const assertions = [geometry, inventory, total, novel];
  return { id: 'surface-evidence', version: digest(assertions.map(assertion => assertion.contract)), includes: [], assertions };
}
