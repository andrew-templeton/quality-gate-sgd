import { digest, freezeJson, requireThat, text, unique } from './validation.js';
const addressKinds = new Set(['artifact', 'component', 'claim', 'assertion']);
const lineageKinds = new Set(['source', 'asset', 'derived', 'render', 'audience', 'policy', 'view', 'evaluator', 'judgment']);
const nodeFields = ['address', 'kind', 'contentDigest', 'configurationDigest', 'dependencies', 'availability', 'reason'];
function fields(value, expected, label) {
    requireThat(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), `${label} fields do not match its schema`);
}
function sha(value, label) { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a SHA-256 digest`); }
/** Canonical addresses can be reused unchanged in findings, nudges, cards and output lineage. */
export function qualityAddress(kind, ...segments) {
    requireThat(addressKinds.has(kind), 'Unknown quality address kind');
    requireThat(segments.length > 0, 'A quality address needs a namespace or path');
    for (const segment of segments) {
        text(segment, 'Address segment');
        requireThat(segment !== '.' && segment !== '..', 'Address traversal segments are forbidden');
    }
    return `quality://${kind}/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}
export function validateQualityAddress(address) {
    text(address, 'Quality address');
    const parsed = /^quality:\/\/(artifact|component|claim|assertion)\/(.+)$/.exec(address);
    requireThat(parsed, 'Use a canonical quality address');
    const segments = parsed[2].split('/').map(segment => decodeURIComponent(segment));
    requireThat(qualityAddress(parsed[1], ...segments) === address, 'Quality address encoding is not canonical');
}
/** Convenience constructor for JSON/text content. Binary adapters can supply their own content SHA-256. */
export function contentLineageNode(options) {
    return freezeJson({ address: options.address, kind: options.kind, contentDigest: digest(options.content),
        configurationDigest: digest(options.configuration ?? null), dependencies: [...(options.dependencies ?? [])], availability: 'available', reason: null });
}
function validateNode(node) {
    digest(node);
    fields(node, nodeFields, 'Lineage node');
    validateQualityAddress(node.address);
    requireThat(lineageKinds.has(node.kind), 'Unknown lineage node kind');
    sha(node.configurationDigest, 'Configuration identity');
    unique(node.dependencies, 'Lineage dependencies');
    node.dependencies.forEach(validateQualityAddress);
    requireThat(node.availability === 'available' || node.availability === 'unavailable', 'Invalid lineage availability');
    if (node.availability === 'available') {
        sha(node.contentDigest, 'Content identity');
        requireThat(node.reason === null, 'Available content cannot carry an unavailable reason');
    }
    else {
        requireThat(node.contentDigest === null, 'Unavailable content must not invent a content digest');
        text(node.reason, 'Unavailable reason');
    }
}
function base(node) {
    return { address: node.address, kind: node.kind, contentDigest: node.contentDigest, configurationDigest: node.configurationDigest,
        dependencies: node.dependencies, availability: node.availability, reason: node.reason };
}
/** Reject invalid topology instead of treating missing or cyclic evidence as an empty dependency set. */
export function compileLineageGraph(input) {
    digest(input);
    requireThat(Array.isArray(input) && input.length > 0, 'A lineage graph needs at least one node');
    const nodes = new Map();
    for (const source of input) {
        validateNode(source);
        requireThat(!nodes.has(source.address), `Duplicate lineage address: ${source.address}`);
        nodes.set(source.address, { ...structuredClone(source), dependencies: [...source.dependencies].sort() });
    }
    const resolved = new Map();
    const pending = new Set();
    const visit = (address, chain = []) => {
        requireThat(!pending.has(address), `Lineage dependency cycle: ${[...chain, address].join(' -> ')}`);
        const existing = resolved.get(address);
        if (existing)
            return existing;
        const node = nodes.get(address);
        requireThat(node, `Missing lineage dependency: ${address}`);
        pending.add(address);
        const dependencies = node.dependencies.map(dependency => visit(dependency, [...chain, address]));
        const dependencyRevisions = dependencies.map(dependency => ({ address: dependency.address, revisionDigest: dependency.revisionDigest }));
        const unavailableDependencies = [...new Set([
                ...(node.availability === 'unavailable' ? [address] : []),
                ...dependencies.flatMap(dependency => dependency.unavailableDependencies),
            ])].sort();
        const result = { ...node, revisionDigest: digest({ node, dependencyRevisions }), dependencyRevisions,
            available: unavailableDependencies.length === 0, unavailableDependencies };
        pending.delete(address);
        resolved.set(address, result);
        return result;
    };
    for (const address of [...nodes.keys()].sort())
        visit(address);
    const body = { schemaVersion: 'quality-sgd.lineage/v1', nodes: [...resolved.values()].sort((a, b) => a.address.localeCompare(b.address)) };
    return freezeJson({ ...body, digest: digest(body) });
}
export function validateLineageGraph(graph) {
    digest(graph);
    fields(graph, ['schemaVersion', 'nodes', 'digest'], 'Lineage graph');
    requireThat(graph.schemaVersion === 'quality-sgd.lineage/v1' && Array.isArray(graph.nodes), 'Unsupported lineage graph schema');
    for (const node of graph.nodes)
        fields(node, [...nodeFields, 'revisionDigest', 'dependencyRevisions', 'available', 'unavailableDependencies'], 'Resolved lineage node');
    const rebuilt = compileLineageGraph(graph.nodes.map(base));
    requireThat(digest(graph) === digest(rebuilt), 'Lineage graph integrity or derived revisions mismatch');
}
function byAddress(graph, address) {
    validateQualityAddress(address);
    const node = graph.nodes.find(candidate => candidate.address === address);
    requireThat(node, `Required lineage node is missing: ${address}`);
    requireThat(node.available, `Required lineage evidence is unavailable: ${node.unavailableDependencies.join(', ')}`);
    return node;
}
function closure(graph, addresses) {
    const included = new Map();
    const visit = (address) => {
        if (included.has(address))
            return;
        const node = byAddress(graph, address);
        included.set(address, node.revisionDigest);
        node.dependencies.forEach(visit);
    };
    addresses.forEach(visit);
    return [...included].map(([address, revisionDigest]) => ({ address, revisionDigest })).sort((a, b) => a.address.localeCompare(b.address));
}
/** Unrelated branch changes do not invalidate a scoped receipt. Every reused branch must remain available. */
export function compareLineageGraphs(previous, current) {
    validateLineageGraph(previous);
    validateLineageGraph(current);
    const oldNodes = new Map(previous.nodes.map(node => [node.address, node]));
    const newNodes = new Map(current.nodes.map(node => [node.address, node]));
    const changed = [], invalidated = [], reusable = [], added = [], unavailable = [];
    for (const node of current.nodes) {
        const old = oldNodes.get(node.address);
        if (!node.available)
            unavailable.push(node.address);
        if (!old)
            added.push(node.address);
        else if (digest(base(old)) !== digest(base(node)))
            changed.push(node.address);
        else if (old.revisionDigest !== node.revisionDigest)
            invalidated.push(node.address);
        else if (old.available && node.available)
            reusable.push(node.address);
    }
    return freezeJson({ changed, invalidated, reusable, added, unavailable, removed: previous.nodes.filter(node => !newNodes.has(node.address)).map(node => node.address) });
}
/** Bind all chosen environment roots to durable execution; root selection is an explicit adapter obligation. */
export function lineageEnvironmentDigest(graph, roots, context = null) {
    validateLineageGraph(graph);
    unique(roots, 'Environment roots');
    requireThat(roots.length > 0, 'Select at least one environment root');
    return digest({ protocol: 'quality-sgd.lineage-environment/v1', roots: [...roots].sort(), lineage: closure(graph, roots), context });
}
function requirements(graph, expected) {
    digest(expected);
    fields(expected, ['subject', 'evaluator', 'evaluatorDigest', 'inputDigest', 'schemaDigest'], 'Lineage receipt requirement');
    const subject = byAddress(graph, expected.subject), evaluator = byAddress(graph, expected.evaluator);
    requireThat(evaluator.kind === 'evaluator', 'A lineage receipt must identify an evaluator node');
    sha(expected.evaluatorDigest, 'Evaluator identity');
    sha(expected.inputDigest, 'Scoped input identity');
    sha(expected.schemaDigest, 'Schema identity');
    requireThat(evaluator.contentDigest === expected.evaluatorDigest, 'Current evaluator identity does not match the evaluator node');
    return { subject, evaluator };
}
export function createLineageReceipt(graph, expected, value) {
    validateLineageGraph(graph);
    const { subject, evaluator } = requirements(graph, expected);
    digest(value);
    const body = { schemaVersion: 'quality-sgd.lineage-receipt/v1', ...expected,
        subjectRevision: subject.revisionDigest, evaluatorRevision: evaluator.revisionDigest,
        valueDigest: digest(value), value: structuredClone(value), lineage: closure(graph, [expected.subject, expected.evaluator]) };
    return freezeJson({ ...body, digest: digest(body) });
}
/** Any malformed, absent, stale or incompatible evidence yields unavailable, never an implicit pass. */
export function reuseLineageReceipt(graph, receipt, expected) {
    try {
        validateLineageGraph(graph);
        const { subject, evaluator } = requirements(graph, expected);
        requireThat(receipt, 'Required lineage receipt is missing');
        digest(receipt);
        fields(receipt, ['schemaVersion', 'subject', 'subjectRevision', 'evaluator', 'evaluatorRevision', 'evaluatorDigest', 'inputDigest', 'schemaDigest', 'valueDigest', 'value', 'lineage', 'digest'], 'Lineage receipt');
        requireThat(receipt.schemaVersion === 'quality-sgd.lineage-receipt/v1', 'Unsupported lineage receipt schema');
        const { digest: expectedDigest, ...body } = receipt;
        requireThat(expectedDigest === digest(body) && receipt.valueDigest === digest(receipt.value), 'Lineage receipt integrity mismatch');
        for (const key of ['subject', 'evaluator', 'evaluatorDigest', 'inputDigest', 'schemaDigest'])
            requireThat(receipt[key] === expected[key], `Lineage receipt ${key} changed`);
        requireThat(receipt.subjectRevision === subject.revisionDigest && receipt.evaluatorRevision === evaluator.revisionDigest, 'Lineage receipt is stale for current subject or evaluator dependencies');
        requireThat(digest(receipt.lineage) === digest(closure(graph, [expected.subject, expected.evaluator])), 'Lineage receipt dependency closure changed');
        return { status: 'reusable', value: freezeJson(structuredClone(receipt.value)) };
    }
    catch (error) {
        return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=lineage.js.map