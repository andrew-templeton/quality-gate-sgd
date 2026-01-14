#!/usr/bin/env node
/**
 * Quality Gate CLI
 * ================
 * Main entry point for the quality-gate-sgd CLI.
 *
 * Commands:
 *   quality-gate run          Run the quality gate (default)
 *   quality-gate trajectory   Analyze quality descent trajectory
 *   quality-gate list-issues  List SonarQube issues
 *
 * Usage:
 *   npx quality-gate-sgd [command] [options]
 */

import {
  extractAllMetrics,
  isSonarqubeAvailable,
  runSonarqubeScan,
  getTopSonarIssues,
  type SonarIssue,
} from './metrics.js';
import { loadRules, evaluateRules, isCacheValid } from './rules.js';
import {
  loadCache,
  saveCache,
  getCurrentCommitHash,
  getCacheKey,
  getCacheEntry,
  setCacheEntry,
  createCacheEntry,
  findBaselineEntry,
  pruneOldEntries,
} from './cache.js';
import { getConfig } from './config.js';
import { listIssues } from './list-issues.js';
import {
  buildTrajectory,
  formatTrajectorySummary,
  trajectorySparkline,
} from './trajectory.js';
import { runInit } from './init.js';
import {
  getAllDimensions,
  getDimensionsByCategory,
  formatDimensionsTable,
  type DimensionCategory,
} from './dimensions/index.js';
import {
  computeFitness,
  computeGradient,
  suggestNextFixes,
  formatFitnessScore,
  formatGradientTable,
} from './fitness.js';
import {
  extractLocatedIssues,
  aggregateToTargets,
  formatTargetList,
  formatTargetsForJson,
  type TargetGranularity,
} from './targets/index.js';
import {
  buildDimension,
  appendToConfigFile,
} from './dimensions/index.js';
import { runMcpServer } from './mcp/index.js';
import * as readline from 'readline';

function log(message: string): void {
  console.error(message);
}

function formatFailures(
  failures: Array<{ type: string; rule: string; message: string }>
): string {
  return failures.map((f) => `  - [${f.type}] ${f.message}`).join('\n');
}

function formatSonarIssues(issues: SonarIssue[]): string {
  if (issues.length === 0) return '';

  const lines: string[] = ['\n## Top SonarQube Issues\n'];

  for (const issue of issues) {
    const location = issue.line ? `:${issue.line}` : '';
    lines.push(`  - [${issue.severity}] ${issue.component}${location}`);
    lines.push(`    ${issue.message}`);
    lines.push(`    Rule: ${issue.rule}`);
  }

  return lines.join('\n');
}

function getRemediationGuidance(
  failures: Array<{ type: string; rule: string; message: string }>
): string {
  const lines: string[] = ['\n## How to Fix\n'];

  const hasMonotonicFailure = failures.some((f) => f.type === 'monotonic');
  const hasScriptFailure = failures.some((f) => f.type === 'script');
  const hasCoverageIssue = failures.some(
    (f) => f.rule.includes('coverage') || f.message.includes('coverage')
  );

  if (hasCoverageIssue) {
    lines.push('### Coverage Issues');
    lines.push('');
    lines.push('1. Find files with low coverage:');
    lines.push('   ```');
    lines.push('   npx quality-gate-sgd prioritize');
    lines.push('   ```');
    lines.push('');
    lines.push('2. Run tests with coverage to see current state:');
    lines.push('   ```');
    lines.push('   npm run test -- --coverage');
    lines.push('   ```');
    lines.push('');
  }

  if (hasScriptFailure) {
    lines.push('### Script Failures');
    lines.push('');
    lines.push('Run the failing script directly to see errors:');
    lines.push('```');
    lines.push('npm run <script-name>');
    lines.push('```');
    lines.push('');
  }

  if (hasMonotonicFailure && !hasCoverageIssue) {
    lines.push('### Regression Detected');
    lines.push('');
    lines.push(
      'A metric regressed from the baseline. Check the cache for details:'
    );
    lines.push('```');
    lines.push('cat .quality-gate-cache.json | jq');
    lines.push('```');
    lines.push('');
  }

  lines.push('### Re-run Quality Gate');
  lines.push('');
  lines.push('After fixing issues, re-run:');
  lines.push('```');
  lines.push('npx quality-gate-sgd');
  lines.push('```');

  return lines.join('\n');
}

interface RunOptions {
  skipSonarQube: boolean;
}

function parseRunArgs(args: string[]): RunOptions {
  return {
    skipSonarQube:
      args.includes('--docker=no') ||
      args.includes('--no-docker') ||
      args.includes('--no-sonar') ||
      args.includes('--coverage-only'),
  };
}

async function runQualityGate(options: RunOptions = { skipSonarQube: false }): Promise<void> {
  log('Quality Gate SGD v0.1.0');
  log('=======================');

  if (options.skipSonarQube) {
    log('(coverage-only mode - SonarQube skipped)');
  }

  // Load rules
  const rules = loadRules();
  log(`Rules: ${rules.version} - ${rules.description}`);

  // Get cache key (commit hash for clean tree, wip:contentHash for uncommitted changes)
  const { key: cacheKey, isWIP } = getCacheKey();
  if (isWIP) {
    const commitHash = getCurrentCommitHash();
    const contentHashShort = cacheKey.slice(4, 11); // Skip 'wip:' prefix
    log(
      `\nWIP changes on ${commitHash.slice(0, 7)} (content: ${contentHashShort})`
    );
  } else {
    log(`\nCommit: ${cacheKey.slice(0, 7)}`);
  }

  // Load cache and check for valid cached result BEFORE running expensive operations
  const cache = loadCache();
  const existingEntry = getCacheEntry(cache, cacheKey);

  if (existingEntry && isCacheValid(existingEntry, rules)) {
    log(
      `\nUsing cached result from ${new Date(existingEntry.timestamp).toISOString()}`
    );

    if (existingEntry.evaluation.status === 'pass') {
      log('\n✓ Quality gate PASSED (cached)');
      process.exit(0);
    } else {
      // Re-evaluate to get full failure details for guidance
      const baselineEntry = findBaselineEntry(cache, rules, isWIP);
      const reEvalResult = evaluateRules(
        rules,
        existingEntry.metrics,
        baselineEntry
      );

      log('\n✗ Quality gate FAILED (cached)');
      log('\nFailed rules:');
      log(formatFailures(reEvalResult.failedRules));

      // Show top SonarQube issues inline if any sonar-related failure
      const cachedMetrics = existingEntry.metrics;
      const hasSonarFailure = reEvalResult.failedRules.some(
        (f) =>
          f.rule.includes('sonar') ||
          f.rule.includes('blocker') ||
          f.rule.includes('critical') ||
          f.rule.includes('major') ||
          f.rule.includes('minor')
      );
      if (
        hasSonarFailure ||
        (cachedMetrics.sonarqube &&
          cachedMetrics.sonarqube.blocker +
            cachedMetrics.sonarqube.critical +
            cachedMetrics.sonarqube.major +
            cachedMetrics.sonarqube.minor >
            0)
      ) {
        const topIssues = getTopSonarIssues(10);
        if (topIssues.length > 0) {
          log(formatSonarIssues(topIssues));
        }
      }

      log(getRemediationGuidance(reEvalResult.failedRules));
      process.exit(1);
    }
  }

  // No cache hit - run full quality gate
  const config = getConfig();

  // Check SonarQube availability (skip in coverage-only mode)
  if (!options.skipSonarQube) {
    log('\nChecking SonarQube...');
    if (!isSonarqubeAvailable()) {
      log(`ERROR: SonarQube is not running at ${config.sonarqube.url}`);
      log('Start it with: npm run sonar:start');
      log('Or use --coverage-only to skip SonarQube');
      process.exit(1);
    }
    log('  SonarQube is available');

    // Run SonarQube scan to get fresh metrics
    log('\nRunning SonarQube scan...');
    const scanResult = runSonarqubeScan();
    if (!scanResult.success) {
      log('ERROR: SonarQube scan failed');
      if (scanResult.error) {
        log(`  ${scanResult.error}`);
      }
      process.exit(1);
    }
    log('  SonarQube scan completed');
  } else {
    log('\nSkipping SonarQube (coverage-only mode)');
  }

  // Find baseline for monotonic comparison
  const baselineEntry = findBaselineEntry(cache, rules, isWIP);
  if (baselineEntry) {
    log(`\nBaseline: ${new Date(baselineEntry.timestamp).toISOString()}`);
  } else {
    log(
      `\nNo baseline found (${isWIP ? 'no cached HEAD commit' : 'first run or no parent commit'})`
    );
  }

  // Extract metrics
  log('\nExtracting metrics...');
  const requiredScripts = rules.rules.requiredScripts || ['quality'];
  const metrics = extractAllMetrics({
    scriptsToRun: requiredScripts,
    skipSonarQube: options.skipSonarQube,
  });

  // Log extracted metrics
  if (metrics.coverage) {
    const { lambda, unit, union } = metrics.coverage;
    if (lambda) {
      log(
        `  Lambda:  branches=${lambda.branches.toFixed(1)}%, statements=${lambda.statements.toFixed(1)}%`
      );
    }
    if (unit) {
      log(
        `  Unit:    branches=${unit.branches.toFixed(1)}%, statements=${unit.statements.toFixed(1)}%`
      );
    }
    if (union) {
      log(
        `  Union:   branches=${union.branches.toFixed(1)}%, statements=${union.statements.toFixed(1)}%`
      );
    }
  }
  if (metrics.sonarqube) {
    log(
      `  SonarQube: bugs=${metrics.sonarqube.bugs}, vulnerabilities=${metrics.sonarqube.vulnerabilities}, smells=${metrics.sonarqube.codeSmells}`
    );
    log(
      `  Severity:  blocker=${metrics.sonarqube.blocker}, critical=${metrics.sonarqube.critical}, major=${metrics.sonarqube.major}, minor=${metrics.sonarqube.minor}, info=${metrics.sonarqube.info}`
    );
  }
  if (metrics.typescript) {
    log(`  TypeScript: errors=${metrics.typescript.errors}`);
  }
  if (metrics.eslint) {
    log(
      `  ESLint: errors=${metrics.eslint.errors}, warnings=${metrics.eslint.warnings}`
    );
  }
  log(
    `  Scripts: ${Object.entries(metrics.scripts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`
  );

  // Evaluate rules
  log('\nEvaluating rules...');
  const result = evaluateRules(rules, metrics, baselineEntry);

  // Create and save cache entry
  const failedRuleNames = result.failedRules.map((f) => f.rule);
  const entry = createCacheEntry(
    metrics,
    rules,
    result.status,
    failedRuleNames
  );
  setCacheEntry(cache, cacheKey, entry);

  // Prune old entries (keep last 90 days)
  const pruned = pruneOldEntries(cache, 90);
  if (pruned > 0) {
    log(`\nPruned ${pruned} old cache entries`);
  }

  // Save cache
  saveCache(cache);
  log('\nCache updated');

  // Report result
  if (result.status === 'pass') {
    log('\n✓ Quality gate PASSED');
    process.exit(0);
  } else {
    log('\n✗ Quality gate FAILED');
    log('\nFailed rules:');
    log(formatFailures(result.failedRules));

    // Show top SonarQube issues inline if any sonar-related failure
    const hasSonarFailure = result.failedRules.some(
      (f) =>
        f.rule.includes('sonar') ||
        f.rule.includes('blocker') ||
        f.rule.includes('critical') ||
        f.rule.includes('major') ||
        f.rule.includes('minor')
    );
    if (
      hasSonarFailure ||
      (metrics.sonarqube &&
        metrics.sonarqube.blocker +
          metrics.sonarqube.critical +
          metrics.sonarqube.major +
          metrics.sonarqube.minor >
          0)
    ) {
      const topIssues = getTopSonarIssues(10);
      if (topIssues.length > 0) {
        log(formatSonarIssues(topIssues));
      }
    }

    log(getRemediationGuidance(result.failedRules));
    process.exit(1);
  }
}

/**
 * Display trajectory analysis from cache.
 */
function runTrajectoryAnalysis(): void {
  log('Quality Gate SGD - Trajectory Analysis');
  log('======================================\n');

  const cache = loadCache();
  const entryCount = Object.keys(cache.entries).length;

  if (entryCount === 0) {
    log('No cache entries found. Run quality gate at least once first.');
    log('  npx quality-gate-sgd run');
    return;
  }

  log(`Found ${entryCount} cache entries\n`);

  const trajectory = buildTrajectory(cache);
  log(formatTrajectorySummary(trajectory));

  // Show quick sparkline for easy visual
  if (trajectory.points.length > 1) {
    log('\nQuality descent visualization:');
    log(`  ${trajectorySparkline(trajectory)}`);
    log('  (left=oldest, right=newest, taller=better quality)\n');
  }

  // Exit with appropriate code based on convergence
  if (trajectory.convergenceState === 'converged') {
    log('\nStatus: Converged to quality target');
    process.exit(0);
  } else if (trajectory.convergenceState === 'improving') {
    log('\nStatus: Still improving, continue iterations');
    process.exit(0);
  } else if (trajectory.convergenceState === 'oscillating') {
    log('\nStatus: Oscillating - may need different approach');
    process.exit(1);
  } else {
    log('\nStatus: Stagnating - check constraints or increase effort');
    process.exit(1);
  }
}

/**
 * List available dimensions.
 */
function runDimensionsList(args: string[]): void {
  const categoryArg = args.find((a) => a.startsWith('--category='));
  const jsonFlag = args.includes('--json');
  const category = categoryArg?.split('=')[1] as DimensionCategory | undefined;

  if (jsonFlag) {
    const dims = category ? getDimensionsByCategory(category) : getAllDimensions();
    console.log(JSON.stringify(dims, null, 2));
    return;
  }

  log('Quality Gate SGD - Available Dimensions');
  log('=======================================\n');

  if (category) {
    const dims = getDimensionsByCategory(category);
    log(`Category: ${category} (${dims.length} dimensions)\n`);
    log(formatDimensionsTable(dims));
  } else {
    const dims = getAllDimensions();
    log(`Total: ${dims.length} dimensions\n`);

    const categories: DimensionCategory[] = ['coverage', 'errors', 'quality', 'custom'];
    for (const cat of categories) {
      const catDims = getDimensionsByCategory(cat);
      if (catDims.length === 0) continue;

      log(`\n## ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${catDims.length})\n`);
      log(formatDimensionsTable(catDims));
    }
  }

  log('\nUse --category=<name> to filter (coverage, errors, quality, custom)');
  log('Use --json for machine-readable output');
}

/**
 * Compute and display fitness score.
 */
async function runScore(args: string[]): Promise<void> {
  const skipSonarQube = args.includes('--coverage-only') ||
    args.includes('--docker=no') ||
    args.includes('--no-sonar');
  const jsonFlag = args.includes('--json');

  if (!jsonFlag) {
    log('Quality Gate SGD - Fitness Score');
    log('================================\n');

    if (skipSonarQube) {
      log('(coverage-only mode - SonarQube skipped)\n');
    }
  }

  // Extract metrics
  const rules = loadRules();
  const requiredScripts = rules.rules.requiredScripts || ['quality'];
  const metrics = extractAllMetrics({
    scriptsToRun: requiredScripts,
    skipSonarQube,
  });

  // Compute fitness
  const score = computeFitness(metrics);

  if (jsonFlag) {
    console.log(JSON.stringify({
      score,
      metrics,
    }, null, 2));
    return;
  }

  log(`Fitness Score: ${formatFitnessScore(score)}`);
  log('');

  // Show breakdown
  const gradient = computeGradient(metrics);
  log('## Dimension Breakdown\n');
  log(formatGradientTable(gradient));
}

/**
 * Suggest next fixes based on gradient.
 *
 * Supports three granularity levels:
 * - --quick: Dimension-level suggestions (which metric to improve)
 * - (default): File-level targets (which file to fix, with cross-dimension analysis)
 * - --deep: Symbol-level targets (which function/class, most precise)
 */
async function runSuggest(args: string[]): Promise<void> {
  const skipSonarQube = args.includes('--coverage-only') ||
    args.includes('--docker=no') ||
    args.includes('--no-sonar');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;
  const jsonFlag = args.includes('--json');
  const quickMode = args.includes('--quick');
  const deepMode = args.includes('--deep');

  // Determine granularity
  const granularity: TargetGranularity = deepMode ? 'symbol' : 'file';

  if (!jsonFlag) {
    const modeLabel = quickMode ? 'Dimension-Level' : (deepMode ? 'Symbol-Level' : 'File-Level');
    log(`Quality Gate SGD - Suggested Fixes (${modeLabel})`);
    log('='.repeat(50) + '\n');

    if (skipSonarQube) {
      log('(coverage-only mode - SonarQube skipped)\n');
    }
  }

  // Extract metrics for fitness score
  const rules = loadRules();
  const requiredScripts = rules.rules.requiredScripts || ['quality'];
  const metrics = extractAllMetrics({
    scriptsToRun: requiredScripts,
    skipSonarQube,
  });

  // Compute current score
  const currentScore = computeFitness(metrics);

  // Quick mode: dimension-level suggestions only (original behavior)
  if (quickMode) {
    const suggestions = suggestNextFixes(metrics, limit);

    if (jsonFlag) {
      console.log(JSON.stringify({
        mode: 'dimension',
        currentScore,
        suggestions,
      }, null, 2));
      return;
    }

    log(`Current Fitness: ${formatFitnessScore(currentScore)}\n`);

    if (suggestions.length === 0) {
      log('No suggestions - all dimensions are optimal!');
      return;
    }

    log(`## Top ${suggestions.length} Dimension Suggestions\n`);

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      log(`### ${i + 1}. ${s.displayName}`);
      log('');
      log(`   ${s.rationale}`);
      log(`   Current: ${typeof s.currentValue === 'number' && s.currentValue < 1 ? s.currentValue : s.currentValue.toFixed?.(1) ?? s.currentValue}${s.dimension.includes('coverage') ? '%' : ''}`);
      log(`   Target:  ${typeof s.targetValue === 'number' && s.targetValue < 1 ? s.targetValue : s.targetValue.toFixed?.(1) ?? s.targetValue}${s.dimension.includes('coverage') ? '%' : ''}`);
      log(`   Expected gain: +${s.estimatedGain.toFixed(3)}`);
      log('');
    }
    return;
  }

  // File-level or symbol-level: extract located issues and aggregate
  if (!jsonFlag) {
    log('Extracting located issues...\n');
  }

  const extractedIssues = extractLocatedIssues({
    skipSonarQube,
    skipTypescript: false,
    skipEslint: false,
  });

  if (!jsonFlag) {
    log(`Found ${extractedIssues.totalCount} issues:`);
    log(`  Coverage: ${extractedIssues.summary.coverage} uncovered branches/functions`);
    log(`  TypeScript: ${extractedIssues.summary.typescript} errors`);
    log(`  ESLint: ${extractedIssues.summary.eslint} issues`);
    log(`  SonarQube: ${extractedIssues.summary.sonarqube} issues\n`);
  }

  // Aggregate to optimization targets
  const targets = aggregateToTargets(extractedIssues, {
    granularity,
    limit,
  });

  if (jsonFlag) {
    console.log(JSON.stringify({
      mode: granularity,
      currentScore,
      ...formatTargetsForJson(targets),
    }, null, 2));
    return;
  }

  log(`Current Fitness: ${formatFitnessScore(currentScore)}\n`);

  if (targets.length === 0) {
    log('No optimization targets found. All metrics are optimal!');
    return;
  }

  // Format and display targets
  const title = deepMode
    ? `Top ${targets.length} Symbol-Level Optimization Targets`
    : `Top ${targets.length} File-Level Optimization Targets`;

  log(formatTargetList(targets, { title, showTotal: true }));
}

// =============================================================================
// Interactive Input Helpers
// =============================================================================

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false,
  });
}

async function askQuestion(prompt: string, defaultValue?: string): Promise<string> {
  const rl = createReadlineInterface();
  const displayDefault = defaultValue ? ` [${defaultValue}]` : '';

  return new Promise((resolve) => {
    process.stderr.write(`${prompt}${displayDefault}: `);
    rl.once('line', (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function askYesNo(prompt: string, defaultYes = true): Promise<boolean> {
  const answer = await askQuestion(prompt, defaultYes ? 'Y/n' : 'y/N');
  if (defaultYes) {
    return answer.toLowerCase() !== 'n';
  }
  return answer.toLowerCase() === 'y';
}

// =============================================================================
// Add Dimension Command
// =============================================================================

/**
 * Interactive command to add a custom dimension.
 */
async function runAddDimension(args: string[]): Promise<void> {
  log('Quality Gate SGD - Add Custom Dimension');
  log('======================================\n');

  // Parse args for non-interactive mode
  const commandArg = args.find(a => !a.startsWith('-'));
  const skipRun = args.includes('--no-run');
  const skipConfirm = args.includes('-y') || args.includes('--yes');

  // Get command
  let command = commandArg;
  if (!command) {
    command = await askQuestion('Command or npm script that produces the metric');
    if (!command) {
      log('Error: Command is required');
      process.exit(1);
    }
  }

  // Get optional hint
  const hint = await askQuestion('What does this metric measure? (optional)');

  // Ask to run command
  let runNow = !skipRun;
  if (!skipRun && !skipConfirm) {
    runNow = await askYesNo('Run command now to capture sample output?', true);
  }

  log('\nAnalyzing...');

  // Build dimension
  const result = await buildDimension({
    command,
    hint: hint || undefined,
    runNow,
    fetchDocs: true,
    timeout: 60000,
  });

  if (result.error) {
    log(`\nError: ${result.error}`);
    if (result.rawResponse) {
      log('\nRaw LLM response:');
      log(result.rawResponse.slice(0, 1000));
    }
    process.exit(1);
  }

  if (!result.config) {
    log('\nError: No config generated');
    process.exit(1);
  }

  log('\nGenerated dimension config:\n');
  log(JSON.stringify(result.config, null, 2));

  // Confirm and save
  let shouldSave = skipConfirm;
  if (!skipConfirm) {
    shouldSave = await askYesNo('\nAdd to quality-gate.config.ts?', true);
  }

  if (shouldSave) {
    try {
      appendToConfigFile(result.config);
      log('\n✓ Dimension added to quality-gate.config.ts');
      log('\nNext steps:');
      log('  1. Review the generated config in quality-gate.config.ts');
      log('  2. Run: npx quality-gate-sgd score --coverage-only');
      log('     to see the new dimension in action');
    } catch (error) {
      log(`\nError saving config: ${error}`);
      process.exit(1);
    }
  } else {
    log('\nConfig not saved. You can manually add it to quality-gate.config.ts');
  }
}

function showHelp(): void {
  console.log(`
quality-gate-sgd - Deterministic quality gates for LLM agents

USAGE:
  npx quality-gate-sgd [command] [options]

COMMANDS:
  run           Run the quality gate (default if no command specified)
  init          Initialize quality gates with LLM-guided configuration
  trajectory    Analyze quality descent trajectory from cache
  list-issues   List SonarQube issues with filtering
  dimensions    List available metric dimensions
  score         Compute current fitness score (0-100)
  suggest       Get recommended next fixes based on gradient
  add-dimension Add a custom dimension using LLM analysis
  mcp           Start MCP server for Claude integration
  help          Show this help message

OPTIONS for 'init':
  -y, --yes           Accept all defaults (non-interactive)
  --docker=no         Skip SonarQube, coverage-only mode
  -v, --verbose       Show detailed analysis

OPTIONS for 'run':
  --coverage-only     Skip SonarQube, only use coverage/TS/ESLint metrics
  --docker=no         Same as --coverage-only (no Docker needed)

OPTIONS for 'trajectory':
  (No options - analyzes existing cache data)

OPTIONS for 'list-issues':
  --severity=LEVEL    Filter by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
  --limit=N           Maximum issues to show (default: 100)
  --rule=RULE         Filter by rule ID
  --file=PATH         Filter by file path pattern
  --summary, -s       Show summary only

OPTIONS for 'dimensions':
  --category=NAME     Filter by category (coverage, errors, quality, custom)
  --json              Output as JSON for programmatic use

OPTIONS for 'score':
  --coverage-only     Skip SonarQube, only use coverage/TS/ESLint metrics
  --json              Output as JSON for programmatic use

OPTIONS for 'suggest':
  --quick             Dimension-level suggestions only (fastest, least specific)
  --deep              Symbol-level targets with cross-dimension analysis (most specific)
  (default)           File-level targets - balances specificity and token cost
  --coverage-only     Skip SonarQube, only use coverage/TS/ESLint metrics
  --limit=N           Number of suggestions to show (default: 5)
  --json              Output as JSON for programmatic use

OPTIONS for 'add-dimension':
  <command>           Command or script to analyze (can be interactive if omitted)
  --no-run            Skip running the command (use if you have sample output)
  -y, --yes           Skip confirmation prompts

OPTIONS for 'mcp':
  (No options - starts stdio-based MCP server for Claude integration)

MCP TOOLS:
  quality_gate_run       Run quality gate, return pass/fail + metrics
  quality_gate_score     Get fitness score (0-100)
  quality_gate_suggest   Get recommended fixes by gradient
  quality_gate_trajectory Get quality improvement history
  quality_gate_explain   Explain dimension or concept

MCP RESOURCES:
  quality://dimensions       List all available dimensions
  quality://rules            Current rules.json configuration
  quality://fitness          Fitness weights and config
  quality://theory/convergence Convergence theorem docs
  quality://theory/geometry  Quality space geometry docs

EXAMPLES:
  npx quality-gate-sgd init                         # Interactive setup
  npx quality-gate-sgd init -y                      # Quick setup with defaults
  npx quality-gate-sgd init --docker=no             # Coverage-only configuration
  npx quality-gate-sgd                              # Run quality gate
  npx quality-gate-sgd run                          # Same as above
  npx quality-gate-sgd --coverage-only              # Run without SonarQube
  npx quality-gate-sgd trajectory                   # Analyze descent
  npx quality-gate-sgd list-issues --severity=MAJOR
  npx quality-gate-sgd list-issues -s               # Summary view
  npx quality-gate-sgd dimensions                   # List all dimensions
  npx quality-gate-sgd dimensions --category=coverage
  npx quality-gate-sgd score --coverage-only        # Get fitness score
  npx quality-gate-sgd suggest                      # File-level targets (default)
  npx quality-gate-sgd suggest --quick              # Dimension-level only (fast)
  npx quality-gate-sgd suggest --deep --limit=3     # Symbol-level targets (precise)
  npx quality-gate-sgd add-dimension                # Interactive dimension builder
  npx quality-gate-sgd add-dimension "npx madge --circular --json src/" -y
  npx quality-gate-sgd mcp                          # Start MCP server for Claude

SGD THEORY:
  This tool creates "gradient descent-like" behavior from stochastic LLM agents
  by providing deterministic quality feedback. The trajectory command shows
  how quality has improved over iterations.

  DISCRETE DIFFERENTIABILITY:
  The 'suggest' command provides target-space gradients: ∇Q = [∂Q/∂target₁, ...]
  where each target is a (file, symbol) tuple. This enables "discrete SGD" -
  we compute expected ΔQ for each enumerable fix. One target may address
  MULTIPLE dimensions (coverage + errors + smells), making it more valuable
  than fixing issues in isolation.

CONFIGURATION:
  Run 'npx quality-gate-sgd init' for guided setup, or create a rules.json file
  manually. See templates/rules.template.json for an example.

ENVIRONMENT VARIABLES:
  SONARQUBE_URL           SonarQube server URL (default: http://localhost:9000)
  SONARQUBE_PROJECT_KEY   Project key (auto-detected from sonar-project.properties)
  QUALITY_RULES_FILE      Path to rules.json (default: rules.json)
  QUALITY_CODE_PATHSPECS  Paths to include in content hashing (default: src/,tests/,scripts/)
  ANTHROPIC_API_KEY       API key for LLM suggestions (optional, for init)

For more information, see: https://github.com/your-org/quality-gate-sgd
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  switch (command) {
    case 'run': {
      const runOptions = parseRunArgs(args.slice(1));
      await runQualityGate(runOptions);
      break;
    }

    case 'init':
      await runInit(args.slice(1));
      break;

    case 'trajectory':
      runTrajectoryAnalysis();
      break;

    case 'list-issues':
      await listIssues(args.slice(1));
      break;

    case 'dimensions':
      runDimensionsList(args.slice(1));
      break;

    case 'score':
      await runScore(args.slice(1));
      break;

    case 'suggest':
      await runSuggest(args.slice(1));
      break;

    case 'add-dimension':
      await runAddDimension(args.slice(1));
      break;

    case 'mcp':
      await runMcpServer();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      // If first arg doesn't look like a command, treat it as 'run' args
      if (command.startsWith('--') || command.startsWith('-')) {
        const runOptions = parseRunArgs(args);
        await runQualityGate(runOptions);
      } else {
        console.error(`Unknown command: ${command}`);
        console.error('Run "npx quality-gate-sgd help" for usage information.');
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(`\nError: ${err}`);
  process.exit(1);
});
