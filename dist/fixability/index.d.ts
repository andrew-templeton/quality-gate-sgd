/**
 * Fixability Estimation
 * =====================
 * LLM-based estimation of how many issues at a symbol can be fixed in one pass.
 *
 * This helps prioritize actionable suggestions by accounting for:
 * - Code complexity
 * - Issue interdependence
 * - Whether fixes are straightforward vs. require architectural changes
 */
import type { SymbolIssues } from '../symbols/types.js';
export interface FixabilityEstimate {
    symbolId: string;
    score: number;
    reasoning: string;
    estimatedEffort: 'trivial' | 'moderate' | 'significant' | 'major';
}
export interface EstimateFixabilityOptions {
    /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
    apiKey?: string;
    /** Model to use (defaults to gpt-5-nano) */
    model?: string;
    /** Maximum symbols to estimate (defaults to 10) */
    maxSymbols?: number;
    /** Timeout per estimate in ms (defaults to 30000) */
    timeout?: number;
}
/**
 * Estimate fixability for a list of symbols.
 *
 * Updates symbols in place with fixabilityScore and adjustedDeltaQ.
 * After estimation, re-sorts by adjustedDeltaQ and moves estimated symbols
 * to the front of the array so they appear in output.
 */
export declare function estimateFixability(symbols: SymbolIssues[], options?: EstimateFixabilityOptions): Promise<FixabilityEstimate[]>;
//# sourceMappingURL=index.d.ts.map