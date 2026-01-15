/**
 * Custom Dimensions
 * =================
 * Support for user-defined metrics via script extractors.
 *
 * Users configure custom dimensions in quality-gate.config.ts:
 *
 * ```typescript
 * export const customDimensions: CustomDimensionConfig[] = [
 *   {
 *     path: 'custom.anyCount',
 *     displayName: 'TypeScript "any" Usage',
 *     description: 'Count of "any" type annotations',
 *     direction: 'lower-better',
 *     continuity: 'discrete',
 *     defaultWeight: 0.03,
 *     extractor: {
 *       type: 'script',
 *       command: 'grep -r "any" src/ --include="*.ts" | wc -l',
 *     }
 *   }
 * ];
 * ```
 */
import { type DimensionDirection, type DimensionContinuity } from './registry.js';
export interface ScriptExtractor {
    type: 'script';
    /** Command to run (can use shell syntax) */
    command: string;
    /** How to parse the output (default: 'number' - extract first number from output) */
    parseOutput?: 'number' | 'json' | 'regex';
    /** JSONPath expression if parseOutput is 'json' (e.g., '$.summary.total') */
    jsonPath?: string;
    /** Regex pattern with capture group if parseOutput is 'regex' */
    regex?: string;
    /** Timeout in ms (default: 30000) */
    timeout?: number;
}
export interface CustomDimensionConfig {
    /** Must start with "custom." */
    path: string;
    /** Human-readable name */
    displayName: string;
    /** Description for MCP/LLM context */
    description?: string;
    /** Optimization direction */
    direction: DimensionDirection;
    /** SGD suitability */
    continuity?: DimensionContinuity;
    /** Weight for fitness function (default: 0.01) */
    defaultWeight?: number;
    /** How to extract the metric value */
    extractor: ScriptExtractor;
}
/**
 * Load custom dimensions from the project's config file.
 * Returns an empty array if no config file exists.
 *
 * @param basePath - Directory to search for config file (default: cwd)
 */
export declare function loadCustomDimensions(basePath?: string): Promise<CustomDimensionConfig[]>;
/**
 * Extract a custom metric by running its extractor.
 *
 * @param config - Custom dimension config
 * @returns The extracted numeric value
 */
export declare function extractCustomMetric(config: CustomDimensionConfig): number;
/**
 * Register all custom dimensions from config.
 * Should be called early in the CLI lifecycle.
 *
 * @param basePath - Directory to search for config file
 */
export declare function registerCustomDimensions(basePath?: string): Promise<CustomDimensionConfig[]>;
/**
 * Extract all custom metrics and return as a record.
 *
 * @param configs - Custom dimension configs (from loadCustomDimensions)
 * @returns Record of path -> value
 */
export declare function extractAllCustomMetrics(configs: CustomDimensionConfig[]): Record<string, number>;
//# sourceMappingURL=custom.d.ts.map