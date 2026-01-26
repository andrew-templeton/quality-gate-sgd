/**
 * Quality Gate for SWE-bench Patch Proposals
 * ===========================================
 * Evaluates the quality of patch reasoning using a Bayesian-style topology.
 *
 * High-quality patches demonstrate:
 * 1. Clear prior understanding (what's broken and why)
 * 2. Well-formed causal hypothesis (root cause → expected fix)
 * 3. Strong evidence alignment (code analysis matches reality)
 * 4. Coherent solution (code aligns with hypothesis)
 * 5. Observable effects (predicted outcomes match actual)
 */
/**
 * Weights for quality dimensions (must sum to 1.0).
 */
const DIMENSION_WEIGHTS = {
    priorClarity: 0.20,
    hypothesisCoherence: 0.25,
    evidenceAlignment: 0.25,
    solutionConsistency: 0.20,
    outcomeObservability: 0.10,
};
// =============================================================================
// Quality Evaluation
// =============================================================================
/**
 * Evaluate the quality of a patch proposal's reasoning.
 */
export function evaluatePatchQuality(reasoning) {
    // 1. Prior Clarity: Is the current state well understood?
    const priorClarity = evaluatePriorClarity(reasoning.prior);
    // 2. Hypothesis Coherence: Is the causal hypothesis well-formed?
    const hypothesisCoherence = evaluateHypothesisCoherence(reasoning.hypothesis);
    // 3. Evidence Alignment: Does evidence support the hypothesis?
    const evidenceAlignment = evaluateEvidenceAlignment(reasoning.evidence, reasoning.hypothesis);
    // 4. Solution Consistency: Does solution align with hypothesis?
    const solutionConsistency = evaluateSolutionConsistency(reasoning.solution, reasoning.hypothesis);
    // 5. Outcome Observability: Are predictions testable?
    const outcomeObservability = evaluateOutcomeObservability(reasoning.prediction);
    // Compute weighted overall quality
    const overallQuality = priorClarity * DIMENSION_WEIGHTS.priorClarity +
        hypothesisCoherence * DIMENSION_WEIGHTS.hypothesisCoherence +
        evidenceAlignment * DIMENSION_WEIGHTS.evidenceAlignment +
        solutionConsistency * DIMENSION_WEIGHTS.solutionConsistency +
        outcomeObservability * DIMENSION_WEIGHTS.outcomeObservability;
    return {
        priorClarity,
        hypothesisCoherence,
        evidenceAlignment,
        solutionConsistency,
        outcomeObservability,
        overallQuality,
    };
}
/**
 * Evaluate prior understanding clarity.
 */
function evaluatePriorClarity(prior) {
    let score = 0;
    // Has bug description
    if (prior.bugDescription && prior.bugDescription.length > 20)
        score += 25;
    // Distinguishes current vs expected behavior
    if (prior.currentBehavior && prior.expectedBehavior)
        score += 25;
    // Clear behavioral difference
    if (prior.currentBehavior &&
        prior.expectedBehavior &&
        prior.currentBehavior !== prior.expectedBehavior) {
        score += 25;
    }
    // Confidence appropriately calibrated
    if (prior.confidence > 0.5 && prior.confidence <= 1.0) {
        score += 25;
    }
    else if (prior.confidence > 0) {
        score += 10;
    }
    return Math.min(100, score);
}
/**
 * Evaluate hypothesis coherence.
 */
function evaluateHypothesisCoherence(hypothesis) {
    let score = 0;
    // Has root cause
    if (hypothesis.rootCause && hypothesis.rootCause.length > 20)
        score += 30;
    // Has causal chain
    if (hypothesis.causalChain && hypothesis.causalChain.length >= 2) {
        score += 30;
        // Bonus for detailed causal chain
        if (hypothesis.causalChain.length >= 3)
            score += 10;
    }
    // Has rationale
    if (hypothesis.rationale && hypothesis.rationale.length > 30)
        score += 30;
    return Math.min(100, score);
}
/**
 * Evaluate evidence alignment.
 */
function evaluateEvidenceAlignment(evidence, hypothesis) {
    let score = 0;
    // Has code references
    if (evidence.codeReferences && evidence.codeReferences.length > 0) {
        score += 30;
        // Bonus for multiple references
        if (evidence.codeReferences.length >= 2)
            score += 10;
    }
    // Has observations
    if (evidence.observations && evidence.observations.length > 0) {
        score += 30;
    }
    // Has supporting logic
    if (evidence.supportingLogic && evidence.supportingLogic.length > 30) {
        score += 30;
    }
    return Math.min(100, score);
}
/**
 * Evaluate solution consistency.
 */
function evaluateSolutionConsistency(solution, hypothesis) {
    let score = 0;
    // Has change description
    if (solution.changeDescription && solution.changeDescription.length > 20)
        score += 30;
    // Addresses cause
    if (solution.addressesCause && solution.addressesCause.length > 20) {
        score += 40;
        // Check if it references the root cause
        if (hypothesis.rootCause &&
            solution.addressesCause.toLowerCase().includes(hypothesis.rootCause.toLowerCase().slice(0, 20))) {
            score += 10;
        }
    }
    // Discusses minimality
    if (solution.minimality && solution.minimality.length > 10)
        score += 20;
    return Math.min(100, score);
}
/**
 * Evaluate outcome observability.
 */
function evaluateOutcomeObservability(prediction) {
    let score = 0;
    // Has test outcomes
    if (prediction.testOutcomes && prediction.testOutcomes.length > 0) {
        score += 40;
    }
    // Has effects
    if (prediction.effects && prediction.effects.length > 0) {
        score += 30;
    }
    // Has verification plan
    if (prediction.verificationPlan && prediction.verificationPlan.length > 20) {
        score += 30;
    }
    return Math.min(100, score);
}
/**
 * Default quality gate configuration (aligned with target score of 90).
 */
export const DEFAULT_QUALITY_GATE = {
    minOverallQuality: 70,
    minDimensionScores: {
        priorClarity: 60,
        hypothesisCoherence: 60,
        evidenceAlignment: 60,
        solutionConsistency: 60,
    },
};
/**
 * Evaluate whether a patch proposal passes the quality gate.
 */
export function evaluateQualityGate(reasoning, config = DEFAULT_QUALITY_GATE) {
    const metrics = evaluatePatchQuality(reasoning);
    const failures = [];
    const suggestions = [];
    // Check overall quality
    if (metrics.overallQuality < config.minOverallQuality) {
        failures.push(`Overall quality ${metrics.overallQuality.toFixed(1)} < ${config.minOverallQuality}`);
        suggestions.push('Improve reasoning across all dimensions');
    }
    // Check individual dimensions
    const minScores = config.minDimensionScores || {};
    if (minScores.priorClarity && metrics.priorClarity < minScores.priorClarity) {
        failures.push(`Prior clarity ${metrics.priorClarity.toFixed(1)} < ${minScores.priorClarity}`);
        suggestions.push('Clarify understanding of current vs expected behavior');
    }
    if (minScores.hypothesisCoherence &&
        metrics.hypothesisCoherence < minScores.hypothesisCoherence) {
        failures.push(`Hypothesis coherence ${metrics.hypothesisCoherence.toFixed(1)} < ${minScores.hypothesisCoherence}`);
        suggestions.push('Strengthen causal chain from root cause to fix');
    }
    if (minScores.evidenceAlignment && metrics.evidenceAlignment < minScores.evidenceAlignment) {
        failures.push(`Evidence alignment ${metrics.evidenceAlignment.toFixed(1)} < ${minScores.evidenceAlignment}`);
        suggestions.push('Provide more code references and observations');
    }
    if (minScores.solutionConsistency &&
        metrics.solutionConsistency < minScores.solutionConsistency) {
        failures.push(`Solution consistency ${metrics.solutionConsistency.toFixed(1)} < ${minScores.solutionConsistency}`);
        suggestions.push('Ensure solution directly addresses root cause');
    }
    if (minScores.outcomeObservability &&
        metrics.outcomeObservability < minScores.outcomeObservability) {
        failures.push(`Outcome observability ${metrics.outcomeObservability.toFixed(1)} < ${minScores.outcomeObservability}`);
        suggestions.push('Specify testable predictions and verification plan');
    }
    return {
        passes: failures.length === 0,
        metrics,
        failures,
        suggestions,
    };
}
// =============================================================================
// Feedback Generation
// =============================================================================
/**
 * Generate actionable feedback for improving patch quality.
 */
export function generateQualityFeedback(result) {
    if (result.passes) {
        return `Quality gate PASSED (${result.metrics.overallQuality.toFixed(1)}/100)`;
    }
    const lines = [];
    lines.push(`Quality gate FAILED (${result.metrics.overallQuality.toFixed(1)}/100)`);
    lines.push('');
    lines.push('Dimension Scores:');
    lines.push(`  Prior Clarity: ${result.metrics.priorClarity.toFixed(1)}/100`);
    lines.push(`  Hypothesis Coherence: ${result.metrics.hypothesisCoherence.toFixed(1)}/100`);
    lines.push(`  Evidence Alignment: ${result.metrics.evidenceAlignment.toFixed(1)}/100`);
    lines.push(`  Solution Consistency: ${result.metrics.solutionConsistency.toFixed(1)}/100`);
    lines.push(`  Outcome Observability: ${result.metrics.outcomeObservability.toFixed(1)}/100`);
    lines.push('');
    lines.push('Failures:');
    for (const failure of result.failures) {
        lines.push(`  - ${failure}`);
    }
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of result.suggestions) {
        lines.push(`  - ${suggestion}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=quality-gate.js.map