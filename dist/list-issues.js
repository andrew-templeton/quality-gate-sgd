#!/usr/bin/env npx tsx
/**
 * List SonarQube Issues
 * =====================
 * Fetches and displays issues from SonarQube with filtering options.
 *
 * Usage:
 *   npx quality-gate-sgd list-issues [options]
 *
 * Options:
 *   --severity=LEVEL    Filter by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
 *   --limit=N           Maximum number of issues to show (default: 100)
 *   --rule=RULE         Filter by rule ID (e.g., typescript:S3358)
 *   --file=PATH         Filter by file path pattern
 *   --summary, -s       Show only summary by rule (no file details)
 *
 * Examples:
 *   npx quality-gate-sgd list-issues                           # All issues
 *   npx quality-gate-sgd list-issues --severity=MINOR -s       # Minor issues summary only
 *   npx quality-gate-sgd list-issues --severity=MAJOR          # Major issues with details
 *   npx quality-gate-sgd list-issues --rule=typescript:S1874   # Specific rule
 */
import { getConfig, getSonarAuthToken } from './config.js';
function parseArgs(args) {
    const result = { limit: 100, summary: false };
    for (const arg of args) {
        if (arg.startsWith('--severity=')) {
            result.severity = arg.split('=')[1].toUpperCase();
        }
        else if (arg.startsWith('--limit=')) {
            result.limit = Number.parseInt(arg.split('=')[1], 10);
        }
        else if (arg.startsWith('--rule=')) {
            result.rule = arg.split('=')[1];
        }
        else if (arg.startsWith('--file=')) {
            result.file = arg.split('=')[1];
        }
        else if (arg === '--summary' || arg === '-s') {
            result.summary = true;
        }
        else if (!arg.startsWith('--')) {
            // Support legacy positional args for backwards compatibility
            if (!result.severity && /^[A-Z]+$/.test(arg)) {
                result.severity = arg.toUpperCase();
            }
            else if (!Number.isNaN(Number.parseInt(arg, 10))) {
                result.limit = Number.parseInt(arg, 10);
            }
        }
    }
    return result;
}
async function fetchIssues(options) {
    const config = getConfig();
    const token = getSonarAuthToken();
    const auth = Buffer.from(`${token}:`).toString('base64');
    const params = new URLSearchParams({
        componentKeys: config.sonarqube.projectKey,
        ps: String(Math.min(options.limit, 500)), // SonarQube max is 500
        resolved: 'false',
    });
    if (options.severity) {
        params.set('severities', options.severity);
    }
    if (options.rule) {
        params.set('rules', options.rule);
    }
    const url = `${config.sonarqube.url}/api/issues/search?${params}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Basic ${auth}`,
        },
    });
    if (!response.ok) {
        throw new Error(`SonarQube API error: ${response.status}`);
    }
    return (await response.json());
}
function formatComponent(component) {
    const config = getConfig();
    // Remove project prefix: "my-project:src/foo.ts" -> "src/foo.ts"
    return component.replace(`${config.sonarqube.projectKey}:`, '');
}
function groupByFile(issues, fileFilter) {
    const grouped = new Map();
    for (const issue of issues) {
        const file = formatComponent(issue.component);
        // Apply file filter if provided
        if (fileFilter && !file.includes(fileFilter)) {
            continue;
        }
        if (!grouped.has(file)) {
            grouped.set(file, []);
        }
        grouped.get(file).push({
            line: issue.line,
            message: issue.message,
            rule: issue.rule,
        });
    }
    // Sort by file path
    return new Map([...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}
export async function listIssues(args = []) {
    // Show help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: npx quality-gate-sgd list-issues [options]

Options:
  --severity=LEVEL    Filter by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
  --limit=N           Maximum number of issues to show (default: 100)
  --rule=RULE         Filter by rule ID (e.g., typescript:S3358)
  --file=PATH         Filter by file path pattern
  --summary, -s       Show only summary by rule (no file details)
  --help, -h          Show this help message

Examples:
  npx quality-gate-sgd list-issues                           # All issues
  npx quality-gate-sgd list-issues --severity=MAJOR          # Major issues only
  npx quality-gate-sgd list-issues --severity=MINOR -s       # Minor issues summary
  npx quality-gate-sgd list-issues --rule=typescript:S3358
`);
        return;
    }
    const options = parseArgs(args);
    const filters = [
        options.severity ? `severity=${options.severity}` : null,
        options.rule ? `rule=${options.rule}` : null,
        options.file ? `file=${options.file}` : null,
    ]
        .filter(Boolean)
        .join(', ');
    console.log(`Fetching issues from SonarQube${filters ? ` (${filters})` : ''}...`);
    console.log();
    try {
        const response = await fetchIssues(options);
        const grouped = groupByFile(response.issues, options.file);
        const displayedCount = [...grouped.values()].reduce((sum, issues) => sum + issues.length, 0);
        console.log(`Total: ${response.total} issues`);
        console.log(`Showing: ${displayedCount}`);
        console.log('='.repeat(60));
        // Build rule summary first (used in both modes)
        const ruleCount = new Map();
        for (const issue of response.issues) {
            const file = formatComponent(issue.component);
            if (options.file && !file.includes(options.file))
                continue;
            const count = ruleCount.get(issue.rule) || 0;
            ruleCount.set(issue.rule, count + 1);
        }
        const sortedRules = [...ruleCount.entries()].sort((a, b) => b[1] - a[1]);
        if (options.summary) {
            // Summary mode: just show rules with counts
            console.log('\nIssues by rule:');
            for (const [rule, count] of sortedRules) {
                console.log(`  ${String(count).padStart(4)} ${rule}`);
            }
            console.log('\nTo see details for a specific rule:');
            console.log(`  npx quality-gate-sgd list-issues --rule=typescript:SXXXX`);
        }
        else {
            // Detailed mode: show file-by-file breakdown
            for (const [file, issues] of grouped) {
                console.log(`\n${file} (${issues.length} issues):`);
                for (const issue of issues) {
                    const lineInfo = issue.line ? `:${issue.line}` : '';
                    console.log(`  ${lineInfo.padEnd(6)} ${issue.message}`);
                }
            }
            // Summary by rule at the end
            console.log('\n' + '='.repeat(60));
            console.log('Top rules:');
            for (const [rule, count] of sortedRules.slice(0, 10)) {
                console.log(`  ${String(count).padStart(4)} ${rule}`);
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
        console.error('\nMake sure SonarQube is running: npm run sonar:start');
        process.exit(1);
    }
}
// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    listIssues(process.argv.slice(2));
}
//# sourceMappingURL=list-issues.js.map