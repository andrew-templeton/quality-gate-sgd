/**
 * LLM-Assisted Dimension Builder
 * ===============================
 * Helps developers create custom dimension configs by analyzing:
 * - Command output samples
 * - Package documentation (via npm registry)
 * - User hints about what the metric measures
 *
 * Uses Claude CLI for LLM analysis.
 */
import type { CustomDimensionConfig } from './custom.js';
export interface DimensionBuilderOptions {
    /** Command or npm script to run */
    command: string;
    /** Optional hint about what this metric measures */
    hint?: string;
    /** Pre-captured sample output (if available) */
    sampleOutput?: string;
    /** Whether to run the command now to capture output */
    runNow?: boolean;
    /** Whether to try fetching package docs */
    fetchDocs?: boolean;
    /** Timeout for command execution (ms) */
    timeout?: number;
}
export interface DimensionBuilderResult {
    /** Generated config (if successful) */
    config?: CustomDimensionConfig;
    /** Error message (if failed) */
    error?: string;
    /** Raw LLM response for debugging */
    rawResponse?: string;
}
/**
 * Build a custom dimension config using LLM analysis.
 */
export declare function buildDimension(options: DimensionBuilderOptions): Promise<DimensionBuilderResult>;
/**
 * Append a custom dimension config to the quality-gate.config.ts file.
 * Creates the file if it doesn't exist.
 */
export declare function appendToConfigFile(config: CustomDimensionConfig, configPath?: string): void;
//# sourceMappingURL=builder.d.ts.map