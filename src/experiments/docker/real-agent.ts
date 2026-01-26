/**
 * Real LLM Agent with Docker Evaluation
 * ======================================
 * An experiment agent that:
 * 1. Uses the LLM executor to generate patches
 * 2. Evaluates patches using Docker-based SWE-bench harness
 * 3. Returns real pass/fail based on test execution
 *
 * This is the "fair" version that doesn't bake in any bias.
 */

import type { ExperimentAgent, ExperimentTask, IterationEvaluationResult } from '../runner.js';
import type { ExperimentConfig, TargetSuggestion, IterationOutcome } from '../types.js';
import type { SWEBenchTask } from '../swebench/types.js';
import type { LLMExecutorConfig } from '../llm-executor.js';
import type { EvaluatorConfig, EvaluationResult } from './evaluator.js';
import { createLLMExecutor } from '../llm-executor.js';
import { evaluatePatch } from './evaluator.js';

// =============================================================================
// Types
// =============================================================================

export interface RealAgentConfig {
  /** LLM configuration */
  llm: LLMExecutorConfig;
  /** Docker evaluator configuration */
  docker?: EvaluatorConfig;
  /** Target quality score (percentage of tests passing) */
  targetScore?: number;
  /** Whether to enable verbose logging */
  verbose?: boolean;
}

// =============================================================================
// Agent Implementation
// =============================================================================

/**
 * Create a real LLM agent that uses Docker evaluation.
 * This agent has NO baked-in bias between gate/no-gate conditions.
 */
export function createRealLLMAgent(
  task: SWEBenchTask,
  gateEnabled: boolean,
  config: RealAgentConfig
): ExperimentAgent {
  const targetScore = config.targetScore ?? 100; // Default: all tests must pass
  const verbose = config.verbose ?? false;

  // Create LLM executor
  const executor = createLLMExecutor(config.llm);

  // Track state
  let currentScore = 0;
  let lastEvaluation: EvaluationResult | null = null;
  let iterationCount = 0;
  let cumulativePatch = '';

  // Log helper
  const log = (msg: string) => {
    if (verbose) {
      console.error(`[RealAgent] ${msg}`);
    }
  };

  return {
    async initialize(experimentTask: ExperimentTask, experimentConfig: ExperimentConfig) {
      currentScore = 0;
      lastEvaluation = null;
      iterationCount = 0;
      cumulativePatch = '';

      log(`Initialized for task ${experimentTask.id}`);
      log(`  Gate enabled: ${gateEnabled}`);
      log(`  Target score: ${targetScore}`);
    },

    async getSuggestion(experimentConfig: ExperimentConfig): Promise<TargetSuggestion | null> {
      if (!gateEnabled) {
        return null;
      }

      // Generate a suggestion based on the SWE-bench task problem statement
      // In a real implementation, this would analyze the current state and
      // provide specific guidance on what to fix
      return {
        type: 'symbol',
        id: task.problemStatement.slice(0, 200),
        expectedDeltaQ: 10,
      };
    },

    async executeIteration(
      iteration: number,
      suggestion: TargetSuggestion | null,
      experimentConfig: ExperimentConfig
    ): Promise<IterationOutcome> {
      iterationCount = iteration;
      log(`Iteration ${iteration}`);

      // Build context for the LLM
      // Use minimal metrics compatible with FixContext
      const context = {
        iteration,
        currentScore,
        targetScore,
        metrics: {
          scripts: {} as Record<string, 'pass' | 'fail'>,
          custom: {
            testsFixed: lastEvaluation?.testsFixed ?? 0,
            totalTests: lastEvaluation?.totalTestsToFix ?? 0,
          },
        },
        feedbackEnabled: gateEnabled,
        config: experimentConfig,
        availableTargets: suggestion ? [suggestion] : undefined,
      };

      // Get patch from LLM
      let llmResult;
      try {
        llmResult = await executor.attemptFix(task, suggestion, context);
        log(`  LLM response: attempted=${llmResult.attempted}, modified=${llmResult.modified}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`  LLM error: ${errorMsg}`);
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: errorMsg,
        };
      }

      if (!llmResult.attempted || !llmResult.modified) {
        log(`  LLM did not produce a patch`);
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: llmResult.error ?? 'LLM did not produce a patch',
        };
      }

      // Extract the patch from the LLM result
      // The LLM executor now returns both changes and a pre-computed unified diff patch
      const patchContent = llmResult.patch;

      if (!patchContent) {
        log(`  Could not extract patch from LLM result`);
        return {
          success: false,
          actualDeltaQ: 0,
          targetMatched: false,
          error: 'Could not extract patch from LLM result',
        };
      }

      log(`  Generated patch (${patchContent.split('\\n').length} lines)`);

      // Evaluate the patch using Docker
      log(`  Evaluating patch in Docker...`);
      const evalResult = await evaluatePatch(
        {
          instanceId: task.instanceId,
          patch: patchContent,
          failToPass: task.testSpec.failToPass,
          passToPass: task.testSpec.passToPass,
        },
        config.docker
      );

      lastEvaluation = evalResult;
      log(`  Evaluation: resolved=${evalResult.resolved}, testsFixed=${evalResult.testsFixed}/${evalResult.totalTestsToFix}`);

      // Calculate new score (percentage of FAIL_TO_PASS tests now passing)
      const previousScore = currentScore;
      if (evalResult.totalTestsToFix > 0) {
        currentScore = (evalResult.testsFixed / evalResult.totalTestsToFix) * 100;
      } else {
        currentScore = evalResult.resolved ? 100 : 0;
      }

      const deltaQ = currentScore - previousScore;

      return {
        success: deltaQ > 0,
        actualDeltaQ: deltaQ,
        targetMatched: suggestion !== null,
      };
    },

    async evaluate(experimentConfig: ExperimentConfig): Promise<IterationEvaluationResult> {
      return {
        metrics: {
          quality: currentScore,
          testsFixed: lastEvaluation?.testsFixed ?? 0,
          totalTests: lastEvaluation?.totalTestsToFix ?? 0,
          testsStillPassing: lastEvaluation?.testsStillPassing ?? 0,
          iteration: iterationCount,
        },
        qualityScore: currentScore,
        passed: currentScore >= targetScore,
      };
    },

    async cleanup() {
      log(`Cleanup complete`);
    },
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert structured file changes to unified diff format.
 */
export function convertToUnifiedDiff(changes: Array<{
  filePath: string;
  changeType: 'modify' | 'create' | 'delete';
  originalContent?: string;
  newContent?: string;
}>): string {
  const diffs: string[] = [];

  for (const change of changes) {
    if (change.changeType === 'create') {
      diffs.push(`diff --git a/${change.filePath} b/${change.filePath}`);
      diffs.push(`new file mode 100644`);
      diffs.push(`--- /dev/null`);
      diffs.push(`+++ b/${change.filePath}`);
      if (change.newContent) {
        const lines = change.newContent.split('\n');
        diffs.push(`@@ -0,0 +1,${lines.length} @@`);
        for (const line of lines) {
          diffs.push(`+${line}`);
        }
      }
    } else if (change.changeType === 'delete') {
      diffs.push(`diff --git a/${change.filePath} b/${change.filePath}`);
      diffs.push(`deleted file mode 100644`);
      diffs.push(`--- a/${change.filePath}`);
      diffs.push(`+++ /dev/null`);
      if (change.originalContent) {
        const lines = change.originalContent.split('\n');
        diffs.push(`@@ -1,${lines.length} +0,0 @@`);
        for (const line of lines) {
          diffs.push(`-${line}`);
        }
      }
    } else if (change.changeType === 'modify' && change.originalContent && change.newContent) {
      // For modifications, we'd need a proper diff algorithm
      // This is simplified - a real implementation would use a diff library
      diffs.push(`diff --git a/${change.filePath} b/${change.filePath}`);
      diffs.push(`--- a/${change.filePath}`);
      diffs.push(`+++ b/${change.filePath}`);
      // Placeholder - would need actual diff computation
      diffs.push(`@@ -1,1 +1,1 @@`);
      diffs.push(`-${change.originalContent.split('\n')[0] ?? ''}`);
      diffs.push(`+${change.newContent.split('\n')[0] ?? ''}`);
    }
  }

  return diffs.join('\n');
}
