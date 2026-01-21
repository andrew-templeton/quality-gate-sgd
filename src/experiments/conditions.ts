/**
 * Condition Factory
 * =================
 * Creates baseline and treatment conditions for each experimental design.
 * Maps directly to PREREG.md designs A-F.
 */

import type {
  ExperimentDesign,
  ExperimentCondition,
  ExperimentConfig,
  HypothesisId,
} from './types.js';

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default experiment configuration.
 * Serves as base for all conditions.
 */
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  maxIterations: 50,
  gateEnabled: true,
  topology: 'full',
  callGraphWeighting: false,
  fixabilityEnabled: false,
  prioritization: 'raw',
  granularity: 'symbol',
  seed: undefined,
};

// =============================================================================
// Design Metadata
// =============================================================================

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
export const DESIGN_METADATA: Record<ExperimentDesign, DesignMetadata> = {
  A: {
    design: 'A',
    name: 'Gate vs No-Gate Convergence',
    researchQuestion: 'RQ1/RQ2: Do quality gates improve agent convergence?',
    hypotheses: ['H1', 'H2'],
    conditions: ['no-gate', 'gate'],
    primaryMetric: 'iterationsToPass',
  },
  B: {
    design: 'B',
    name: 'Topology Sensitivity',
    researchQuestion: 'RQ4: Does metric topology affect convergence?',
    hypotheses: ['H3'],
    conditions: ['coverage-only', 'coverage-ceilings', 'full'],
    primaryMetric: 'monotonicRate',
  },
  C: {
    design: 'C',
    name: 'Addressing Fitness vs Convergence',
    researchQuestion: 'RQ7: Does addressing fitness predict convergence?',
    hypotheses: ['H4', 'H5', 'H6'],
    conditions: ['default'],
    primaryMetric: 'iterationsToPass',
  },
  D: {
    design: 'D',
    name: 'Call Graph Weighting Impact',
    researchQuestion: 'RQ8: Does call graph weighting improve prioritization?',
    hypotheses: ['H7', 'H8'],
    conditions: ['unweighted', 'weighted'],
    primaryMetric: 'iterationsToPass',
  },
  E: {
    design: 'E',
    name: 'Fixability Estimation Validity',
    researchQuestion: 'RQ9: Do fixability scores predict fix success?',
    hypotheses: ['H9', 'H10'],
    conditions: ['default'],
    primaryMetric: 'fixabilityCorrelation',
  },
  F: {
    design: 'F',
    name: 'Adjusted Prioritization',
    researchQuestion: 'RQ10: Does adjusted ΔQ outperform raw ΔQ?',
    hypotheses: ['H11', 'H12'],
    conditions: ['raw', 'adjusted'],
    primaryMetric: 'iterationsToPass',
  },
};

// =============================================================================
// Condition Factories
// =============================================================================

/**
 * Create all conditions for a given design.
 */
export function createConditions(
  design: ExperimentDesign,
  options: { seed?: number; maxIterations?: number } = {}
): ExperimentCondition[] {
  const baseConfig: Partial<ExperimentConfig> = {
    seed: options.seed,
    maxIterations: options.maxIterations ?? DEFAULT_EXPERIMENT_CONFIG.maxIterations,
  };

  switch (design) {
    case 'A':
      return createDesignAConditions(baseConfig);
    case 'B':
      return createDesignBConditions(baseConfig);
    case 'C':
      return createDesignCConditions(baseConfig);
    case 'D':
      return createDesignDConditions(baseConfig);
    case 'E':
      return createDesignEConditions(baseConfig);
    case 'F':
      return createDesignFConditions(baseConfig);
  }
}

/**
 * Get the baseline condition for a design.
 */
export function getBaselineCondition(design: ExperimentDesign): ExperimentCondition {
  const conditions = createConditions(design);
  return conditions[0];
}

/**
 * Get the treatment condition(s) for a design.
 */
export function getTreatmentConditions(design: ExperimentDesign): ExperimentCondition[] {
  const conditions = createConditions(design);
  return conditions.slice(1);
}

// =============================================================================
// Design A: Gate vs No-Gate
// =============================================================================

/**
 * Design A conditions: Compare agent performance with and without quality gate feedback.
 *
 * - Baseline: No gate feedback (agent flies blind)
 * - Treatment: Gate feedback enabled (agent gets pass/fail + suggestions)
 */
function createDesignAConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'no-gate',
      design: 'A',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: false,
        // No suggestions provided
        granularity: 'dimension', // Coarse-grained (no symbol-level feedback)
      },
    },
    {
      name: 'gate',
      design: 'A',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol', // Fine-grained feedback
      },
    },
  ];
}

// =============================================================================
// Design B: Topology Sensitivity
// =============================================================================

/**
 * Design B conditions: Compare different metric topology configurations.
 *
 * - Coverage-only: Only coverage metrics (smoothest)
 * - Coverage + ceilings: Coverage + SonarQube severity ceilings
 * - Full: Coverage + ceilings + monotonic rules
 */
function createDesignBConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'coverage-only',
      design: 'B',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        topology: 'coverage-only',
      },
    },
    {
      name: 'coverage-ceilings',
      design: 'B',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        topology: 'coverage-ceilings',
      },
    },
    {
      name: 'full',
      design: 'B',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        topology: 'full',
      },
    },
  ];
}

// =============================================================================
// Design C: Addressing Fitness
// =============================================================================

/**
 * Design C conditions: Measure correlation between addressing fitness and convergence.
 *
 * Single condition - fitness varies naturally across tasks/repos.
 * Analysis is correlational, not experimental manipulation.
 */
function createDesignCConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'default',
      design: 'C',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        // Fitness metrics logged in run metadata:
        // - mappingCoverage
        // - callGraphResolution
        // - p90AddressSloc
      },
    },
  ];
}

// =============================================================================
// Design D: Call Graph Weighting
// =============================================================================

/**
 * Design D conditions: Compare prioritization with and without call graph weighting.
 *
 * - Unweighted: Raw ΔQ prioritization
 * - Weighted: ΔQ × (1 + log₂(in-degree + 1))
 */
function createDesignDConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'unweighted',
      design: 'D',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        callGraphWeighting: false,
        prioritization: 'raw',
      },
    },
    {
      name: 'weighted',
      design: 'D',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        callGraphWeighting: true,
        prioritization: 'weighted',
      },
    },
  ];
}

// =============================================================================
// Design E: Fixability Estimation
// =============================================================================

/**
 * Design E conditions: Validate fixability estimation accuracy.
 *
 * Single condition - collects fixability predictions and actual outcomes.
 * Analysis is correlational (φ vs fix success).
 */
function createDesignEConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'default',
      design: 'E',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        fixabilityEnabled: true,
        // Log: fixabilityScore, actual fix outcome (success/fail)
      },
    },
  ];
}

// =============================================================================
// Design F: Adjusted Prioritization
// =============================================================================

/**
 * Design F conditions: Compare raw vs adjusted ΔQ prioritization.
 *
 * - Raw: Prioritize by ΔQ only
 * - Adjusted: Prioritize by ΔQ_adj = ΔQ_weighted × φ(t)
 */
function createDesignFConditions(base: Partial<ExperimentConfig>): ExperimentCondition[] {
  return [
    {
      name: 'raw',
      design: 'F',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        callGraphWeighting: false,
        fixabilityEnabled: false,
        prioritization: 'raw',
      },
    },
    {
      name: 'adjusted',
      design: 'F',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        ...base,
        gateEnabled: true,
        granularity: 'symbol',
        callGraphWeighting: true,
        fixabilityEnabled: true,
        prioritization: 'adjusted',
      },
    },
  ];
}

// =============================================================================
// Condition Validation
// =============================================================================

/**
 * Validate that a condition is properly configured for its design.
 */
export function validateCondition(condition: ExperimentCondition): string[] {
  const errors: string[] = [];
  const { design, config } = condition;

  // Check design-specific requirements
  switch (design) {
    case 'A':
      // No specific requirements beyond gateEnabled being defined
      break;

    case 'B':
      if (!config.topology) {
        errors.push('Design B requires topology to be specified');
      }
      break;

    case 'C':
      if (config.granularity !== 'symbol') {
        errors.push('Design C requires symbol-level granularity for fitness metrics');
      }
      break;

    case 'D':
      if (config.granularity !== 'symbol') {
        errors.push('Design D requires symbol-level granularity for call graph weighting');
      }
      break;

    case 'E':
      if (!config.fixabilityEnabled) {
        errors.push('Design E requires fixabilityEnabled to be true');
      }
      break;

    case 'F':
      if (condition.name === 'adjusted' && !config.fixabilityEnabled) {
        errors.push('Design F adjusted condition requires fixabilityEnabled');
      }
      break;
  }

  // General validations
  if (config.maxIterations <= 0) {
    errors.push('maxIterations must be positive');
  }

  return errors;
}

/**
 * Check if two conditions are valid for paired comparison.
 * Used for paired t-tests in Designs A, D, F.
 */
export function canPairConditions(
  condition1: ExperimentCondition,
  condition2: ExperimentCondition
): boolean {
  // Must be from same design
  if (condition1.design !== condition2.design) {
    return false;
  }

  // Must have same maxIterations
  if (condition1.config.maxIterations !== condition2.config.maxIterations) {
    return false;
  }

  // Must have same seed (if specified)
  if (condition1.config.seed !== condition2.config.seed) {
    return false;
  }

  return true;
}

// =============================================================================
// Condition Descriptions
// =============================================================================

/**
 * Get a human-readable description of a condition.
 */
export function describeCondition(condition: ExperimentCondition): string {
  const { name, design, config } = condition;
  const metadata = DESIGN_METADATA[design];

  const parts = [
    `Design ${design}: ${metadata.name}`,
    `Condition: ${name}`,
    `Gate: ${config.gateEnabled ? 'enabled' : 'disabled'}`,
  ];

  if (config.topology) {
    parts.push(`Topology: ${config.topology}`);
  }

  if (config.callGraphWeighting) {
    parts.push('Call graph weighting: enabled');
  }

  if (config.fixabilityEnabled) {
    parts.push('Fixability estimation: enabled');
  }

  parts.push(`Granularity: ${config.granularity}`);
  parts.push(`Max iterations: ${config.maxIterations}`);

  if (config.seed !== undefined) {
    parts.push(`Seed: ${config.seed}`);
  }

  return parts.join('\n');
}

/**
 * Get a short label for a condition (for tables/charts).
 */
export function conditionLabel(condition: ExperimentCondition): string {
  return `${condition.design}-${condition.name}`;
}
