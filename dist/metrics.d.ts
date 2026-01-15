/**
 * Metrics Extraction Module
 * Extracts quality metrics from various sources
 */
import type { Metrics, CoverageMetrics, AllCoverageMetrics, SonarqubeMetrics, EslintMetrics, TypescriptMetrics } from './types.js';
import { type CustomDimensionConfig } from './dimensions/index.js';
/**
 * Extract all three coverage metrics: lambda-only, unit-only, and union.
 */
export declare function extractAllCoverageMetrics(): AllCoverageMetrics;
/**
 * Extract coverage metrics for quality gate.
 * Returns the union coverage for backward compatibility.
 * @deprecated Use extractAllCoverageMetrics() for full coverage data.
 */
export declare function extractCoverageMetrics(): CoverageMetrics | undefined;
export interface SonarIssue {
    severity: string;
    type: string;
    message: string;
    component: string;
    line?: number;
    rule: string;
}
export declare function getTopSonarIssues(limit?: number): SonarIssue[];
export declare function extractSonarqubeMetrics(): SonarqubeMetrics | undefined;
export declare function isSonarqubeAvailable(): boolean;
export declare function runSonarqubeScan(): {
    success: boolean;
    error?: string;
};
export declare function extractTypescriptMetrics(): TypescriptMetrics;
export declare function extractEslintMetrics(): EslintMetrics;
export declare function runScript(script: string): 'pass' | 'fail';
export declare function runScripts(scripts: string[]): Record<string, 'pass' | 'fail'>;
/**
 * Count source lines of code in a directory.
 * Uses a simple heuristic: non-empty, non-comment lines in .ts/.tsx/.js/.jsx files.
 * For determinism, always scans the same directories with the same rules.
 */
export declare function extractSloc(srcDir?: string): number;
interface MetricsExtractionOptions {
    scriptsToRun?: string[];
    skipSonarQube?: boolean;
    /** Pre-loaded custom dimension configs (if already loaded) */
    customDimensions?: CustomDimensionConfig[];
    /** Whether to skip custom dimension extraction (default: false) */
    skipCustomDimensions?: boolean;
}
export declare function extractAllMetrics(scriptsToRunOrOptions?: string[] | MetricsExtractionOptions): Metrics;
/**
 * Async version of extractAllMetrics that loads custom dimensions from config.
 * Use this when you want automatic custom dimension discovery.
 */
export declare function extractAllMetricsAsync(options?: MetricsExtractionOptions): Promise<Metrics>;
export {};
//# sourceMappingURL=metrics.d.ts.map