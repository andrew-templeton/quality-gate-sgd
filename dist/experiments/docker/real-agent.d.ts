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
import type { ExperimentAgent } from '../runner.js';
import type { SWEBenchTask } from '../swebench/types.js';
import type { LLMExecutorConfig } from '../llm-executor.js';
import type { EvaluatorConfig } from './evaluator.js';
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
/**
 * Create a real LLM agent that uses Docker evaluation.
 * This agent has NO baked-in bias between gate/no-gate conditions.
 */
export declare function createRealLLMAgent(task: SWEBenchTask, gateEnabled: boolean, config: RealAgentConfig): ExperimentAgent;
/**
 * Convert structured file changes to unified diff format.
 */
export declare function convertToUnifiedDiff(changes: Array<{
    filePath: string;
    changeType: 'modify' | 'create' | 'delete';
    originalContent?: string;
    newContent?: string;
}>): string;
//# sourceMappingURL=real-agent.d.ts.map