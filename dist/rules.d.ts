/**
 * Rules Evaluation Engine
 * Evaluates quality metrics against defined rules
 */
import type { QualityRules, Metrics, EvaluationResult, CacheEntry } from './types.js';
export declare function loadRules(): QualityRules;
export declare function computeRulesHash(rules: QualityRules): string;
export declare function evaluateRules(rules: QualityRules, currentMetrics: Metrics, baselineEntry?: CacheEntry): EvaluationResult;
/**
 * Check if cached evaluation is still valid
 * Returns false if rules have changed since cache entry was created
 */
export declare function isCacheValid(entry: CacheEntry, rules: QualityRules): boolean;
//# sourceMappingURL=rules.d.ts.map