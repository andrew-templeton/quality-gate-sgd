/**
 * Condition Factory
 * =================
 * Creates baseline and treatment conditions for each experimental design.
 * Maps directly to PREREG.md designs A-F.
 */
import type { ExperimentDesign, ExperimentCondition, ExperimentConfig, HypothesisId } from './types.js';
/**
 * Default experiment configuration.
 * Serves as base for all conditions.
 */
export declare const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig;
/**
 * Metadata for each experimental design.
 */
export interface DesignMetadata {
    /** Design identifier */
    design: ExperimentDesign;
    /** Human-readable name */
    name: string;
    /** Research question addressed */
    researchQuestion: string;
    /** Hypotheses tested */
    hypotheses: HypothesisId[];
    /** Condition names */
    conditions: string[];
    /** Primary metric for analysis */
    primaryMetric: string;
}
/**
 * Design metadata registry.
 */
export declare const DESIGN_METADATA: Record<ExperimentDesign, DesignMetadata>;
/**
 * Create all conditions for a given design.
 */
export declare function createConditions(design: ExperimentDesign, options?: {
    seed?: number;
    maxIterations?: number;
}): ExperimentCondition[];
/**
 * Get the baseline condition for a design.
 */
export declare function getBaselineCondition(design: ExperimentDesign): ExperimentCondition;
/**
 * Get the treatment condition(s) for a design.
 */
export declare function getTreatmentConditions(design: ExperimentDesign): ExperimentCondition[];
/**
 * Validate that a condition is properly configured for its design.
 */
export declare function validateCondition(condition: ExperimentCondition): string[];
/**
 * Check if two conditions are valid for paired comparison.
 * Used for paired t-tests in Designs A, D, F.
 */
export declare function canPairConditions(condition1: ExperimentCondition, condition2: ExperimentCondition): boolean;
/**
 * Get a human-readable description of a condition.
 */
export declare function describeCondition(condition: ExperimentCondition): string;
/**
 * Get a short label for a condition (for tables/charts).
 */
export declare function conditionLabel(condition: ExperimentCondition): string;
//# sourceMappingURL=conditions.d.ts.map