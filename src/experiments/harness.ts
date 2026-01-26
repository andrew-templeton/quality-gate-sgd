/**
 * Agent Harness
 * =============
 * LLM agent wrapper that integrates with the quality gate system.
 * Can toggle gate feedback on/off for experimental manipulation.
 *
 * The harness provides:
 * - Metrics extraction and fitness computation
 * - Target suggestions based on configuration
 * - Iteration execution with pre/post evaluation
 */

import type {
  ExperimentConfig,
  TargetSuggestion,
  IterationOutcome,
} from './types.js';
import type { ExperimentTask, ExperimentAgent, IterationEvaluationResult } from './runner.js';
import type { Metrics } from '../types.js';
import type { SymbolIssues } from '../symbols/types.js';
import type { SymbolTable } from '../symbols/types.js';
import { computeFitness, computeGradient } from '../fitness.js';
import { extractLocatedIssues } from '../targets/extract.js';
import { aggregateToSymbolsWithOptions } from '../targets/aggregate.js';
import { extractSymbols } from '../symbols/extractor.js';
import type { ExtractedIssues } from '../targets/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Metrics provider interface for fetching current metrics.
 * Implement this to integrate with your project's metric extraction.
 */
export interface MetricsProvider {
  /**
   * Extract all metrics for the current project state.
   */
  extractMetrics(): Promise<Metrics>;

  /**
   * Get the project root path.
   */
  getProjectRoot(): string;

  /**
   * Get source files for symbol extraction.
   */
  getSourceFiles?(): Promise<string[]>;
}

/**
 * LLM interface for executing fix attempts.
 * This is what the harness delegates actual code changes to.
 */
export interface LLMExecutor {
  /**
   * Attempt to fix a target.
   * Returns whether the fix was attempted (not necessarily successful).
   */
  attemptFix(
    task: ExperimentTask,
    suggestion: TargetSuggestion | null,
    context: FixContext
  ): Promise<FixAttemptResult>;
}

/**
 * Context provided to the LLM for a fix attempt.
 */
export interface FixContext {
  /** Current iteration number */
  iteration: number;
  /** Current quality score */
  currentScore: number;
  /** Target score to pass */
  targetScore: number;
  /** All available targets (if suggestions enabled) */
  availableTargets?: TargetSuggestion[];
  /** Metrics at this iteration */
  metrics: Metrics;
  /** Whether gate feedback is enabled */
  feedbackEnabled: boolean;
  /** Experiment config */
  config: ExperimentConfig;
}

/**
 * A single file change from a fix attempt.
 */
export interface FileChange {
  /** Relative file path */
  filePath: string;
  /** Type of change */
  changeType: 'modify' | 'create' | 'delete';
  /** Original content (for modify/delete) */
  originalContent?: string;
  /** New content (for modify/create) */
  newContent?: string;
}

/**
 * Result of a fix attempt.
 */
export interface FixAttemptResult {
  /** Whether the attempt was made */
  attempted: boolean;
  /** If the target was modified */
  modified: boolean;
  /** Any error message */
  error?: string;
  /** File changes made (for patch generation) */
  changes?: FileChange[];
  /** Pre-computed unified diff patch */
  patch?: string;
}

/**
 * Options for creating an agent harness.
 */
export interface HarnessOptions {
  /** Provider for metrics extraction */
  metricsProvider: MetricsProvider;
  /** Executor for fix attempts */
  executor: LLMExecutor;
  /** Target quality score for passing */
  targetScore?: number;
  /** Number of top targets to include in suggestions */
  topTargets?: number;
  /** Pre-built symbol table (optional, will build if not provided) */
  symbolTable?: SymbolTable;
}

// =============================================================================
// Agent Harness Implementation
// =============================================================================

/**
 * Create an agent harness that wraps metrics/suggestion infrastructure.
 */
export function createAgentHarness(options: HarnessOptions): ExperimentAgent {
  const {
    metricsProvider,
    executor,
    targetScore = 90,
    topTargets = 10,
  } = options;

  // State
  let currentTask: ExperimentTask | null = null;
  let currentConfig: ExperimentConfig | null = null;
  let currentMetrics: Metrics | null = null;
  let currentScore = 0;
  let previousScore = 0;
  let symbolTable: SymbolTable | null = options.symbolTable ?? null;
  let availableTargets: TargetSuggestion[] = [];

  /**
   * Build or refresh the symbol table.
   */
  async function refreshSymbolTable(): Promise<void> {
    if (symbolTable) return; // Use provided table

    const sourceFiles = metricsProvider.getSourceFiles
      ? await metricsProvider.getSourceFiles()
      : [];

    if (sourceFiles.length > 0) {
      symbolTable = extractSymbols({
        include: sourceFiles.map(f => f.replace(/\\/g, '/')),
      });
    }
  }

  /**
   * Extract and rank targets based on configuration.
   */
  async function computeTargets(config: ExperimentConfig): Promise<TargetSuggestion[]> {
    if (!currentMetrics) return [];

    // No suggestions if gate disabled
    if (!config.gateEnabled) return [];

    // Dimension-level suggestions (fastest)
    if (config.granularity === 'dimension') {
      const gradient = computeGradient(currentMetrics);
      return gradient.slice(0, topTargets).map((g, i) => ({
        type: 'dimension' as const,
        id: g.dimension,
        expectedDeltaQ: g.estimatedImprovement,
      }));
    }

    // Symbol or file level - need to extract issues
    try {
      const extracted = await extractLocatedIssues({
        coverageDir: metricsProvider.getProjectRoot(),
      });

      // Combine all issues into a single array
      const allIssues = [
        ...extracted.coverage,
        ...extracted.typescript,
        ...extracted.eslint,
        ...extracted.sonarqube,
      ];

      // Symbol level
      if (config.granularity === 'symbol' && symbolTable) {
        const symbols = aggregateToSymbolsWithOptions(
          extracted,
          symbolTable,
          {
            includeGraphWeights: config.callGraphWeighting,
            includeCallGraphWeights: config.callGraphWeighting,
          }
        );

        return symbols.slice(0, topTargets).map(symbolToSuggestion);
      }

      // File level fallback
      // Group issues by file and compute ΔQ
      const byFile = new Map<string, { issues: typeof allIssues; deltaQ: number }>();
      for (const issue of allIssues) {
        if (!issue.file) continue;
        const existing = byFile.get(issue.file);
        if (existing) {
          existing.issues.push(issue);
          existing.deltaQ += issue.impact.delta * 0.1; // Rough estimate
        } else {
          byFile.set(issue.file, {
            issues: [issue],
            deltaQ: issue.impact.delta * 0.1,
          });
        }
      }

      const fileTargets = Array.from(byFile.entries())
        .map(([file, data]) => ({
          type: 'file' as const,
          id: file,
          expectedDeltaQ: data.deltaQ,
        }))
        .sort((a, b) => b.expectedDeltaQ - a.expectedDeltaQ);

      return fileTargets.slice(0, topTargets);
    } catch {
      // Fall back to dimension level
      const gradient = computeGradient(currentMetrics);
      return gradient.slice(0, topTargets).map((g) => ({
        type: 'dimension' as const,
        id: g.dimension,
        expectedDeltaQ: g.estimatedImprovement,
      }));
    }
  }

  /**
   * Convert SymbolIssues to TargetSuggestion.
   */
  function symbolToSuggestion(symbol: SymbolIssues): TargetSuggestion {
    return {
      type: 'symbol',
      id: symbol.symbol.qualifiedName,
      expectedDeltaQ: symbol.totalDeltaQ,
      weightedDeltaQ: symbol.weightedDeltaQ,
      adjustedDeltaQ: symbol.adjustedDeltaQ,
      fixabilityScore: symbol.fixabilityScore,
    };
  }

  /**
   * Check if gate passes with current score.
   */
  function checkPassed(): boolean {
    return currentScore >= targetScore;
  }

  // Agent implementation
  return {
    async initialize(task: ExperimentTask, config: ExperimentConfig): Promise<void> {
      currentTask = task;
      currentConfig = config;
      currentMetrics = await metricsProvider.extractMetrics();
      currentScore = computeFitness(currentMetrics);
      previousScore = currentScore;

      // Build symbol table if needed
      if (config.granularity === 'symbol') {
        await refreshSymbolTable();
      }

      // Compute initial targets
      availableTargets = await computeTargets(config);
    },

    async getSuggestion(config: ExperimentConfig): Promise<TargetSuggestion | null> {
      // No suggestions if gate disabled
      if (!config.gateEnabled) return null;

      // Return top target
      if (availableTargets.length > 0) {
        return availableTargets[0];
      }

      return null;
    },

    async executeIteration(
      iteration: number,
      suggestion: TargetSuggestion | null,
      config: ExperimentConfig
    ): Promise<IterationOutcome> {
      if (!currentTask || !currentMetrics) {
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: 'Agent not initialized',
        };
      }

      previousScore = currentScore;

      // Build context for executor
      const context: FixContext = {
        iteration,
        currentScore,
        targetScore,
        availableTargets: config.gateEnabled ? availableTargets : undefined,
        metrics: currentMetrics,
        feedbackEnabled: config.gateEnabled,
        config,
      };

      // Execute fix attempt
      let result: FixAttemptResult;
      try {
        result = await executor.attemptFix(currentTask, suggestion, context);
      } catch (error) {
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (!result.attempted || !result.modified) {
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: result.error,
        };
      }

      // Re-extract metrics after fix
      currentMetrics = await metricsProvider.extractMetrics();
      currentScore = computeFitness(currentMetrics);
      const actualDeltaQ = currentScore - previousScore;

      // Refresh targets for next iteration
      availableTargets = await computeTargets(config);

      return {
        success: actualDeltaQ > 0,
        actualDeltaQ,
        targetMatched: suggestion !== null,
      };
    },

    async evaluate(config: ExperimentConfig): Promise<IterationEvaluationResult> {
      if (!currentMetrics) {
        return {
          metrics: {},
          qualityScore: 0,
          passed: false,
        };
      }

      // Flatten metrics for recording
      const flatMetrics = flattenMetrics(currentMetrics);

      return {
        metrics: flatMetrics,
        qualityScore: currentScore,
        passed: checkPassed(),
      };
    },

    async cleanup(): Promise<void> {
      currentTask = null;
      currentConfig = null;
      currentMetrics = null;
      currentScore = 0;
      previousScore = 0;
      symbolTable = options.symbolTable ?? null;
      availableTargets = [];
    },
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Flatten nested metrics to a Record<string, number>.
 */
function flattenMetrics(metrics: Metrics, prefix = ''): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [key, value] of Object.entries(metrics)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'number') {
      result[path] = value;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenMetrics(value as Metrics, path));
    }
  }

  return result;
}

/**
 * Create a simple mock metrics provider for testing.
 */
export function createMockMetricsProvider(options: {
  initialMetrics?: Partial<Metrics>;
  projectRoot?: string;
} = {}): MetricsProvider {
  const metrics: Metrics = {
    coverage: {
      unit: {
        lines: options.initialMetrics?.coverage?.unit?.lines ?? 50,
        branches: options.initialMetrics?.coverage?.unit?.branches ?? 50,
        functions: options.initialMetrics?.coverage?.unit?.functions ?? 50,
        statements: options.initialMetrics?.coverage?.unit?.statements ?? 50,
      },
    },
    typescript: {
      errors: options.initialMetrics?.typescript?.errors ?? 0,
      warnings: options.initialMetrics?.typescript?.warnings ?? 0,
    },
    eslint: {
      errors: options.initialMetrics?.eslint?.errors ?? 0,
      warnings: options.initialMetrics?.eslint?.warnings ?? 0,
    },
    scripts: {},
    ...options.initialMetrics,
  };

  return {
    async extractMetrics() {
      return metrics;
    },
    getProjectRoot() {
      return options.projectRoot ?? process.cwd();
    },
    async getSourceFiles() {
      return [];
    },
  };
}

/**
 * Create a mock LLM executor for testing.
 */
export function createMockExecutor(options: {
  improvementProbability?: number;
  seed?: number;
} = {}): LLMExecutor {
  const { improvementProbability = 0.6, seed } = options;
  let rng = seed !== undefined ? seededRandom(seed) : Math.random;

  return {
    async attemptFix(
      task: ExperimentTask,
      suggestion: TargetSuggestion | null,
      context: FixContext
    ): Promise<FixAttemptResult> {
      // Simulate fix attempt
      const succeeded = rng() < improvementProbability;

      return {
        attempted: true,
        modified: succeeded,
      };
    },
  };
}

/**
 * Simple seeded random number generator.
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
