/**
 * LLM Executor - OpenAI Responses API Integration
 * ================================================
 * Production LLM executor that integrates with OpenAI-compatible APIs
 * for experiment execution. Uses the Responses API per user preferences.
 *
 * Supports:
 * - GPT-5.2, GPT-5-mini, GPT-5-nano families (preferred)
 * - Any OpenAI-compatible API endpoint
 * - Structured output for code changes
 */
import type { LLMExecutor, FileChange } from './harness.js';
import type { PatchProposalReasoning } from './swebench/quality-gate.js';
import type { SWEBenchTask } from './swebench/types.js';
import { type CodeRetrievalConfig } from './swebench/code-retrieval.js';
/**
 * Configuration for the LLM executor.
 */
export interface LLMExecutorConfig {
    /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
    apiKey?: string;
    /** API base URL (for compatible endpoints) */
    baseUrl?: string;
    /** Model to use (default: gpt-5-mini) */
    model?: string;
    /** Maximum tokens for response */
    maxTokens?: number;
    /** Project root for file operations */
    projectRoot: string;
    /** Whether to actually apply changes (false = dry run) */
    applyChanges?: boolean;
    /** Timeout in ms for API calls */
    timeout?: number;
    /** Retry configuration */
    retry?: {
        maxRetries?: number;
        initialDelayMs?: number;
        maxDelayMs?: number;
    };
    /** Code retrieval configuration (for SWE-bench tasks) */
    codeRetrieval?: CodeRetrievalConfig;
}
/**
 * Extract structured reasoning from the LLM for a SWE-bench task.
 * This is the first step in quality-gated patch generation.
 */
export declare function extractReasoning(task: SWEBenchTask, config: LLMExecutorConfig): Promise<{
    reasoning: PatchProposalReasoning | null;
    error?: string;
}>;
/**
 * Convert reasoning to a patch by generating code changes.
 * This is the second step after reasoning passes the quality gate.
 */
export declare function reasoningToPatch(task: SWEBenchTask, reasoning: PatchProposalReasoning, config: LLMExecutorConfig): Promise<{
    patch: string | null;
    changes: FileChange[] | null;
    error?: string;
}>;
/**
 * Create an LLM executor that uses OpenAI's Responses API.
 */
export declare function createLLMExecutor(config: LLMExecutorConfig): LLMExecutor;
/**
 * Create an executor configured for GPT-5-mini (recommended default).
 */
export declare function createGPT5MiniExecutor(projectRoot: string, options?: Partial<LLMExecutorConfig>): LLMExecutor;
/**
 * Create an executor configured for GPT-5-nano (fastest, cheapest).
 */
export declare function createGPT5NanoExecutor(projectRoot: string, options?: Partial<LLMExecutorConfig>): LLMExecutor;
/**
 * Create an executor configured for GPT-5.2 (highest capability).
 */
export declare function createGPT52Executor(projectRoot: string, options?: Partial<LLMExecutorConfig>): LLMExecutor;
/**
 * Create an executor for a custom/local endpoint.
 */
export declare function createCustomEndpointExecutor(projectRoot: string, baseUrl: string, model: string, options?: Partial<LLMExecutorConfig>): LLMExecutor;
//# sourceMappingURL=llm-executor.d.ts.map