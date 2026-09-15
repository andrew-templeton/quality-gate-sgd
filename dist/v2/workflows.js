import { compileGate } from './catalog.js';
import { assertionContext, compositionContext } from './context.js';
import { inputCompatibility, inputSchemaKey, prepareInput, validateInputContract, validateOutputContract } from './contracts.js';
import { digest, freezeJson, requireThat, text, unique } from './validation.js';
function fields(value, allowed, label) { requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} has an unsupported field`); }
function message(error) { return error instanceof Error ? error.message : String(error); }
function problem(code, assertionId, description) { return { code, assertionId, message: description }; }
function validateWorkflow(workflow) {
    digest(workflow);
    fields(workflow, ['id', 'inputs', 'outputs', 'capabilities'], 'Workflow contract');
    text(workflow.id, 'Workflow ID');
    requireThat(Array.isArray(workflow.inputs) && Array.isArray(workflow.outputs) && workflow.inputs.length + workflow.outputs.length > 0, 'Declare application input or output ports');
    const ports = [...workflow.inputs, ...workflow.outputs];
    ports.forEach(validateInputContract);
    unique(ports.map(port => digest({ schema: inputSchemaKey(port), path: port.path })), 'Workflow port bindings');
    unique(workflow.capabilities, 'Workflow capabilities');
}
function validateRequirement(requirement) {
    digest(requirement);
    fields(requirement, ['id', 'description', 'mode', 'select'], 'Workflow requirement');
    text(requirement.id, 'Requirement ID');
    text(requirement.description, 'Requirement description');
    requireThat(requirement.mode === 'required' || requirement.mode === 'optional', 'Requirement mode must be required or optional');
    requireThat(requirement.select && typeof requirement.select === 'object' && !Array.isArray(requirement.select), 'Requirement selector is required');
    fields(requirement.select, ['assertionIds', 'family', 'query', 'produces'], 'Requirement selector');
    requireThat(Object.keys(requirement.select).length > 0, 'Choose an explicit assertion, family, text hint or output contract');
    if (Object.hasOwn(requirement.select, 'assertionIds')) {
        requireThat(Array.isArray(requirement.select.assertionIds) && requirement.select.assertionIds.length > 0, 'Assertion alternatives cannot be empty');
        unique(requirement.select.assertionIds, 'Assertion alternatives');
    }
    if (Object.hasOwn(requirement.select, 'family')) {
        requireThat(Array.isArray(requirement.select.family) && requirement.select.family.length > 0, 'Family selector cannot be empty');
        requirement.select.family.forEach(part => text(part, 'Family path'));
    }
    if (requirement.select.query !== undefined)
        text(requirement.select.query, 'Search hint');
    if (Object.hasOwn(requirement.select, 'produces'))
        validateOutputContract(requirement.select.produces);
}
export function workflowAvailable(workflow) {
    validateWorkflow(workflow);
    return freezeJson({ schemas: [...new Set([...workflow.inputs, ...workflow.outputs].map(inputSchemaKey))].sort(), capabilities: [...workflow.capabilities].sort() });
}
function reasons(assertion, requirement) {
    const selected = requirement.select;
    const card = assertion.card;
    const result = [];
    if (selected.assertionIds) {
        if (!selected.assertionIds.includes(card.id))
            return null;
        result.push(`Explicit assertion alternative: ${card.id}`);
    }
    if (selected.family) {
        if (!selected.family.every((part, index) => card.path[index] === part))
            return null;
        result.push(`Declared family prefix: ${selected.family.join('/')}; inspect the exact claim and scope`);
    }
    if (selected.query) {
        const haystack = [card.id, card.title, card.claim, ...card.path, card.input.description].join(' ').toLowerCase();
        if (!selected.query.toLowerCase().split(/\s+/).every(word => haystack.includes(word)))
            return null;
        result.push(`Metadata text hint: ${selected.query}; this does not establish semantic equivalence`);
    }
    if (selected.produces) {
        if (!assertion.contract?.output || digest(assertion.contract.output) !== digest(selected.produces))
            return null;
        result.push(`Exact declared evidence output: ${inputSchemaKey(selected.produces)}`);
    }
    return result;
}
function inspectInput(assertion, workflow, sample) {
    const assertionId = assertion.card.id;
    const result = { assertionId, missingSchemas: [], missingCapabilities: [], matchingPorts: [], runtime: 'not-supplied', problems: [] };
    if (!assertion.contract) {
        result.problems.push(problem('legacy-contract', assertionId, 'An executable standard input contract is required'));
        return result;
    }
    const input = assertion.contract.input;
    try {
        validateInputContract(input);
        const available = workflowAvailable(workflow);
        const compatible = inputCompatibility(input, available);
        result.missingSchemas = compatible.missingSchemas;
        result.missingCapabilities = compatible.missingCapabilities;
        for (const schema of compatible.missingSchemas)
            result.problems.push(problem('missing-schema', assertionId, `Missing workflow schema: ${schema}`));
        for (const capability of compatible.missingCapabilities)
            result.problems.push(problem('missing-capability', assertionId, `Missing workflow capability: ${capability}`));
        for (const side of ['input', 'output'])
            for (const port of side === 'input' ? workflow.inputs : workflow.outputs) {
                if (inputSchemaKey(port) === inputSchemaKey(input) && digest(port.schema) === digest(input.schema) && digest(port.path) === digest(input.path))
                    result.matchingPorts.push({ side, schema: inputSchemaKey(port), path: [...port.path] });
            }
        if (compatible.missingSchemas.length === 0 && result.matchingPorts.length === 0)
            result.problems.push(problem('binding-mismatch', assertionId, 'The schema name/version exists but its runtime shape or artifact path differs from the module binding'));
        if (sample) {
            try {
                // evaluateGate validates these envelope identities before binding payload data.
                text(sample.artifact.id, 'Artifact ID');
                text(sample.artifact.digest, 'Artifact digest');
                text(sample.environmentDigest, 'Environment digest');
                prepareInput(input, { ...sample, available });
                result.runtime = 'valid';
            }
            catch (error) {
                result.runtime = 'invalid';
                result.problems.push(problem('runtime-input-invalid', assertionId, message(error)));
            }
        }
    }
    catch (error) {
        result.problems.push(problem('invalid-input-contract', assertionId, message(error)));
    }
    return result;
}
function requiredClosure(gate) {
    const required = new Set();
    const visit = (id) => { if (required.has(id))
        return; required.add(id); gate.assertions.find(assertion => assertion.card.id === id)?.card.requires.forEach(visit); };
    gate.policy.required.forEach(visit);
    return required;
}
function qualificationProblems(gate) {
    const hard = requiredClosure(gate);
    return gate.assertions.filter(assertion => hard.has(assertion.card.id) && assertion.card.evidenceKind === 'model-judgment' && assertion.card.calibration.status !== 'qualified')
        .map(assertion => problem('required-gate-unqualified', assertion.card.id, 'This required assertion or prerequisite is an unqualified model judgment; proposal cannot authorize required-gate use'));
}
function makeProposal(options, assignments) {
    const selected = assignments.flatMap((candidate, index) => candidate ? [{ requirementId: options.requirements[index].id, moduleId: candidate.moduleId, assertionId: candidate.assertionId, mode: options.requirements[index].mode }] : []);
    const modules = [...new Set(selected.map(value => value.moduleId))].sort();
    const required = [...new Set(selected.filter(value => value.mode === 'required').map(value => value.assertionId))].sort();
    const advisory = [...new Set(selected.filter(value => value.mode === 'optional').map(value => value.assertionId))].filter(id => !required.includes(id)).sort();
    const policy = { required, advisory };
    const body = { selected, omittedOptional: options.requirements.filter((requirement, index) => requirement.mode === 'optional' && assignments[index] === null).map(requirement => requirement.id), modules, policy };
    const proposal = { id: digest(body), ...body, status: 'invalid', problems: [], orderedAssertions: [], handoffs: [], inputs: [], context: null, compiledDigest: null };
    try {
        const gate = compileGate(options.catalog, modules, policy);
        proposal.compiledDigest = gate.digest;
        proposal.orderedAssertions = gate.assertions.map(assertion => assertion.card.id);
        proposal.inputs = gate.assertions.map(assertion => inspectInput(assertion, options.workflow, options.sample));
        proposal.problems.push(...proposal.inputs.flatMap(input => input.problems), ...qualificationProblems(gate));
        proposal.context = compositionContext(gate);
        for (const assertion of gate.assertions)
            for (const [name, binding] of Object.entries(assertion.contract?.prerequisites ?? {}))
                proposal.handoffs.push({ from: binding.assertionId, to: assertion.card.id, name, schema: inputSchemaKey(binding.output), schemaDigest: digest(binding.output), status: 'contract-compatible-not-executed' });
        proposal.status = proposal.problems.length > 0 ? 'incomplete' : options.sample ? 'validated-inputs' : 'declaration-compatible';
    }
    catch (error) {
        proposal.problems.push(problem('composition-invalid', null, message(error)));
    }
    return proposal;
}
/** Bounded local proposal enumeration. Its deterministic order is not a preference or optimality ranking. */
export function proposeWorkflowCompositions(supplied) {
    validateWorkflow(supplied.workflow);
    requireThat(Array.isArray(supplied.requirements) && supplied.requirements.length > 0, 'Workflow requirements are required');
    supplied.requirements.forEach(validateRequirement);
    unique(supplied.requirements.map(requirement => requirement.id), 'Requirement IDs');
    requireThat(supplied.requirements.some(requirement => requirement.mode === 'required'), 'Select at least one required assertion requirement');
    digest(supplied.limits);
    fields(supplied.limits, ['maxAssignments', 'maxProposals'], 'Enumeration limits');
    for (const limit of [supplied.limits.maxAssignments, supplied.limits.maxProposals])
        requireThat(Number.isSafeInteger(limit) && limit > 0, 'Enumeration limits must be positive safe integers');
    requireThat(Array.isArray(supplied.catalog) && supplied.catalog.length > 0, 'Supply a local module catalog');
    unique(supplied.catalog.map(module => module.id), 'Catalog module IDs');
    if (supplied.sample)
        digest(supplied.sample);
    const options = { ...supplied, workflow: freezeJson(structuredClone(supplied.workflow)), requirements: freezeJson(structuredClone(supplied.requirements)), limits: freezeJson(structuredClone(supplied.limits)), ...(supplied.sample ? { sample: freezeJson(structuredClone(supplied.sample)) } : {}) };
    const available = workflowAvailable(options.workflow);
    const requirements = options.requirements.map(requirement => {
        const alternatives = [];
        for (const module of options.catalog)
            for (const assertion of module.assertions) {
                const matchReasons = reasons(assertion, requirement);
                if (!matchReasons)
                    continue;
                const input = inspectInput(assertion, options.workflow, options.sample);
                const candidate = { moduleId: module.id, assertionId: assertion.card.id, matchReasons, input, context: null, problems: [...input.problems] };
                try {
                    candidate.context = assertionContext(assertion);
                }
                catch (error) {
                    candidate.problems.push(problem('invalid-contract', assertion.card.id, message(error)));
                }
                if (requirement.mode === 'required' && assertion.card.evidenceKind === 'model-judgment' && assertion.card.calibration.status !== 'qualified')
                    candidate.problems.push(problem('required-gate-unqualified', assertion.card.id, 'Matching model judgment is advisory-only until its required-gate qualification is established'));
                alternatives.push(candidate);
            }
        alternatives.sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.assertionId.localeCompare(b.assertionId));
        return { requirement, alternatives, status: alternatives.length ? 'candidates-for-inspection' : 'unsupported' };
    });
    const unsupportedRequirements = requirements.filter(value => value.alternatives.length === 0).map(value => ({ id: value.requirement.id, mode: value.requirement.mode, reason: 'No locally supplied assertion matches every explicit selector; no unverified substitute was invented' }));
    const optionsPerRequirement = requirements.map(value => value.requirement.mode === 'optional' ? [null, ...value.alternatives] : value.alternatives);
    const totalAssignments = optionsPerRequirement.reduce((total, choices) => total * BigInt(choices.length), 1n);
    const proposals = [];
    let considered = 0;
    const seen = new Set();
    function* assignments(index = 0, prefix = []) {
        if (index === optionsPerRequirement.length) {
            yield prefix;
            return;
        }
        for (const choice of optionsPerRequirement[index])
            yield* assignments(index + 1, [...prefix, choice]);
    }
    for (const selected of assignments()) {
        if (considered >= options.limits.maxAssignments || proposals.length >= options.limits.maxProposals)
            break;
        considered++;
        const proposal = makeProposal(options, selected);
        const key = proposal.compiledDigest ?? digest({ modules: proposal.modules, policy: proposal.policy });
        if (seen.has(key))
            continue;
        seen.add(key);
        proposals.push(proposal);
    }
    const complete = BigInt(considered) === totalAssignments;
    return freezeJson({ schemaVersion: 'quality-sgd.workflow-plan/v1', workflow: options.workflow, workflowDigest: digest(options.workflow), available,
        requirements, unsupportedRequirements, proposals,
        enumeration: { ...options.limits, consideredAssignments: considered, totalAssignments: totalAssignments.toString(), returnedProposals: proposals.length, complete, truncated: !complete },
        interpretation: [
            'Proposals enumerate declared candidates in deterministic catalog order; this is not a semantic-equivalence, utility or optimality ranking.',
            'Input validation establishes the current supplied shape only. Collection completeness, freshness, domain validity and audience fit remain module-specific obligations.',
            'Required predicates form a conjunction. Optional facets are advisory and cannot offset a required failure; unqualified required judgments remain ineligible.',
            'No evaluator, report collector or remediation harness ran; no configuration, qualification, budget or execution authority was changed.',
        ] });
}
//# sourceMappingURL=workflows.js.map