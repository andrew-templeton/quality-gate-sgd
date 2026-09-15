import { digest, freezeJson, requireThat, text, unique } from './validation.js';

export type QualityAddressKind = 'artifact' | 'component' | 'claim' | 'assertion';
export type LineageKind = 'source' | 'asset' | 'derived' | 'render' | 'audience' | 'policy' | 'view' | 'evaluator' | 'judgment';
export interface LineageNode {
  address: string;
  kind: LineageKind;
  /** A digest of actual content supplied by the adapter; unavailable content has no fabricated digest. */
  contentDigest: string | null;
  configurationDigest: string;
  dependencies: string[];
  availability: 'available' | 'unavailable';
  reason: string | null;
}
export interface ResolvedLineageNode extends LineageNode {
  revisionDigest: string;
  dependencyRevisions: Array<{ address: string; revisionDigest: string }>;
  available: boolean;
  unavailableDependencies: string[];
}
export interface LineageGraph {
  schemaVersion: 'quality-sgd.lineage/v1';
  nodes: ResolvedLineageNode[];
  digest: string;
}
export interface LineageReceipt<T = unknown> {
  schemaVersion: 'quality-sgd.lineage-receipt/v1';
  subject: string;
  subjectRevision: string;
  evaluator: string;
  evaluatorRevision: string;
  evaluatorDigest: string;
  /** The evaluator's scoped input, not an unrelated whole-artifact identity. */
  inputDigest: string;
  schemaDigest: string;
  valueDigest: string;
  value: T;
  lineage: Array<{ address: string; revisionDigest: string }>;
  digest: string;
}
export interface LineageRequirement {
  subject: string;
  evaluator: string;
  evaluatorDigest: string;
  inputDigest: string;
  schemaDigest: string;
}
export type LineageReuse<T> = { status: 'reusable'; value: T } | { status: 'unavailable'; reason: string };

const addressKinds = new Set(['artifact', 'component', 'claim', 'assertion']);
const lineageKinds = new Set(['source', 'asset', 'derived', 'render', 'audience', 'policy', 'view', 'evaluator', 'judgment']);
const nodeFields = ['address', 'kind', 'contentDigest', 'configurationDigest', 'dependencies', 'availability', 'reason'];
function fields(value: object, expected: string[], label: string): void {
  requireThat(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), `${label} fields do not match its schema`);
}
function sha(value: unknown, label: string): void { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a SHA-256 digest`); }

/** Canonical addresses can be reused unchanged in findings, nudges, cards and output lineage. */
export function qualityAddress(kind: QualityAddressKind, ...segments: string[]): string {
  requireThat(addressKinds.has(kind), 'Unknown quality address kind');
  requireThat(segments.length > 0, 'A quality address needs a namespace or path');
  for (const segment of segments) { text(segment, 'Address segment'); requireThat(segment !== '.' && segment !== '..', 'Address traversal segments are forbidden'); }
  return `quality://${kind}/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}
export function validateQualityAddress(address: string): void {
  text(address, 'Quality address');
  const parsed = /^quality:\/\/(artifact|component|claim|assertion)\/(.+)$/.exec(address);
  requireThat(parsed, 'Use a canonical quality address');
  const segments = parsed[2].split('/').map(segment => decodeURIComponent(segment));
  requireThat(qualityAddress(parsed[1] as QualityAddressKind, ...segments) === address, 'Quality address encoding is not canonical');
}

/** Convenience constructor for JSON/text content. Binary adapters can supply their own content SHA-256. */
export function contentLineageNode(options: { address: string; kind: LineageKind; content: unknown; configuration?: unknown; dependencies?: string[] }): LineageNode {
  return freezeJson({ address: options.address, kind: options.kind, contentDigest: digest(options.content),
    configurationDigest: digest(options.configuration ?? null), dependencies: [...(options.dependencies ?? [])], availability: 'available', reason: null });
}
function validateNode(node: LineageNode): void {
  digest(node); fields(node, nodeFields, 'Lineage node'); validateQualityAddress(node.address);
  requireThat(lineageKinds.has(node.kind), 'Unknown lineage node kind');
  sha(node.configurationDigest, 'Configuration identity');
  unique(node.dependencies, 'Lineage dependencies'); node.dependencies.forEach(validateQualityAddress);
  requireThat(node.availability === 'available' || node.availability === 'unavailable', 'Invalid lineage availability');
  if (node.availability === 'available') { sha(node.contentDigest, 'Content identity'); requireThat(node.reason === null, 'Available content cannot carry an unavailable reason'); }
  else { requireThat(node.contentDigest === null, 'Unavailable content must not invent a content digest'); text(node.reason, 'Unavailable reason'); }
}
function base(node: ResolvedLineageNode): LineageNode {
  return { address: node.address, kind: node.kind, contentDigest: node.contentDigest, configurationDigest: node.configurationDigest,
    dependencies: node.dependencies, availability: node.availability, reason: node.reason };
}

/** Reject invalid topology instead of treating missing or cyclic evidence as an empty dependency set. */
export function compileLineageGraph(input: LineageNode[]): LineageGraph {
  digest(input); requireThat(Array.isArray(input) && input.length > 0, 'A lineage graph needs at least one node');
  const nodes = new Map<string, LineageNode>();
  for (const source of input) {
    validateNode(source); requireThat(!nodes.has(source.address), `Duplicate lineage address: ${source.address}`);
    nodes.set(source.address, { ...structuredClone(source), dependencies: [...source.dependencies].sort() });
  }
  const resolved = new Map<string, ResolvedLineageNode>();
  const pending = new Set<string>();
  const visit = (address: string, chain: string[] = []): ResolvedLineageNode => {
    requireThat(!pending.has(address), `Lineage dependency cycle: ${[...chain, address].join(' -> ')}`);
    const existing = resolved.get(address); if (existing) return existing;
    const node = nodes.get(address); requireThat(node, `Missing lineage dependency: ${address}`);
    pending.add(address);
    const dependencies = node.dependencies.map(dependency => visit(dependency, [...chain, address]));
    const dependencyRevisions = dependencies.map(dependency => ({ address: dependency.address, revisionDigest: dependency.revisionDigest }));
    const unavailableDependencies = [...new Set([
      ...(node.availability === 'unavailable' ? [address] : []),
      ...dependencies.flatMap(dependency => dependency.unavailableDependencies),
    ])].sort();
    const result = { ...node, revisionDigest: digest({ node, dependencyRevisions }), dependencyRevisions,
      available: unavailableDependencies.length === 0, unavailableDependencies };
    pending.delete(address); resolved.set(address, result); return result;
  };
  for (const address of [...nodes.keys()].sort()) visit(address);
  const body = { schemaVersion: 'quality-sgd.lineage/v1' as const, nodes: [...resolved.values()].sort((a, b) => a.address.localeCompare(b.address)) };
  return freezeJson({ ...body, digest: digest(body) });
}
export function validateLineageGraph(graph: LineageGraph): void {
  digest(graph); fields(graph, ['schemaVersion', 'nodes', 'digest'], 'Lineage graph');
  requireThat(graph.schemaVersion === 'quality-sgd.lineage/v1' && Array.isArray(graph.nodes), 'Unsupported lineage graph schema');
  for (const node of graph.nodes) fields(node, [...nodeFields, 'revisionDigest', 'dependencyRevisions', 'available', 'unavailableDependencies'], 'Resolved lineage node');
  const rebuilt = compileLineageGraph(graph.nodes.map(base));
  requireThat(digest(graph) === digest(rebuilt), 'Lineage graph integrity or derived revisions mismatch');
}
function byAddress(graph: LineageGraph, address: string): ResolvedLineageNode {
  validateQualityAddress(address);
  const node = graph.nodes.find(candidate => candidate.address === address);
  requireThat(node, `Required lineage node is missing: ${address}`);
  requireThat(node.available, `Required lineage evidence is unavailable: ${node.unavailableDependencies.join(', ')}`);
  return node;
}
function closure(graph: LineageGraph, addresses: string[]): Array<{ address: string; revisionDigest: string }> {
  const included = new Map<string, string>();
  const visit = (address: string) => {
    if (included.has(address)) return;
    const node = byAddress(graph, address); included.set(address, node.revisionDigest); node.dependencies.forEach(visit);
  };
  addresses.forEach(visit);
  return [...included].map(([address, revisionDigest]) => ({ address, revisionDigest })).sort((a, b) => a.address.localeCompare(b.address));
}

/** Unrelated branch changes do not invalidate a scoped receipt. Every reused branch must remain available. */
export function compareLineageGraphs(previous: LineageGraph, current: LineageGraph) {
  validateLineageGraph(previous); validateLineageGraph(current);
  const oldNodes = new Map(previous.nodes.map(node => [node.address, node]));
  const newNodes = new Map(current.nodes.map(node => [node.address, node]));
  const changed: string[] = [], invalidated: string[] = [], reusable: string[] = [], added: string[] = [], unavailable: string[] = [];
  for (const node of current.nodes) {
    const old = oldNodes.get(node.address);
    if (!node.available) unavailable.push(node.address);
    if (!old) added.push(node.address);
    else if (digest(base(old)) !== digest(base(node))) changed.push(node.address);
    else if (old.revisionDigest !== node.revisionDigest) invalidated.push(node.address);
    else if (old.available && node.available) reusable.push(node.address);
  }
  return freezeJson({ changed, invalidated, reusable, added, unavailable, removed: previous.nodes.filter(node => !newNodes.has(node.address)).map(node => node.address) });
}

/** Bind all chosen environment roots to durable execution; root selection is an explicit adapter obligation. */
export function lineageEnvironmentDigest(graph: LineageGraph, roots: string[], context: unknown = null): string {
  validateLineageGraph(graph); unique(roots, 'Environment roots'); requireThat(roots.length > 0, 'Select at least one environment root');
  return digest({ protocol: 'quality-sgd.lineage-environment/v1', roots: [...roots].sort(), lineage: closure(graph, roots), context });
}
function requirements(graph: LineageGraph, expected: LineageRequirement) {
  digest(expected); fields(expected, ['subject', 'evaluator', 'evaluatorDigest', 'inputDigest', 'schemaDigest'], 'Lineage receipt requirement');
  const subject = byAddress(graph, expected.subject), evaluator = byAddress(graph, expected.evaluator);
  requireThat(evaluator.kind === 'evaluator', 'A lineage receipt must identify an evaluator node');
  sha(expected.evaluatorDigest, 'Evaluator identity'); sha(expected.inputDigest, 'Scoped input identity'); sha(expected.schemaDigest, 'Schema identity');
  requireThat(evaluator.contentDigest === expected.evaluatorDigest, 'Current evaluator identity does not match the evaluator node');
  return { subject, evaluator };
}

export function createLineageReceipt<T>(graph: LineageGraph, expected: LineageRequirement, value: T): LineageReceipt<T> {
  validateLineageGraph(graph);
  const { subject, evaluator } = requirements(graph, expected);
  digest(value);
  const body = { schemaVersion: 'quality-sgd.lineage-receipt/v1' as const, ...expected,
    subjectRevision: subject.revisionDigest, evaluatorRevision: evaluator.revisionDigest,
    valueDigest: digest(value), value: structuredClone(value), lineage: closure(graph, [expected.subject, expected.evaluator]) };
  return freezeJson({ ...body, digest: digest(body) });
}

/** Any malformed, absent, stale or incompatible evidence yields unavailable, never an implicit pass. */
export function reuseLineageReceipt<T>(graph: LineageGraph, receipt: LineageReceipt<T> | null | undefined, expected: LineageRequirement): LineageReuse<T> {
  try {
    validateLineageGraph(graph);
    const { subject, evaluator } = requirements(graph, expected);
    requireThat(receipt, 'Required lineage receipt is missing'); digest(receipt);
    fields(receipt, ['schemaVersion', 'subject', 'subjectRevision', 'evaluator', 'evaluatorRevision', 'evaluatorDigest', 'inputDigest', 'schemaDigest', 'valueDigest', 'value', 'lineage', 'digest'], 'Lineage receipt');
    requireThat(receipt.schemaVersion === 'quality-sgd.lineage-receipt/v1', 'Unsupported lineage receipt schema');
    const { digest: expectedDigest, ...body } = receipt;
    requireThat(expectedDigest === digest(body) && receipt.valueDigest === digest(receipt.value), 'Lineage receipt integrity mismatch');
    for (const key of ['subject', 'evaluator', 'evaluatorDigest', 'inputDigest', 'schemaDigest'] as const) requireThat(receipt[key] === expected[key], `Lineage receipt ${key} changed`);
    requireThat(receipt.subjectRevision === subject.revisionDigest && receipt.evaluatorRevision === evaluator.revisionDigest, 'Lineage receipt is stale for current subject or evaluator dependencies');
    requireThat(digest(receipt.lineage) === digest(closure(graph, [expected.subject, expected.evaluator])), 'Lineage receipt dependency closure changed');
    return { status: 'reusable', value: freezeJson(structuredClone(receipt.value)) };
  } catch (error) { return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }; }
}
