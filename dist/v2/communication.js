import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bindInput, defineAssertion, defineOutput, fromAssertion, parseSchema, schema } from './contracts.js';
import { COMMITMENT_OUTPUT, sourceReferenceDigest } from './commitments.js';
import { SURFACE_OUTPUT, validateSurfacePolicy } from './surfaces.js';
import { digest, freezeJson, requireThat, unique } from './validation.js';
const word = schema.string({ minLength: 1 });
const words = schema.array(word);
const audienceSchema = schema.object({ id: word, background: word, decisionExperience: word, knownConcepts: words, unfamiliarConcepts: words });
const taskSchema = schema.object({ id: word, decision: word, requiredCommitmentIds: schema.array(word, { minItems: 1 }), entryElementIds: schema.array(word, { minItems: 1 }) });
const fidelityMode = schema.union(schema.literal('structured-only'), schema.literal('qualified-prose'));
const contractSchema = schema.object({ version: schema.literal('quality-sgd.communication-contract/v1'), audience: audienceSchema, task: taskSchema,
    sourceRevisionDigest: word, sourceReferenceDigest: word, fidelityMode, surfacePolicyDigest: word, collectorDigest: word });
export const COMMUNICATION_INPUT = freezeJson({ schemas: ['quality-sgd.communication-contract@1'], capabilities: ['audience-task-contract'] });
export const COMMUNICATION_OUTPUT = defineOutput({ schemaId: 'quality-sgd.communication-summary', schemaVersion: '1', schema: schema.object({
        contractDigest: word, audienceId: word, taskId: word, sourceReferenceDigest: word, artifactDigest: word, renderDigest: word, fidelityMode,
    }) });
function validateContract(value) {
    const contract = parseSchema(contractSchema, value);
    for (const key of ['sourceRevisionDigest', 'sourceReferenceDigest', 'surfacePolicyDigest', 'collectorDigest'])
        requireThat(/^[a-f0-9]{64}$/.test(contract[key]), `Communication ${key} must be SHA-256`);
    for (const list of [contract.audience.knownConcepts, contract.audience.unfamiliarConcepts, contract.task.requiredCommitmentIds, contract.task.entryElementIds])
        unique(list, 'Communication contract identifiers');
    requireThat(contract.audience.knownConcepts.every(id => !contract.audience.unfamiliarConcepts.includes(id)), 'Audience concepts cannot be both known and unfamiliar');
    return contract;
}
/** Freeze reviewed audience/task requirements before rendering or revising candidates. */
export function defineCommunicationContract(options) {
    digest(options);
    const policy = validateSurfacePolicy(options.surfacePolicy);
    const audience = parseSchema(audienceSchema, options.audience);
    const task = parseSchema(taskSchema, options.task);
    requireThat(digest([...audience.knownConcepts].sort()) === digest([...policy.knownConcepts].sort()), 'Audience knowledge differs from the surface policy');
    requireThat(policy.elements.every(element => element.concepts.every(id => audience.knownConcepts.includes(id) || audience.unfamiliarConcepts.includes(id))), 'Surface concept has no declared audience familiarity');
    requireThat(task.requiredCommitmentIds.every(id => options.source.commitments.some(commitment => commitment.id === id)), 'Task names an unknown source commitment');
    requireThat(policy.states.every(state => task.entryElementIds.every(id => state.entryElements.includes(id))), 'Every required entry state must retain the task entry elements');
    return validateContract({ version: 'quality-sgd.communication-contract/v1', audience, task,
        sourceRevisionDigest: options.source.revisionDigest, sourceReferenceDigest: sourceReferenceDigest(options.source), fidelityMode: options.fidelityMode,
        surfacePolicyDigest: digest(policy), collectorDigest: policy.collectorDigest });
}
/**
 * A typed conjunctive handoff. This binds existing evidence; it does not add a comprehension
 * judgment, infer audience knowledge or average failures into a scalar quality score.
 */
export function communicationScopeModule(supplied) {
    const contract = validateContract(supplied);
    const contractDigest = digest(contract);
    const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
    const implementation = { id: 'quality-sgd/communication-scope', version: '1', digest: createHash('sha256').update(['communication', 'contracts', 'validation'].map(name => readFileSync(new URL(`./${name}${extension}`, import.meta.url), 'utf8')).join('\n')).digest('hex') };
    const prerequisites = {
        source: fromAssertion('source.commitments', COMMITMENT_OUTPUT),
        geometry: fromAssertion('surface.geometry', SURFACE_OUTPUT), inventory: fromAssertion('surface.inventory', SURFACE_OUTPUT),
        total: fromAssertion('surface.total-budget', SURFACE_OUTPUT), novel: fromAssertion('surface.novel-budget', SURFACE_OUTPUT),
    };
    const assertion = defineAssertion({
        card: { id: 'communication.scope', version: '1', title: 'Communication evidence for the registered reader and decision', path: ['control', 'reliability', 'communication'],
            claim: 'Passing source and surface evidence share the registered source, audience/task contract, current artifact and rendered policy.', evidenceKind: 'deterministic',
            input: { ...COMMUNICATION_INPUT, description: 'Current communication contract digest, with typed passing source and surface prerequisite receipts.' },
            assumptions: ['The operator reviewed the source inventory, task requirements and audience familiarity assumptions.', 'The configured collectors and semantic evidence meet their separately stated trust and qualification obligations.'],
            guarantees: ['Every required source, geometry, inventory, total-quanta and novel-quanta prerequisite must pass under matching evidence identities.'],
            doesNotGuarantee: ['Human comprehension, understood information density, preference alignment, causal benefit, a universal fold capacity or global optimum.'],
            requires: Object.values(prerequisites).map(binding => binding.assertionId), costUpperBound: {},
            calibration: { status: 'not-applicable', evidence: [], scope: 'Deterministic conjunction and typed identity checks over existing evidence.' } },
        implementation, configuration: { contract, contractDigest }, applicability: { audience: contract.audience.id, task: contract.task.id, fidelityMode: contract.fidelityMode },
        input: bindInput({ schemaId: 'quality-sgd.communication-contract', schemaVersion: '1', path: ['communication'], capabilities: COMMUNICATION_INPUT.capabilities,
            schema: schema.object({ contractDigest: word }) }), prerequisites, output: COMMUNICATION_OUTPUT,
        async evaluate(context, input, config, upstream) {
            const source = upstream.source;
            const surfaces = [upstream.geometry, upstream.inventory, upstream.total, upstream.novel];
            const failures = [];
            if (input.contractDigest !== config.contractDigest)
                failures.push('Communication contract binding changed');
            if (source.sourceRevisionDigest !== config.contract.sourceRevisionDigest || source.referenceDigest !== config.contract.sourceReferenceDigest ||
                source.candidateRevisionDigest !== context.artifact.digest || source.semanticMode !== config.contract.fidelityMode)
                failures.push('Source evidence does not match the registered source, candidate or fidelity mode');
            if (!config.contract.task.requiredCommitmentIds.every(id => source.preservedCommitmentIds.includes(id)))
                failures.push('A required task commitment has no passing preservation receipt');
            if (!surfaces.every(surface => surface.artifactDigest === context.artifact.digest && surface.environmentDigest === context.environmentDigest &&
                surface.policyDigest === config.contract.surfacePolicyDigest && surface.collectorDigest === config.contract.collectorDigest && surface.renderDigest === surfaces[0].renderDigest))
                failures.push('Surface facets do not share the current render and registered view policy');
            const evidence = [`communication-contract:${config.contractDigest}`, ...Object.values(context.prerequisites ?? {}).map(receipt => receipt.digest)];
            if (failures.length)
                return { status: 'unavailable', findings: failures.map(message => ({ address: `quality://claim/communication/${config.contract.task.id}`, message, evidence })), evidence, actualCost: {} };
            return { status: 'pass', findings: [], evidence, actualCost: {}, output: {
                    contractDigest: config.contractDigest, audienceId: config.contract.audience.id, taskId: config.contract.task.id,
                    sourceReferenceDigest: source.referenceDigest, artifactDigest: context.artifact.digest, renderDigest: surfaces[0].renderDigest, fidelityMode: source.semanticMode,
                } };
        },
    });
    return { id: 'communication-scope', version: contractDigest, includes: ['source-commitments', 'surface-evidence'], assertions: [assertion] };
}
//# sourceMappingURL=communication.js.map