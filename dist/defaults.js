/**
 * Embedded Default Rules
 * ======================
 * Sensible defaults for zero-config operation.
 * These are used when no rules.json file is present.
 *
 * @module defaults
 */
/**
 * Coverage-only defaults: Minimal requirements that work without SonarQube.
 * Good for quick setup and projects that don't use static analysis.
 */
export const COVERAGE_ONLY_DEFAULTS = {
    version: '0.0.0-embedded',
    description: 'Zero-config defaults (coverage-only mode)',
    rules: {
        floors: {
            // Start with low thresholds - projects can raise them
            'coverage.unit.branches': 50,
            'coverage.unit.statements': 50,
        },
        ceilings: {
            // No build errors allowed
            'typescript.errors': 0,
            'eslint.errors': 0,
        },
        monotonic: [
            {
                direction: 'up',
                metrics: ['coverage.unit.branches', 'coverage.unit.statements'],
            },
            {
                direction: 'down',
                metrics: ['typescript.errors', 'eslint.errors', 'eslint.warnings'],
            },
        ],
        requiredScripts: [],
    },
};
/**
 * Full defaults: Includes SonarQube metrics for comprehensive quality gates.
 * Requires SonarQube to be running.
 */
export const FULL_DEFAULTS = {
    version: '0.0.0-embedded',
    description: 'Zero-config defaults (full mode with SonarQube)',
    rules: {
        floors: {
            'coverage.unit.branches': 50,
            'coverage.unit.statements': 50,
        },
        ceilings: {
            // No build errors
            'typescript.errors': 0,
            'eslint.errors': 0,
            // SonarQube severity limits
            'sonarqube.blocker': 0,
            'sonarqube.critical': 0,
            'sonarqube.major': 10,
        },
        monotonic: [
            {
                direction: 'up',
                metrics: ['coverage.unit.branches', 'coverage.unit.statements'],
            },
            {
                direction: 'down',
                metrics: [
                    'typescript.errors',
                    'eslint.errors',
                    'sonarqube.bugs',
                    'sonarqube.vulnerabilities',
                    'sonarqube.blocker',
                    'sonarqube.critical',
                    'sonarqube.major',
                ],
            },
        ],
        requiredScripts: [],
    },
};
/**
 * Get default rules based on mode.
 *
 * @param coverageOnly - Whether to use coverage-only defaults (no SonarQube)
 * @returns The default rules configuration
 */
export function getDefaultRules(coverageOnly) {
    return coverageOnly ? COVERAGE_ONLY_DEFAULTS : FULL_DEFAULTS;
}
/**
 * Check if rules are embedded defaults (not user-configured).
 */
export function isEmbeddedDefaults(rules) {
    return rules.version === '0.0.0-embedded';
}
//# sourceMappingURL=defaults.js.map