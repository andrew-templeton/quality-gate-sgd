/**
 * Optimization Target Aggregation
 * ================================
 * Aggregates located issues into optimization targets with computed ΔQ.
 *
 * The key insight: one target (file/symbol) can address MULTIPLE dimensions.
 * We compute totalDeltaQ as the weighted sum of impacts across all dimensions.
 */
import type { LocatedIssue, ExtractedIssues, OptimizationTarget, AggregateTargetsOptions } from './types.js';
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
 */
export declare function aggregateToTargets(extractedIssues: ExtractedIssues, options?: AggregateTargetsOptions): OptimizationTarget[];
//# sourceMappingURL=aggregate.d.ts.map