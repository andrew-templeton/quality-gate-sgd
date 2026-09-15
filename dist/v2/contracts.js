import { digest, freezeJson, requireThat, text, unique } from './validation.js';
const valueSchema = (definition) => freezeJson({ definition });
export const schema = {
    json: () => valueSchema({ kind: 'json' }),
    string: (options = {}) => valueSchema({ kind: 'string', ...options }),
    number: (options = {}) => valueSchema({ kind: 'number', ...options }),
    boolean: () => valueSchema({ kind: 'boolean' }),
    literal: (value) => valueSchema({ kind: 'literal', value }),
    array: (items, options = {}) => valueSchema({ kind: 'array', items: items.definition, ...options }),
    object: (properties) => valueSchema({
        kind: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value.definition])), optional: [], additionalProperties: false,
    }),
    union: (...variants) => valueSchema({ kind: 'union', variants: variants.map(value => value.definition) }),
};
function fields(value, allowed, label) {
    requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} has an unsupported field`);
}
function nonnegativeInteger(value, label) {
    requireThat(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative safe integer`);
}
export function validateSchema(node) {
    digest(node);
    requireThat(node && typeof node === 'object' && !Array.isArray(node), 'Schema node must be an object');
    switch (node.kind) {
        case 'json':
            fields(node, ['kind'], 'JSON schema');
            break;
        case 'string':
            fields(node, ['kind', 'minLength'], 'String schema');
            if (node.minLength !== undefined)
                nonnegativeInteger(node.minLength, 'minLength');
            break;
        case 'number':
            fields(node, ['kind', 'integer', 'minimum', 'maximum'], 'Number schema');
            if (node.integer !== undefined)
                requireThat(typeof node.integer === 'boolean', 'integer must be boolean');
            for (const bound of [node.minimum, node.maximum])
                if (bound !== undefined)
                    requireThat(Number.isFinite(bound), 'Numeric bounds must be finite');
            if (node.minimum !== undefined && node.maximum !== undefined)
                requireThat(node.minimum <= node.maximum, 'Numeric bounds are reversed');
            break;
        case 'boolean':
            fields(node, ['kind'], 'Boolean schema');
            break;
        case 'literal':
            fields(node, ['kind', 'value'], 'Literal schema');
            requireThat(node.value === null || ['string', 'boolean'].includes(typeof node.value) || typeof node.value === 'number' && Number.isFinite(node.value), 'Invalid literal');
            break;
        case 'array':
            fields(node, ['kind', 'items', 'minItems', 'maxItems'], 'Array schema');
            validateSchema(node.items);
            for (const bound of [node.minItems, node.maxItems])
                if (bound !== undefined)
                    nonnegativeInteger(bound, 'Array bound');
            if (node.minItems !== undefined && node.maxItems !== undefined)
                requireThat(node.minItems <= node.maxItems, 'Array bounds are reversed');
            break;
        case 'object':
            fields(node, ['kind', 'properties', 'optional', 'additionalProperties'], 'Object schema');
            requireThat(node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties), 'Schema properties required');
            unique(node.optional, 'Optional properties');
            requireThat(node.optional.every(key => Object.hasOwn(node.properties, key)), 'Optional property is undeclared');
            requireThat(typeof node.additionalProperties === 'boolean', 'additionalProperties must be explicit');
            for (const [key, child] of Object.entries(node.properties)) {
                text(key, 'Property name');
                validateSchema(child);
            }
            break;
        case 'union':
            fields(node, ['kind', 'variants'], 'Union schema');
            requireThat(Array.isArray(node.variants) && node.variants.length > 0, 'Union variants required');
            node.variants.forEach(validateSchema);
            break;
        default: throw new Error('Unsupported schema kind');
    }
}
function match(node, value, address) {
    const fail = (condition, reason) => requireThat(condition, `${address}: ${reason}`);
    switch (node.kind) {
        case 'json': return;
        case 'string':
            fail(typeof value === 'string' && value.length >= (node.minLength ?? 0), 'expected string of required length');
            return;
        case 'number':
            fail(typeof value === 'number' && Number.isFinite(value) && (!node.integer || Number.isSafeInteger(value)) && value >= (node.minimum ?? -Infinity) && value <= (node.maximum ?? Infinity), 'expected number within declared bounds');
            return;
        case 'boolean':
            fail(typeof value === 'boolean', 'expected boolean');
            return;
        case 'literal':
            fail(value === node.value, 'literal mismatch');
            return;
        case 'array':
            requireThat(Array.isArray(value), `${address}: expected array`);
            fail(value.length >= (node.minItems ?? 0) && value.length <= (node.maxItems ?? Infinity), 'array length outside bounds');
            value.forEach((entry, index) => match(node.items, entry, `${address}/${index}`));
            return;
        case 'object': {
            requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${address}: expected object`);
            const record = value;
            if (!node.additionalProperties)
                fail(Object.keys(record).every(key => Object.hasOwn(node.properties, key)), 'unexpected property');
            for (const [key, child] of Object.entries(node.properties)) {
                if (!Object.hasOwn(record, key))
                    fail(node.optional.includes(key), `missing ${key}`);
                else
                    match(child, record[key], `${address}/${key}`);
            }
            return;
        }
        case 'union': {
            for (const variant of node.variants) {
                try {
                    match(variant, value, address);
                    return;
                }
                catch { /* Try the declared alternative. */ }
            }
            throw new Error(`${address}: no declared union alternative matched`);
        }
    }
}
export function parseSchema(definition, input) {
    validateSchema(definition.definition);
    digest(input); // Reject non-JSON data rather than dropping it during cloning.
    match(definition.definition, input, '$');
    return freezeJson(structuredClone(input));
}
export function defineOutput(options) {
    const output = { schemaId: options.schemaId, schemaVersion: options.schemaVersion, schema: options.schema.definition };
    validateOutputContract(output);
    return freezeJson(structuredClone(output));
}
export function fromAssertion(assertionId, output) {
    text(assertionId, 'Prerequisite assertion ID');
    validateOutputContract(output);
    return freezeJson(structuredClone({ assertionId, output }));
}
export function validateOutputContract(output) {
    digest(output);
    fields(output, ['schemaId', 'schemaVersion', 'schema'], 'Output contract');
    validateInputContract({ ...output, path: [], capabilities: [] });
}
export function bindInput(options) {
    const binding = { schemaId: options.schemaId, schemaVersion: options.schemaVersion, schema: options.schema.definition, path: options.path ?? [], capabilities: options.capabilities ?? [] };
    validateInputContract(binding);
    return freezeJson(structuredClone(binding));
}
export function inputSchemaKey(input) { return `${input.schemaId}@${input.schemaVersion}`; }
export function validateInputContract(input) {
    digest(input);
    fields(input, ['schemaId', 'schemaVersion', 'schema', 'path', 'capabilities'], 'Input binding');
    text(input.schemaId, 'Schema ID');
    text(input.schemaVersion, 'Schema version');
    requireThat(!input.schemaId.includes('@') && !input.schemaVersion.includes('@'), 'Schema ID and version must not contain the @ separator');
    requireThat(Array.isArray(input.path), 'Input path required');
    input.path.forEach(key => text(key, 'Input path field'));
    unique(input.capabilities, 'Input capabilities');
    validateSchema(input.schema);
    digest(input);
}
export function inputCompatibility(contract, available) {
    const key = inputSchemaKey(contract);
    const missingSchemas = available?.schemas.includes(key) ? [] : [key];
    const missingCapabilities = contract.capabilities.filter(value => !available?.capabilities.includes(value));
    return { missingSchemas, missingCapabilities, declaredCompatible: missingSchemas.length === 0 && missingCapabilities.length === 0 };
}
export function prepareInput(contract, context) {
    const compatibility = inputCompatibility(contract, context.available);
    requireThat(compatibility.declaredCompatible, `Input contract unavailable: ${[...compatibility.missingSchemas, ...compatibility.missingCapabilities].join(', ')}`);
    let value = context.artifact.data;
    for (const field of contract.path) {
        requireThat(value !== null && typeof value === 'object' && Object.hasOwn(value, field), `Input path missing: ${field}`);
        value = value[field];
    }
    return parseSchema({ definition: contract.schema }, value);
}
export function evaluatorIdentity(contract) {
    return digest({ protocol: contract.protocol, implementation: contract.implementation, configuration: contract.configuration, applicability: contract.applicability, statementDigest: contract.statementDigest, input: contract.input,
        ...(Object.hasOwn(contract, 'output') ? { output: contract.output } : {}), ...(Object.hasOwn(contract, 'prerequisites') ? { prerequisites: contract.prerequisites } : {}) });
}
export function assertionStatement(card) {
    return digest({ id: card.id, claim: card.claim, evidenceKind: card.evidenceKind, assumptions: card.assumptions,
        guarantees: card.guarantees, doesNotGuarantee: card.doesNotGuarantee, requires: card.requires });
}
export function validateAssertionContract(contract) {
    digest(contract);
    fields(contract, ['protocol', 'implementation', 'configuration', 'applicability', 'statementDigest', 'input', 'output', 'prerequisites', 'evaluatorDigest'], 'Assertion contract');
    requireThat(contract.protocol === 'quality-sgd.assertion/v1', 'Unsupported assertion protocol');
    fields(contract.implementation, ['id', 'version', 'digest'], 'Implementation identity');
    for (const key of ['id', 'version', 'digest'])
        text(contract.implementation[key], `Implementation ${key}`);
    requireThat(/^[a-f0-9]{64}$/.test(contract.implementation.digest), 'Implementation digest must be SHA-256');
    requireThat(/^[a-f0-9]{64}$/.test(contract.statementDigest), 'Statement digest must be SHA-256');
    validateInputContract(contract.input);
    if (Object.hasOwn(contract, 'output'))
        validateOutputContract(contract.output);
    if (Object.hasOwn(contract, 'prerequisites')) {
        requireThat(contract.prerequisites !== null && typeof contract.prerequisites === 'object' && !Array.isArray(contract.prerequisites), 'Prerequisite bindings must be a record');
        for (const [name, prerequisite] of Object.entries(contract.prerequisites)) {
            text(name, 'Prerequisite binding name');
            fields(prerequisite, ['assertionId', 'output'], 'Prerequisite binding');
            text(prerequisite.assertionId, 'Prerequisite assertion');
            validateOutputContract(prerequisite.output);
        }
    }
    requireThat(contract.evaluatorDigest === evaluatorIdentity(contract), 'Evaluator identity mismatch');
}
/**
 * Semantic configuration is passed as a frozen snapshot, never as the caller's object.
 * Implementation identity is an integrity declaration, not attestation of honest JavaScript.
 * Evaluators must use the supplied configuration; undeclared mutable closure state violates this contract.
 */
export function defineAssertion(definition) {
    digest(definition.card);
    const supplied = { protocol: 'quality-sgd.assertion/v1', implementation: definition.implementation,
        configuration: definition.configuration, applicability: definition.applicability, statementDigest: assertionStatement(definition.card), input: definition.input,
        ...(Object.hasOwn(definition, 'output') ? { output: definition.output } : {}), ...(Object.hasOwn(definition, 'prerequisites') ? { prerequisites: definition.prerequisites } : {}) };
    digest(supplied); // Validate before cloning can erase unsupported metadata or execute accessors.
    const body = freezeJson(structuredClone(supplied));
    const contract = freezeJson({ ...body, evaluatorDigest: evaluatorIdentity(body) });
    validateAssertionContract(contract);
    const card = freezeJson(structuredClone({ ...definition.card, input: { ...definition.card.input,
            schemas: [inputSchemaKey(contract.input)], capabilities: contract.input.capabilities } }));
    const run = definition.evaluate.bind(undefined);
    return Object.freeze({ card, contract, async evaluate(context) {
            const values = Object.fromEntries(Object.entries(contract.prerequisites ?? {}).map(([name, prerequisite]) => {
                const evidence = context.prerequisites?.[name];
                requireThat(evidence && evidence.assertionId === prerequisite.assertionId && evidence.schemaDigest === digest(prerequisite.output), `Prerequisite evidence missing or incompatible: ${name}`);
                validateOutputEvidence(evidence);
                return [name, parseSchema({ definition: prerequisite.output.schema }, evidence.value)];
            }));
            return run(context, prepareInput(contract.input, context), contract.configuration, freezeJson(values));
        } });
}
export function validateOutputEvidence(evidence) {
    digest(evidence);
    fields(evidence, ['assertionId', 'evaluatorDigest', 'inputDigest', 'schemaDigest', 'valueDigest', 'dependencies', 'value', 'digest'], 'Output evidence');
    const { digest: expected, ...body } = evidence;
    requireThat(expected === digest(body) && evidence.valueDigest === digest(evidence.value), 'Output evidence integrity mismatch');
    for (const name of ['assertionId', 'evaluatorDigest', 'inputDigest', 'schemaDigest'])
        text(evidence[name], `Output ${name}`);
    unique(evidence.dependencies, 'Output dependency digests');
    for (const value of [evidence.evaluatorDigest, evidence.inputDigest, evidence.schemaDigest, evidence.valueDigest, ...evidence.dependencies]) {
        requireThat(/^[a-f0-9]{64}$/.test(value), 'Output identities must be SHA-256 digests');
    }
}
//# sourceMappingURL=contracts.js.map