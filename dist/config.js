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
import * as path from 'path';
import * as fs from 'fs';
// =============================================================================
// Default Configuration
// =============================================================================
function resolveProjectRoot() {
    // Start from cwd and verify package.json exists
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
        return cwd;
    }
    // Walk up to find package.json
    let dir = cwd;
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return cwd;
}
/**
 * Load configuration from environment variables and defaults.
 * Environment variables take precedence over defaults.
 */
export function loadConfig() {
    const projectRoot = process.env.QUALITY_PROJECT_ROOT || resolveProjectRoot();
    return {
        projectName: process.env.QUALITY_PROJECT_NAME || 'quality-gate',
        projectRoot,
        sonarqube: {
            url: process.env.SONARQUBE_URL || 'http://localhost:9000',
            projectKey: process.env.SONARQUBE_PROJECT_KEY || detectProjectKey(projectRoot),
            tokenFile: process.env.SONARQUBE_TOKEN_FILE ||
                path.join(projectRoot, '.sonarqube-token'),
            defaultCredentials: {
                user: process.env.SONARQUBE_DEFAULT_USER || 'admin',
                password: process.env.SONARQUBE_DEFAULT_PASSWORD || 'admin',
            },
        },
        coverage: {
            unitDir: process.env.QUALITY_COVERAGE_UNIT_DIR || 'coverage',
            lambdaDir: process.env.QUALITY_COVERAGE_LAMBDA_DIR || 'coverage-lambda',
            summaryFile: process.env.QUALITY_COVERAGE_SUMMARY_FILE || 'coverage-summary.json',
        },
        cache: {
            file: process.env.QUALITY_CACHE_FILE ||
                path.join(projectRoot, '.quality-gate-cache.json'),
            maxAgeDays: parseInt(process.env.QUALITY_CACHE_MAX_AGE_DAYS || '90', 10),
        },
        rulesFile: process.env.QUALITY_RULES_FILE || 'rules.json',
        codePathspecs: (process.env.QUALITY_CODE_PATHSPECS || 'src/,tests/,scripts/').split(','),
        scriptTimeouts: {
            'test:ci': 300000, // 5 minutes
            quality: 120000, // 2 minutes
        },
        defaultScriptTimeout: 120000,
    };
}
/**
 * Detect project key from sonar-project.properties or package.json
 */
function detectProjectKey(projectRoot) {
    // Try sonar-project.properties first
    const sonarPropsPath = path.join(projectRoot, 'sonar-project.properties');
    if (fs.existsSync(sonarPropsPath)) {
        const content = fs.readFileSync(sonarPropsPath, 'utf-8');
        const match = content.match(/sonar\.projectKey\s*=\s*(.+)/);
        if (match) {
            return match[1].trim();
        }
    }
    // Fall back to package.json name
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (pkg.name) {
                // Convert scoped package name to valid project key
                return pkg.name.replace(/^@/, '').replace(/\//g, '-');
            }
        }
        catch {
            // Ignore parse errors
        }
    }
    return 'my-project';
}
// =============================================================================
// Singleton Config Instance
// =============================================================================
let _config;
/**
 * Get the quality gate configuration.
 * Loads once and caches for the duration of the process.
 */
export function getConfig() {
    if (!_config) {
        _config = loadConfig();
    }
    return _config;
}
/**
 * Reset the configuration cache (useful for testing)
 */
export function resetConfig() {
    _config = undefined;
}
/**
 * Get the SonarQube authentication token.
 * Reads from token file or falls back to default credentials.
 */
export function getSonarAuthToken() {
    const config = getConfig();
    if (fs.existsSync(config.sonarqube.tokenFile)) {
        return fs.readFileSync(config.sonarqube.tokenFile, 'utf-8').trim();
    }
    return config.sonarqube.defaultCredentials.user;
}
/**
 * Get curl auth argument for SonarQube API calls
 */
export function getSonarCurlAuth() {
    const config = getConfig();
    if (fs.existsSync(config.sonarqube.tokenFile)) {
        const token = fs.readFileSync(config.sonarqube.tokenFile, 'utf-8').trim();
        return `-u ${token}:`;
    }
    const { user, password } = config.sonarqube.defaultCredentials;
    return `-u ${user}:${password}`;
}
//# sourceMappingURL=config.js.map