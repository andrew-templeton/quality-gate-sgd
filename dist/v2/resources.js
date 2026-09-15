import { ASSERTION_ZOO } from './catalog.js';
import { CARD_VOCABULARY, EVIDENCE_CONTEXT, catalogContext, compositionContext } from './context.js';
/** Transport-neutral resource descriptors; a caller may register them with its own MCP server. */
export const RESOURCES = [{
        uri: 'quality://v2/assertion-zoo',
        name: 'V2 Assertion Taxonomy and Composition Contract',
        description: 'Assertion families and the declared guarantees of interoperable quality modules.',
        mimeType: 'application/json',
    }, {
        uri: 'quality://v2/assertion-catalog', name: 'Local Assertion Catalog',
        description: 'Caller-supplied modules, hierarchy, applicability and execution contracts.', mimeType: 'application/json',
    }, {
        uri: 'quality://v2/composition-card', name: 'Selected Assertion Subset',
        description: 'Caller-supplied compiled composition with component guarantees and costs.', mimeType: 'application/json',
    }];
export function readResource(uri, supplied = {}) {
    const response = (value) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }] });
    if (uri === RESOURCES[1].uri)
        return response(catalogContext(supplied.modules ?? []));
    if (uri === RESOURCES[2].uri)
        return supplied.gate ? response(compositionContext(supplied.gate)) : response({ status: 'unavailable', reason: 'Supply a compiled gate to describe its selected subset.' });
    if (uri !== RESOURCES[0].uri)
        return undefined;
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
                    schemaVersion: 2, families: ASSERTION_ZOO,
                    vocabulary: CARD_VOCABULARY, evidenceKinds: EVIDENCE_CONTEXT,
                    cardFields: ['id', 'version', 'path', 'input', 'claim', 'evidenceKind', 'assumptions', 'guarantees', 'doesNotGuarantee', 'requires', 'costUpperBound', 'calibration', 'remediation'],
                    outputSchema: 'quality-sgd Observation v2: status, addressed findings, evidence, optional loss bounds with unit, actual cost by unit',
                    composition: 'Required predicates and prerequisites form a conjunction. Advisory checks cannot offset a failure. Missing evidence is unavailable. No composite confidence is inferred.',
                    use: 'Use compileGate/discoverAssertions/modelCard, or quality-gate-v2 zoo/card/run. Register this descriptor with a separately supplied transport if needed.',
                }, null, 2) }] };
}
//# sourceMappingURL=resources.js.map