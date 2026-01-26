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
 * Quality metrics for patch proposal reasoning.
 * Each dimension is scored 0-100.
 */
export interface PatchQualityMetrics {
    /** Prior understanding: Does the agent understand the current state? */
    priorClarity: number;
    /** Hypothesis formation: Is the causal hypothesis well-formed? */
    hypothesisCoherence: number;
    /** Evidence quality: Does the code analysis match reality? */
    evidenceAlignment: number;
    /** Solution alignment: Does the code match the hypothesis? */
    solutionConsistency: number;
    /** Predicted outcomes: Are effects observable and testable? */
    outcomeObservability: number;
    /** Overall quality score (weighted average) */
    overallQuality: number;
}
/**
 * Detailed reasoning provided by the agent.
 */
export interface PatchProposalReasoning {
    /** Prior: What is currently broken and why? */
    prior: {
        /** Description of the bug/issue */
        bugDescription: string;
        /** Current behavior (observed) */
        currentBehavior: string;
        /** Expected behavior (desired) */
        expectedBehavior: string;
        /** Confidence in understanding (0-1) */
        confidence: number;
    };
    /** Hypothesis: Causal chain from root cause to fix */
    hypothesis: {
        /** Root cause analysis */
        rootCause: string;
        /** Causal chain: cause → effect → fix */
        causalChain: string[];
        /** Why this fix should work */
        rationale: string;
    };
    /** Evidence: Code analysis supporting the hypothesis */
    evidence: {
        /** File and line references */
        codeReferences: Array<{
            file: string;
            lines: string;
            observation: string;
        }>;
        /** Key observations from code */
        observations: string[];
        /** How observations support hypothesis */
        supportingLogic: string;
    };
    /** Solution: The proposed change */
    solution: {
        /** Description of changes */
        changeDescription: string;
        /** How changes address root cause */
        addressesCause: string;
        /** Minimal change principle */
        minimality: string;
    };
    /** Prediction: Expected outcomes */
    prediction: {
        /** Which tests should pass */
        testOutcomes: string[];
        /** Observable effects */
        effects: string[];
        /** How to verify success */
        verificationPlan: string;
    };
}
/**
 * Evaluate the quality of a patch proposal's reasoning.
 */
export declare function evaluatePatchQuality(reasoning: PatchProposalReasoning): PatchQualityMetrics;
/**
 * Configuration for quality gate thresholds.
 */
export interface QualityGateConfig {
    /** Minimum overall quality to pass (0-100) */
    minOverallQuality: number;
    /** Minimum scores for critical dimensions */
    minDimensionScores?: {
        priorClarity?: number;
        hypothesisCoherence?: number;
        evidenceAlignment?: number;
        solutionConsistency?: number;
        outcomeObservability?: number;
    };
}
/**
 * Default quality gate configuration (aligned with target score of 90).
 */
export declare const DEFAULT_QUALITY_GATE: QualityGateConfig;
/**
 * Result of quality gate evaluation.
 */
export interface QualityGateResult {
    /** Whether the patch passes the quality gate */
    passes: boolean;
    /** Quality metrics */
    metrics: PatchQualityMetrics;
    /** Reasons for failure (if any) */
    failures: string[];
    /** Suggestions for improvement */
    suggestions: string[];
}
/**
 * Evaluate whether a patch proposal passes the quality gate.
 */
export declare function evaluateQualityGate(reasoning: PatchProposalReasoning, config?: QualityGateConfig): QualityGateResult;
/**
 * Generate actionable feedback for improving patch quality.
 */
export declare function generateQualityFeedback(result: QualityGateResult): string;
//# sourceMappingURL=quality-gate.d.ts.map