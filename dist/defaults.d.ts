/**
 * Embedded Default Rules
 * ======================
 * Sensible defaults for zero-config operation.
 * These are used when no rules.json file is present.
 *
 * @module defaults
 */
import type { QualityRules } from './types.js';
/**
 * Coverage-only defaults: Minimal requirements that work without SonarQube.
 * Good for quick setup and projects that don't use static analysis.
 */
export declare const COVERAGE_ONLY_DEFAULTS: QualityRules;
/**
 * Full defaults: Includes SonarQube metrics for comprehensive quality gates.
 * Requires SonarQube to be running.
 */
export declare const FULL_DEFAULTS: QualityRules;
/**
 * Get default rules based on mode.
 *
 * @param coverageOnly - Whether to use coverage-only defaults (no SonarQube)
 * @returns The default rules configuration
 */
export declare function getDefaultRules(coverageOnly: boolean): QualityRules;
/**
 * Check if rules are embedded defaults (not user-configured).
 */
export declare function isEmbeddedDefaults(rules: QualityRules): boolean;
//# sourceMappingURL=defaults.d.ts.map