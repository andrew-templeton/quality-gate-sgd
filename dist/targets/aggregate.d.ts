/**
 * Optimization Target Aggregation
 * ================================
 * Aggregates located issues into optimization targets with computed ΔQ.
 *
 * The key insight: one target (file/symbol) can address MULTIPLE dimensions.
 * We compute totalDeltaQ as the weighted sum of impacts across all dimensions.
 *
 * Graph Weighting:
 * When includeGraphWeights is enabled, targets are weighted by their position
 * in the dependency graph. Files with more dependents get higher priority
 * because fixing them has broader impact across the codebase.
 */
import type { LocatedIssue, ExtractedIssues, OptimizationTarget, AggregateTargetsOptions } from './types.js';
import type { SymbolTable, SymbolIssues } from '../symbols/types.js';
/**
 * Compute total ΔQ for an optimization target.
 *
 * Sums the ΔQ contributions from all issues at this target.
 */
export declare function computeTargetDeltaQ(issues: LocatedIssue[]): number;
/**
 * Aggregate located issues into optimization targets.
 *
 * Groups issues by file (or symbol if granularity='symbol'), computes
 * total ΔQ for each target, and returns sorted by impact.
 *
 * When includeGraphWeights is enabled:
 * - Builds the dependency graph to get dependent counts per file
 * - Computes weightedDeltaQ = totalDeltaQ * (1 + log2(dependentCount + 1))
 * - Sorts by weightedDeltaQ instead of totalDeltaQ
 *
 * This prioritizes fixing files that many other files depend on, since
 * improving their quality has cascading benefits.
 */
export declare function aggregateToTargets(extractedIssues: ExtractedIssues, options?: AggregateTargetsOptions): OptimizationTarget[];
/**
 * Aggregate issues to the symbol level with unified representation.
 *
 * This function groups issues by their containing symbol (using symbolId)
 * and computes normalized metrics like issue density and coverage gap.
 *
 * Unlike aggregateToTargets which groups by file/symbol string,
 * this uses the full symbol table for accurate symbol information
 * and enables normalized cross-axis comparison.
 *
 * @param extractedIssues - Issues from all axes (must have symbolId populated)
 * @param symbolTable - Symbol table from symbol extraction
 * @returns Array of SymbolIssues sorted by totalDeltaQ descending
 */
export declare function aggregateToSymbols(extractedIssues: ExtractedIssues, symbolTable: SymbolTable): SymbolIssues[];
/**
 * Options for symbol-level aggregation.
 */
export interface AggregateToSymbolsOptions {
    /** Maximum number of symbols to return */
    limit?: number;
    /** Minimum totalDeltaQ to include a symbol */
    minDeltaQ?: number;
    /** Minimum issue density to include a symbol */
    minIssueDensity?: number;
    /** Filter to specific symbol kinds */
    kinds?: Array<'class' | 'method' | 'function' | 'arrow-function'>;
    /** Include dependency graph weighting for prioritization */
    includeGraphWeights?: boolean;
    /** Include symbol call graph weighting (symbols mode) */
    includeCallGraphWeights?: boolean;
}
/**
 * Aggregate to symbols with filtering options.
 */
export declare function aggregateToSymbolsWithOptions(extractedIssues: ExtractedIssues, symbolTable: SymbolTable, options?: AggregateToSymbolsOptions): SymbolIssues[];
//# sourceMappingURL=aggregate.d.ts.map