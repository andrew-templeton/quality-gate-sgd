/**
 * Quality Gate Configuration
 * ==========================
 * Centralized configuration for the quality gate system.
 * All project-specific values are externalized here for portability.
 *
 * To port this to another project:
 * 1. Install quality-gate-sgd
 * 2. Set environment variables or use defaults
 * 3. Create a rules.json with your project's thresholds
 */
export interface QualityGateConfig {
    projectName: string;
    projectRoot: string;
    sonarqube: {
        url: string;
        projectKey: string;
        tokenFile: string;
        defaultCredentials: {
            user: string;
            password: string;
        };
    };
    coverage: {
        unitDir: string;
        lambdaDir: string;
        summaryFile: string;
    };
    cache: {
        file: string;
        maxAgeDays: number;
    };
    rulesFile: string;
    codePathspecs: string[];
    scriptTimeouts: Record<string, number>;
    defaultScriptTimeout: number;
}
/**
 * Load configuration from environment variables and defaults.
 * Environment variables take precedence over defaults.
 */
export declare function loadConfig(): QualityGateConfig;
/**
 * Get the quality gate configuration.
 * Loads once and caches for the duration of the process.
 */
export declare function getConfig(): QualityGateConfig;
/**
 * Reset the configuration cache (useful for testing)
 */
export declare function resetConfig(): void;
/**
 * Get the SonarQube authentication token.
 * Reads from token file or falls back to default credentials.
 */
export declare function getSonarAuthToken(): string;
/**
 * Get curl auth argument for SonarQube API calls
 */
export declare function getSonarCurlAuth(): string;
//# sourceMappingURL=config.d.ts.map