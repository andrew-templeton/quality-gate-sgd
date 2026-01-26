/**
 * Quality-Gated LLM Agent with Docker Evaluation
 * ===============================================
 * An experiment agent that uses quality-gated reasoning:
 * 1. Extracts structured reasoning from LLM
 * 2. Evaluates reasoning quality using Bayesian dimensions
 * 3. Only generates patches if reasoning passes quality gate
 * 4. Provides feedback for iterative refinement
 * 5. Evaluates final patches using Docker-based SWE-bench harness
 */
import type { ExperimentAgent } from '../runner.js';
import type { SWEBenchTask } from '../swebench/types.js';
import type { LLMExecutorConfig } from '../llm-executor.js';
import type { EvaluatorConfig } from './evaluator.js';
import type { QualityGateConfig } from '../swebench/quality-gate.js';
export interface QualityGatedAgentConfig {
    /** LLM configuration */
    llm: LLMExecutorConfig;
    /** Docker evaluator configuration */
    docker?: EvaluatorConfig;
    /** Quality gate configuration */
    qualityGate?: QualityGateConfig;
    /** Maximum reasoning refinement iterations before generating patch */
    maxReasoningIterations?: number;
    /** Target quality score (percentage of tests passing) */
    targetScore?: number;
    /** Whether to extract code from Docker for LLM context (default: true) */
    extractCode?: boolean;
    /** Whether to enable verbose logging */
    verbose?: boolean;
}
/**
 * Create a quality-gated LLM agent that evaluates reasoning before execution.
 */
export declare function createQualityGatedAgent(task: SWEBenchTask, config: QualityGatedAgentConfig): ExperimentAgent;
//# sourceMappingURL=quality-gated-agent.d.ts.map