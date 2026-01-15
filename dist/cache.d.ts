/**
 * Cache Module
 * Handles reading/writing the quality gate cache with schema versioning
 */
import type { QualityGateCache, CacheEntry, Metrics, QualityRules } from './types.js';
export declare function getCurrentCommitHash(): string;
export declare function getBaselineCommitHash(): string | undefined;
/**
 * Get the cache key for the current state
 * Returns commit hash for clean working tree, or wip:contentHash for uncommitted changes
 */
export declare function getCacheKey(): {
    key: string;
    isWIP: boolean;
};
/**
 * Check if a cache key is a WIP content hash (vs a commit hash)
 */
export declare function isWIPKey(key: string): boolean;
export declare function loadCache(): QualityGateCache;
export declare function saveCache(cache: QualityGateCache): void;
export declare function getCacheEntry(cache: QualityGateCache, commitHash: string): CacheEntry | undefined;
export declare function setCacheEntry(cache: QualityGateCache, commitHash: string, entry: CacheEntry): void;
export declare function createCacheEntry(metrics: Metrics, rules: QualityRules, status: 'pass' | 'fail', failedRules: string[]): CacheEntry;
/**
 * Find the best baseline entry for comparison
 *
 * For WIP code: baseline is HEAD commit (the last committed state)
 * For committed code: baseline is HEAD~1 (parent commit)
 */
export declare function findBaselineEntry(cache: QualityGateCache, _rules: QualityRules, isWIP?: boolean): CacheEntry | undefined;
/**
 * Remove entries older than specified days to keep cache size manageable
 */
export declare function pruneOldEntries(cache: QualityGateCache, maxAgeDays?: number): number;
//# sourceMappingURL=cache.d.ts.map