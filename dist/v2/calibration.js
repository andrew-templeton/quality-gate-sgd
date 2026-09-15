import { randomInt, randomUUID } from 'node:crypto';
import { digest, requireThat, text, unique } from './validation.js';
const maximumPairs = 10_000;
function count(value, label, minimum = 1) {
    requireThat(Number.isSafeInteger(value) && value >= minimum && value <= maximumPairs, `${label} must be an integer in [${minimum}, ${maximumPairs}]`);
}
function probability(value, label, open = false) {
    requireThat(Number.isFinite(value) && (open ? value > 0 && value < 1 : value >= 0 && value <= 1), `${label} must lie in ${open ? '(0,1)' : '[0,1]'}`);
}
function validateUse(use) {
    count(use.priorAnalyses, 'Prior analyses', 0);
    requireThat(typeof use.adaptedUsingTheseCases === 'boolean' && typeof use.independentUnits === 'boolean', 'Evidence-use attestations must be explicit booleans');
    return use.priorAnalyses === 0 && !use.adaptedUsingTheseCases && use.independentUnits;
}
function validateProtocol(protocol) {
    [protocol.id, protocol.version, protocol.question, protocol.baselineVersion, protocol.candidateVersion,
        protocol.samplingFrame, protocol.unitOfIndependence].forEach(value => text(value, 'Preference protocol field'));
    count(protocol.plannedPairs, 'Planned pairs');
    count(protocol.minimumDecisivePairs, 'Minimum decisive pairs');
    requireThat(protocol.minimumDecisivePairs <= protocol.plannedPairs, 'Minimum decisive pairs exceed planned pairs');
    probability(protocol.alpha, 'Alpha', true);
    requireThat(['confirmatory', 'exploratory'].includes(protocol.mode), 'Unknown analysis mode');
}
function packetDigest(packet) {
    return digest({ schemaVersion: packet.schemaVersion, id: packet.id, question: packet.question, pairs: packet.pairs });
}
function keyDigest(key) {
    return digest({ schemaVersion: key.schemaVersion, packetId: key.packetId, packetDigest: key.packetDigest,
        protocol: key.protocol, protocolDigest: key.protocolDigest, assignments: key.assignments });
}
/**
 * Independent fair assignment to A/B, then a random permutation; no condition metadata enters the packet.
 * The caller must remove identifying text from prompts and displayed artifacts. Content can still unblind.
 * Store the protocol/key before play; do not expose the returned key to participants.
 */
export function preparePreferenceTrial(protocol, cases) {
    validateProtocol(protocol);
    requireThat(Array.isArray(cases) && cases.length === protocol.plannedPairs, 'Provide exactly the preregistered number of pairs');
    unique(cases.map(item => item.id), 'Case IDs');
    const entries = cases.map(item => {
        [item.prompt, item.baseline, item.candidate].forEach(value => text(value, 'Display text'));
        const id = randomUUID();
        const candidateSide = randomInt(2) === 0 ? 'A' : 'B';
        return {
            pair: { id, prompt: item.prompt, A: candidateSide === 'A' ? item.candidate : item.baseline, B: candidateSide === 'B' ? item.candidate : item.baseline },
            assignment: { pairId: id, caseId: item.id, candidateSide },
        };
    });
    for (let i = entries.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const packetBody = { schemaVersion: '1', id: randomUUID(), question: protocol.question, pairs: entries.map(entry => entry.pair) };
    const packet = { ...packetBody, digest: packetDigest(packetBody) };
    const frozenProtocol = structuredClone(protocol);
    const keyBody = { schemaVersion: '1', packetId: packet.id, packetDigest: packet.digest,
        protocol: frozenProtocol, protocolDigest: digest(frozenProtocol), assignments: entries.map(entry => entry.assignment) };
    return { packet, answerKey: { ...keyBody, digest: keyDigest(keyBody) } };
}
function validateTrial(packet, key) {
    validateProtocol(key.protocol);
    requireThat(packet.schemaVersion === '1' && key.schemaVersion === '1', 'Unsupported calibration packet version');
    requireThat(packet.digest === packetDigest(packet), 'Play packet content changed');
    requireThat(key.digest === keyDigest(key) && key.protocolDigest === digest(key.protocol), 'Answer key or protocol changed');
    requireThat(key.packetId === packet.id && key.packetDigest === packet.digest, 'Answer key does not match this packet');
    requireThat(packet.question === key.protocol.question, 'Question does not match protocol');
    requireThat(packet.pairs.length === key.protocol.plannedPairs && key.assignments.length === packet.pairs.length, 'Pair count does not match protocol');
    unique(packet.pairs.map(pair => pair.id), 'Packet pair IDs');
    unique(key.assignments.map(assignment => assignment.pairId), 'Answer key pair IDs');
    unique(key.assignments.map(assignment => assignment.caseId), 'Answer key case IDs');
    const pairs = new Set(packet.pairs.map(pair => pair.id));
    requireThat(key.assignments.every(assignment => pairs.has(assignment.pairId) && ['A', 'B'].includes(assignment.candidateSide)), 'Invalid answer key assignment');
}
/** Binomial CDF using a log-space recurrence; finite-sample formula, floating-point evaluation. */
function binomialCdf(k, n, p) {
    if (k < 0)
        return 0;
    if (k >= n || p === 0)
        return 1;
    if (p === 1)
        return 0;
    let term = n * Math.log1p(-p);
    let sum = term;
    for (let i = 1; i <= k; i++) {
        term += Math.log(n - i + 1) - Math.log(i) + Math.log(p) - Math.log1p(-p);
        const larger = Math.max(sum, term);
        sum = larger + Math.log1p(Math.exp(Math.min(sum, term) - larger));
    }
    return Math.min(1, Math.exp(sum));
}
function upperErrorBound(errors, n, tailAlpha) {
    if (n === 0)
        return null;
    if (errors === n)
        return 1;
    if (errors === 0)
        return -Math.expm1(Math.log(tailAlpha) / n);
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 60; iteration++) {
        const middle = (lower + upper) / 2;
        if (binomialCdf(errors, n, middle) > tailAlpha)
            lower = middle;
        else
            upper = middle;
    }
    return upper;
}
/**
 * One-sided exact sign test H0: P(candidate preferred | decisive pair) <= 1/2.
 * Ties are excluded from that estimand and reported; abstention/missingness blocks a confirmatory verdict.
 * No optional stopping, repeated-look or multiple-comparison correction is supplied.
 */
export function assessPreferenceTrial(packet, answerKey, responses, use) {
    validateTrial(packet, answerKey);
    const freshIndependentEvidence = validateUse(use);
    requireThat(Array.isArray(responses), 'Responses must be an array');
    unique(responses.map(response => response.pairId), 'Response pair IDs');
    const assignments = new Map(answerKey.assignments.map(assignment => [assignment.pairId, assignment]));
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let cannotJudge = 0;
    for (const response of responses) {
        requireThat(response.packetId === packet.id && response.packetDigest === packet.digest, 'Response is bound to a different packet/version');
        const assignment = assignments.get(response.pairId);
        requireThat(assignment, 'Response references an unknown pair');
        requireThat(['A', 'B', 'tie', 'cannot-judge'].includes(response.choice), 'Invalid preference choice');
        if (response.choice === 'tie')
            ties++;
        else if (response.choice === 'cannot-judge')
            cannotJudge++;
        else if (response.choice === assignment.candidateSide)
            wins++;
        else
            losses++;
    }
    const protocol = answerKey.protocol;
    const missing = protocol.plannedPairs - responses.length;
    const decisive = wins + losses;
    const complete = missing === 0 && cannotJudge === 0;
    // Do not reveal interim p-values through this API: the fixed sample must be complete first.
    const pValue = complete && decisive > 0 ? binomialCdf(losses, decisive, 0.5) : null;
    const reasons = [];
    if (missing > 0)
        reasons.push(`${missing} responses are missing`);
    if (cannotJudge > 0)
        reasons.push(`${cannotJudge} pairs could not be judged`);
    if (decisive < protocol.minimumDecisivePairs)
        reasons.push('Preregistered minimum decisive sample was not reached');
    if (protocol.mode !== 'confirmatory')
        reasons.push('Protocol was registered for exploration');
    if (!freshIndependentEvidence)
        reasons.push('Fresh, independent, unadapted first-use evidence was not attested');
    const status = !complete || decisive < protocol.minimumDecisivePairs ? 'insufficient-evidence'
        : protocol.mode !== 'confirmatory' || !freshIndependentEvidence ? 'exploratory-only'
            : pValue !== null && pValue <= protocol.alpha ? 'supports-preference-improvement'
                : 'no-demonstrated-improvement';
    return {
        kind: 'paired-preference', status, packetDigest: packet.digest, protocolDigest: answerKey.protocolDigest,
        responseDigest: digest([...responses].sort((a, b) => a.pairId.localeCompare(b.pairId))),
        evidenceUse: { ...use }, plannedPairs: protocol.plannedPairs, wins, losses, ties, cannotJudge, missing, decisive,
        pValue, alpha: protocol.alpha, reasons,
        estimand: 'Candidate preference probability conditional on a decisive pair in the registered sampling frame.',
        guarantees: ['Under the registered fixed-sample protocol and independent pair assumptions, the one-sided sign test controls type I error at alpha for this single comparison.'],
        doesNotGuarantee: [
            'Preference is not factual correctness, semantic fidelity, safety, or verifier calibration.',
            'This does not show improvement for tied, unjudgeable, excluded, or out-of-scope cases.',
            'Digests bind supplied data; they do not authenticate preregistration or prevent callers from concealing prior analyses, selecting outcomes, or reusing cases.',
            'Repeated looks, adaptive changes, correlated pairs and multiple candidate comparisons require a separate design; no anytime or familywise guarantee is supplied.',
            'Random assignment conceals condition metadata, but caller-provided content can reveal identity. Numerical evaluation uses floating-point arithmetic.',
        ],
    };
}
/**
 * Separate known-label calibration: simultaneous one-sided Clopper-Pearson upper bounds
 * for false acceptance and false rejection, with alpha/2 Bonferroni allocation per class.
 * Labels, sampling and preregistration are caller-supplied evidence, not inferred truth.
 */
export function assessVerifierCalibration(protocol, cases, use) {
    [protocol.id, protocol.version, protocol.evaluatorVersion, protocol.datasetId, protocol.scope].forEach(value => text(value, 'Calibration protocol field'));
    count(protocol.plannedCases, 'Planned calibration cases');
    count(protocol.minimumPerClass, 'Minimum cases per class');
    requireThat(protocol.minimumPerClass * 2 <= protocol.plannedCases, 'Class minima exceed planned sample');
    probability(protocol.alpha, 'Alpha', true);
    probability(protocol.maximumFalseAcceptRate, 'Maximum false accept rate');
    probability(protocol.maximumFalseRejectRate, 'Maximum false reject rate');
    requireThat(['confirmatory', 'exploratory'].includes(protocol.mode), 'Unknown analysis mode');
    const freshIndependentEvidence = validateUse(use);
    requireThat(Array.isArray(cases) && cases.length <= protocol.plannedCases, 'Calibration sample exceeds registered size');
    unique(cases.map(item => item.id), 'Calibration case IDs');
    let acceptable = 0;
    let unacceptable = 0;
    let falseAccepts = 0;
    let falseRejects = 0;
    let unavailable = 0;
    for (const item of cases) {
        requireThat(['acceptable', 'unacceptable'].includes(item.label) && ['accept', 'reject', 'unavailable'].includes(item.verdict), 'Invalid known-label case');
        if (item.verdict === 'unavailable') {
            unavailable++;
            continue;
        }
        if (item.label === 'acceptable') {
            acceptable++;
            if (item.verdict === 'reject')
                falseRejects++;
        }
        else {
            unacceptable++;
            if (item.verdict === 'accept')
                falseAccepts++;
        }
    }
    const missing = protocol.plannedCases - cases.length;
    const complete = missing === 0 && unavailable === 0;
    const sufficient = complete && acceptable >= protocol.minimumPerClass && unacceptable >= protocol.minimumPerClass;
    const falseAcceptUpper = complete ? upperErrorBound(falseAccepts, unacceptable, protocol.alpha / 2) : null;
    const falseRejectUpper = complete ? upperErrorBound(falseRejects, acceptable, protocol.alpha / 2) : null;
    const qualifies = sufficient && falseAcceptUpper !== null && falseRejectUpper !== null
        && falseAcceptUpper <= protocol.maximumFalseAcceptRate && falseRejectUpper <= protocol.maximumFalseRejectRate;
    const status = !sufficient ? 'insufficient-evidence'
        : protocol.mode !== 'confirmatory' || !freshIndependentEvidence ? 'exploratory-only'
            : qualifies ? 'meets-error-bounds' : 'does-not-meet-error-bounds';
    return {
        kind: 'known-label-verifier-calibration', status, protocolDigest: digest(protocol),
        evidenceDigest: digest([...cases].sort((a, b) => a.id.localeCompare(b.id))), evidenceUse: { ...use },
        evaluatorVersion: protocol.evaluatorVersion, scope: protocol.scope, plannedCases: protocol.plannedCases,
        acceptable, unacceptable, falseAccepts, falseRejects, unavailable, missing,
        falseAcceptRate: unacceptable > 0 ? falseAccepts / unacceptable : null,
        falseRejectRate: acceptable > 0 ? falseRejects / acceptable : null,
        falseAcceptUpper, falseRejectUpper, simultaneousConfidence: 1 - protocol.alpha,
        method: 'One-sided Clopper-Pearson binomial upper bounds; alpha/2 allocated to each error class.',
        guarantees: ['With fixed sampling, independent cases within each class and correct reference labels, both population class-conditional error rates lie below their bounds with coverage at least 1-alpha.'],
        doesNotGuarantee: [
            'Observed error rates alone do not qualify a verifier; zero observed errors do not imply a zero population error rate.',
            'Coverage is conditional on the supplied design, versions, scope and reference labels; it does not transfer automatically to a composed gate or a changed evaluator.',
            'Abstentions and missing cases block qualification; no guarantee for selective classification, optional stopping, adaptive relabeling or repeated dataset reuse is supplied.',
            'Protocol/evidence digests detect input changes, not dishonest provenance; numeric bounds use floating-point arithmetic.',
        ],
    };
}
//# sourceMappingURL=calibration.js.map