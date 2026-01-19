/**
 * LLM-Guided Initialization
 * ==========================
 * Uses Claude to analyze your repo and suggest a quality topology.
 *
 * Flow:
 * 1. Analyze repo structure (package.json, configs, test files)
 * 2. Ask LLM to suggest geometry (which dimensions to measure)
 * 3. Interactive interview about available tooling
 * 4. Run initial metrics to calibrate "barely passing" thresholds
 * 5. Generate rules.json + explanatory QUALITY.md
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getDimensionsByCategory } from './dimensions/index.js';
// =============================================================================
// Repo Analysis
// =============================================================================
function analyzeRepo(projectRoot) {
    const analysis = {
        packageJson: null,
        hasTypeScript: false,
        hasJest: false,
        hasVitest: false,
        hasMocha: false,
        hasEslint: false,
        hasSonarConfig: false,
        hasDocker: false,
        testCommand: null,
        srcDir: 'src',
        estimatedSloc: 0,
    };
    // Read package.json
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            analysis.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const pkg = analysis.packageJson;
            // Check dependencies
            const allDeps = {
                ...(pkg.dependencies || {}),
                ...(pkg.devDependencies || {}),
            };
            analysis.hasTypeScript = 'typescript' in allDeps;
            analysis.hasJest = 'jest' in allDeps;
            analysis.hasVitest = 'vitest' in allDeps;
            analysis.hasMocha = 'mocha' in allDeps;
            analysis.hasEslint = 'eslint' in allDeps;
            // Check scripts for test command
            const scripts = pkg.scripts || {};
            if (scripts.test) {
                analysis.testCommand = 'test';
            }
            else if (scripts['test:unit']) {
                analysis.testCommand = 'test:unit';
            }
        }
        catch {
            // Ignore parse errors
        }
    }
    // Check for config files
    analysis.hasTypeScript = analysis.hasTypeScript || fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
    analysis.hasEslint = analysis.hasEslint ||
        fs.existsSync(path.join(projectRoot, '.eslintrc.js')) ||
        fs.existsSync(path.join(projectRoot, '.eslintrc.json')) ||
        fs.existsSync(path.join(projectRoot, 'eslint.config.js'));
    analysis.hasSonarConfig = fs.existsSync(path.join(projectRoot, 'sonar-project.properties'));
    // Check for Docker
    try {
        const dockerCheck = spawnSync('docker', ['--version'], { encoding: 'utf-8', timeout: 5000 });
        analysis.hasDocker = dockerCheck.status === 0;
    }
    catch {
        analysis.hasDocker = false;
    }
    // Estimate SLOC
    const srcPath = path.join(projectRoot, 'src');
    if (fs.existsSync(srcPath)) {
        analysis.srcDir = 'src';
        analysis.estimatedSloc = estimateSloc(srcPath);
    }
    return analysis;
}
function estimateSloc(dir) {
    let count = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !['node_modules', 'dist', '.git'].includes(entry.name)) {
                count += estimateSloc(fullPath);
            }
            else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                count += content.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')).length;
            }
        }
    }
    catch {
        // Ignore errors
    }
    return count;
}
// =============================================================================
// LLM Integration
// =============================================================================
function checkClaudeCli() {
    try {
        const result = spawnSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000 });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
function checkAnthropicKey() {
    return !!process.env.ANTHROPIC_API_KEY;
}
async function callClaude(prompt) {
    // Try Claude CLI first
    if (checkClaudeCli()) {
        const result = spawnSync('claude', ['-p', prompt], {
            encoding: 'utf-8',
            timeout: 60000,
            maxBuffer: 1024 * 1024,
        });
        if (result.status === 0 && result.stdout) {
            return result.stdout;
        }
    }
    // Fall back to API if key exists
    if (checkAnthropicKey()) {
        // Use curl for simplicity (avoids adding SDK dependency)
        const result = spawnSync('curl', [
            '-s',
            '-X', 'POST',
            'https://api.anthropic.com/v1/messages',
            '-H', 'Content-Type: application/json',
            '-H', `x-api-key: ${process.env.ANTHROPIC_API_KEY}`,
            '-H', 'anthropic-version: 2023-06-01',
            '-d', JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }],
            }),
        ], {
            encoding: 'utf-8',
            timeout: 60000,
        });
        if (result.stdout) {
            try {
                const response = JSON.parse(result.stdout);
                return response.content?.[0]?.text || '';
            }
            catch {
                // Ignore parse errors
            }
        }
    }
    throw new Error('No LLM available. Install Claude CLI or set ANTHROPIC_API_KEY.');
}
async function suggestGeometry(analysis) {
    // Get valid dimension paths grouped by category
    const coverageDims = getDimensionsByCategory('coverage').map(d => d.path);
    const errorDims = getDimensionsByCategory('errors').map(d => d.path);
    const qualityDims = getDimensionsByCategory('quality').map(d => d.path);
    const prompt = `You are helping configure a code quality gate system. Analyze this repository profile and suggest which quality dimensions to measure.

Repository Profile:
- TypeScript: ${analysis.hasTypeScript}
- Test Framework: ${analysis.hasJest ? 'Jest' : analysis.hasVitest ? 'Vitest' : analysis.hasMocha ? 'Mocha' : 'Unknown'}
- ESLint: ${analysis.hasEslint}
- Has SonarQube config: ${analysis.hasSonarConfig}
- Docker available: ${analysis.hasDocker}
- Estimated SLOC: ${analysis.estimatedSloc}
- Test command: ${analysis.testCommand || 'none found'}

## VALID DIMENSIONS (you MUST only use dimensions from this list)

Coverage dimensions:
${coverageDims.map(d => `  - ${d}`).join('\n')}

Error dimensions:
${errorDims.map(d => `  - ${d}`).join('\n')}

Quality dimensions (requires SonarQube):
${qualityDims.map(d => `  - ${d}`).join('\n')}

## INSTRUCTIONS

1. Select dimensions from the VALID DIMENSIONS list above
2. For coverage, prefer "coverage.unit.*" if there's a single test suite
3. For TypeScript projects, include "typescript.errors"
4. For ESLint projects, include "eslint.errors"
5. Only include SonarQube dimensions if Docker is available and you'll recommend it

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "dimensions": ["list of dimension paths from VALID DIMENSIONS above"],
  "rationale": "brief explanation of why these dimensions",
  "coverageTarget": <number between 50-90, appropriate for this project size>,
  "recommendSonarQube": <true if Docker available and project is >500 SLOC, false otherwise>
}`;
    try {
        const response = await callClaude(prompt);
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    }
    catch {
        // Fall back to defaults
    }
    // Default suggestion
    return {
        dimensions: analysis.hasTypeScript
            ? ['coverage.branches', 'coverage.statements', 'typescript.errors', 'eslint.errors']
            : ['coverage.branches', 'coverage.statements', 'eslint.errors'],
        rationale: 'Standard quality dimensions for a TypeScript project',
        coverageTarget: analysis.estimatedSloc > 5000 ? 60 : 70,
        recommendSonarQube: analysis.hasDocker && analysis.estimatedSloc > 500,
    };
}
// =============================================================================
// Interactive Interview
// =============================================================================
async function askQuestion(question, defaultAnswer) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
    });
    return new Promise((resolve) => {
        rl.question(`${question} [${defaultAnswer}]: `, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultAnswer);
        });
    });
}
async function askYesNo(question, defaultYes) {
    const defaultStr = defaultYes ? 'Y/n' : 'y/N';
    const answer = await askQuestion(question, defaultStr);
    if (defaultYes) {
        return !answer.toLowerCase().startsWith('n');
    }
    return answer.toLowerCase().startsWith('y');
}
async function conductInterview(analysis, suggestion, options) {
    if (options.yes) {
        // Accept all defaults
        return {
            useSonarQube: !options.noDocker && suggestion.recommendSonarQube,
            coverageTarget: suggestion.coverageTarget,
            testCommand: analysis.testCommand || 'test',
            strictMode: false,
        };
    }
    console.error('\n--- Quality Gate Configuration ---\n');
    console.error(`LLM Analysis: ${suggestion.rationale}\n`);
    const useSonarQube = options.noDocker
        ? false
        : await askYesNo(`Use SonarQube for deep analysis? (requires Docker)`, suggestion.recommendSonarQube && analysis.hasDocker);
    const coverageInput = await askQuestion(`Target branch coverage percentage`, String(suggestion.coverageTarget));
    const coverageTarget = parseInt(coverageInput, 10) || suggestion.coverageTarget;
    const testCommand = await askQuestion(`Test command (npm script name)`, analysis.testCommand || 'test');
    const strictMode = await askYesNo(`Enable strict mode? (zero tolerance for type/lint errors)`, false);
    return { useSonarQube, coverageTarget, testCommand, strictMode };
}
function collectCalibrationMetrics(projectRoot, testCommand, hasTypeScript) {
    const metrics = {
        coverageBranches: null,
        coverageStatements: null,
        typescriptErrors: 0,
        eslintErrors: 0,
    };
    console.error('\nCollecting current metrics for calibration...');
    // Run tests with coverage
    console.error('  Running tests with coverage...');
    spawnSync('npm', ['run', testCommand, '--', '--coverage'], {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 300000,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Try to read coverage summary
    const coveragePaths = [
        path.join(projectRoot, 'coverage/coverage-summary.json'),
        path.join(projectRoot, 'coverage-unit/coverage-summary.json'),
    ];
    for (const coveragePath of coveragePaths) {
        if (fs.existsSync(coveragePath)) {
            try {
                const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
                if (coverage.total) {
                    metrics.coverageBranches = coverage.total.branches?.pct ?? null;
                    metrics.coverageStatements = coverage.total.statements?.pct ?? null;
                    console.error(`  Coverage: ${metrics.coverageBranches?.toFixed(1)}% branches, ${metrics.coverageStatements?.toFixed(1)}% statements`);
                    break;
                }
            }
            catch {
                // Ignore
            }
        }
    }
    // TypeScript errors
    if (hasTypeScript) {
        console.error('  Checking TypeScript...');
        const tscResult = spawnSync('npx', ['tsc', '--noEmit'], {
            cwd: projectRoot,
            encoding: 'utf-8',
            timeout: 60000,
        });
        const output = (tscResult.stdout || '') + (tscResult.stderr || '');
        const errors = output.match(/error TS\d+/g) || [];
        metrics.typescriptErrors = errors.length;
        console.error(`  TypeScript errors: ${metrics.typescriptErrors}`);
    }
    // ESLint errors
    console.error('  Checking ESLint...');
    const eslintResult = spawnSync('npx', ['eslint', '--format', 'json', 'src/'], {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 120000,
    });
    try {
        const results = JSON.parse(eslintResult.stdout || '[]');
        for (const r of results) {
            metrics.eslintErrors += r.errorCount || 0;
        }
    }
    catch {
        // Ignore
    }
    console.error(`  ESLint errors: ${metrics.eslintErrors}`);
    return metrics;
}
// =============================================================================
// Config Generation
// =============================================================================
function generateConfig(analysis, suggestion, answers, metrics) {
    // Calculate "barely passing" thresholds
    // Set floor to current value minus a small buffer, or target if current is higher
    const branchFloor = metrics.coverageBranches !== null
        ? Math.min(Math.max(metrics.coverageBranches - 5, 0), answers.coverageTarget)
        : Math.max(answers.coverageTarget - 10, 30);
    const statementFloor = metrics.coverageStatements !== null
        ? Math.min(Math.max(metrics.coverageStatements - 5, 0), answers.coverageTarget + 10)
        : Math.max(answers.coverageTarget, 40);
    const rules = {
        version: '1.0.0',
        description: `Quality gates for ${path.basename(process.cwd())} - Generated by quality-gate-sgd init`,
        rules: {
            floors: {
                'coverage.unit.branches': Math.round(branchFloor),
                'coverage.unit.statements': Math.round(statementFloor),
            },
            ceilings: {},
            monotonic: [
                {
                    direction: 'up',
                    metrics: ['coverage.unit.branches', 'coverage.unit.statements'],
                },
            ],
            requiredScripts: [answers.testCommand],
        },
    };
    // Add TypeScript ceiling if applicable
    if (analysis.hasTypeScript) {
        if (answers.strictMode) {
            rules.rules.ceilings['typescript.errors'] = 0;
        }
        else {
            // Allow current errors but require monotonic improvement
            rules.rules.ceilings['typescript.errors'] = metrics.typescriptErrors;
            rules.rules.monotonic.push({
                direction: 'down',
                metrics: ['typescript.errors'],
            });
        }
    }
    // Add ESLint ceiling if applicable
    if (analysis.hasEslint) {
        if (answers.strictMode) {
            rules.rules.ceilings['eslint.errors'] = 0;
        }
        else {
            rules.rules.ceilings['eslint.errors'] = metrics.eslintErrors;
            rules.rules.monotonic.push({
                direction: 'down',
                metrics: ['eslint.errors'],
            });
        }
    }
    // Add SonarQube rules if enabled
    if (answers.useSonarQube) {
        rules.rules.ceilings['sonarqube.blocker'] = 0;
        rules.rules.ceilings['sonarqube.critical'] = 0;
        rules.rules.monotonic.push({
            direction: 'down',
            metrics: ['sonarqube.bugs', 'sonarqube.vulnerabilities'],
        });
    }
    // Generate explanation
    const explanation = generateExplanation(analysis, suggestion, answers, metrics, rules);
    return { rules, explanation };
}
function generateExplanation(analysis, suggestion, answers, metrics, rules) {
    const lines = [
        '# Quality Gate Configuration',
        '',
        '> Generated by `quality-gate-sgd init`',
        '',
        '## Overview',
        '',
        'This project uses deterministic quality gates to create consistent improvement',
        'pressure on code quality. The gates are calibrated to your current metrics,',
        'ensuring you can pass immediately while requiring monotonic improvement.',
        '',
        '## Quality Dimensions',
        '',
        '| Dimension | Current | Floor/Ceiling | Monotonic |',
        '|-----------|---------|---------------|-----------|',
    ];
    // Coverage
    if (metrics.coverageBranches !== null) {
        lines.push(`| Branch Coverage | ${metrics.coverageBranches.toFixed(1)}% | ≥${rules.rules.floors['coverage.unit.branches']}% | ↑ |`);
    }
    if (metrics.coverageStatements !== null) {
        lines.push(`| Statement Coverage | ${metrics.coverageStatements.toFixed(1)}% | ≥${rules.rules.floors['coverage.unit.statements']}% | ↑ |`);
    }
    // TypeScript
    if (analysis.hasTypeScript) {
        const ceiling = rules.rules.ceilings['typescript.errors'];
        lines.push(`| TypeScript Errors | ${metrics.typescriptErrors} | ≤${ceiling} | ↓ |`);
    }
    // ESLint
    if (analysis.hasEslint) {
        const ceiling = rules.rules.ceilings['eslint.errors'];
        lines.push(`| ESLint Errors | ${metrics.eslintErrors} | ≤${ceiling} | ↓ |`);
    }
    lines.push('');
    lines.push('## How It Works');
    lines.push('');
    lines.push('1. **Floors**: Minimum acceptable values (coverage must stay above)');
    lines.push('2. **Ceilings**: Maximum acceptable values (errors must stay below)');
    lines.push('3. **Monotonic**: Values can only improve, never regress');
    lines.push('');
    lines.push('The monotonic rules create a "ratchet" effect: once quality improves,');
    lines.push('it cannot go back. This creates consistent descent toward higher quality.');
    lines.push('');
    lines.push('## Usage');
    lines.push('');
    lines.push('```bash');
    lines.push('# Run quality gate');
    lines.push('npx quality-gate-sgd');
    lines.push('');
    lines.push('# View trajectory (after multiple runs)');
    lines.push('npx quality-gate-sgd trajectory');
    lines.push('```');
    lines.push('');
    if (answers.useSonarQube) {
        lines.push('## SonarQube');
        lines.push('');
        lines.push('This configuration uses SonarQube for deep analysis. Ensure Docker is running:');
        lines.push('');
        lines.push('```bash');
        lines.push('# Start SonarQube');
        lines.push('docker run -d --name sonarqube -p 9000:9000 sonarqube:latest');
        lines.push('```');
        lines.push('');
    }
    lines.push('## Theory');
    lines.push('');
    lines.push('This system is based on the principle that deterministic quality gates');
    lines.push('create gradient descent-like behavior from stochastic agents (like LLMs).');
    lines.push('See the [quality-gate-sgd documentation](https://github.com/your-org/quality-gate-sgd)');
    lines.push('for the theoretical foundation.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`*Calibrated on ${new Date().toISOString().split('T')[0]} with SLOC ≈ ${analysis.estimatedSloc}*`);
    return lines.join('\n');
}
// =============================================================================
// Main Init Function
// =============================================================================
export async function runInit(args) {
    const options = {
        yes: args.includes('-y') || args.includes('--yes'),
        noDocker: args.includes('--docker=no') || args.includes('--no-docker'),
        verbose: args.includes('-v') || args.includes('--verbose'),
    };
    const projectRoot = process.cwd();
    console.error('Quality Gate SGD - Initialization');
    console.error('==================================\n');
    // Check for LLM availability
    const hasClaudeCli = checkClaudeCli();
    const hasApiKey = checkAnthropicKey();
    if (!hasClaudeCli && !hasApiKey) {
        console.error('Warning: No LLM available for intelligent topology suggestion.');
        console.error('  Install Claude CLI: npm install -g @anthropic-ai/claude-cli');
        console.error('  Or set ANTHROPIC_API_KEY environment variable');
        console.error('  Proceeding with default configuration...\n');
    }
    else {
        console.error(`LLM: ${hasClaudeCli ? 'Claude CLI' : 'Anthropic API'}\n`);
    }
    // Analyze repository
    console.error('Analyzing repository...');
    const analysis = analyzeRepo(projectRoot);
    if (options.verbose) {
        console.error(`  TypeScript: ${analysis.hasTypeScript}`);
        console.error(`  Test framework: ${analysis.hasJest ? 'Jest' : analysis.hasVitest ? 'Vitest' : 'Unknown'}`);
        console.error(`  ESLint: ${analysis.hasEslint}`);
        console.error(`  Docker: ${analysis.hasDocker}`);
        console.error(`  SLOC: ~${analysis.estimatedSloc}`);
    }
    // Get geometry suggestion from LLM
    console.error('Getting topology suggestion...');
    const suggestion = await suggestGeometry(analysis);
    if (options.verbose) {
        console.error(`  Suggested dimensions: ${suggestion.dimensions.join(', ')}`);
        console.error(`  Rationale: ${suggestion.rationale}`);
    }
    // Conduct interview (or use defaults with -y)
    const answers = await conductInterview(analysis, suggestion, options);
    // Collect calibration metrics
    const metrics = collectCalibrationMetrics(projectRoot, answers.testCommand, analysis.hasTypeScript);
    // Generate configuration
    console.error('\nGenerating configuration...');
    const config = generateConfig(analysis, suggestion, answers, metrics);
    // Write rules.json
    const rulesPath = path.join(projectRoot, 'rules.json');
    fs.writeFileSync(rulesPath, JSON.stringify(config.rules, null, 2));
    console.error(`  Created: rules.json`);
    // Write QUALITY.md
    const qualityMdPath = path.join(projectRoot, 'QUALITY.md');
    fs.writeFileSync(qualityMdPath, config.explanation);
    console.error(`  Created: QUALITY.md`);
    // Create sonar-project.properties if using SonarQube and doesn't exist
    if (answers.useSonarQube && !analysis.hasSonarConfig) {
        const sonarConfig = [
            `sonar.projectKey=${path.basename(projectRoot)}`,
            'sonar.sources=src',
            'sonar.tests=src',
            'sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts',
            'sonar.javascript.lcov.reportPaths=coverage/lcov.info',
            'sonar.typescript.lcov.reportPaths=coverage/lcov.info',
        ].join('\n');
        fs.writeFileSync(path.join(projectRoot, 'sonar-project.properties'), sonarConfig);
        console.error(`  Created: sonar-project.properties`);
    }
    console.error('\n✓ Initialization complete!\n');
    console.error('Next steps:');
    console.error('  1. Review rules.json and adjust thresholds if needed');
    console.error('  2. Run: npx quality-gate-sgd');
    if (answers.useSonarQube) {
        console.error('  3. Start SonarQube: docker run -d --name sonarqube -p 9000:9000 sonarqube:latest');
    }
    console.error('');
}
//# sourceMappingURL=init.js.map