/**
 * Located Issue Extraction
 * ========================
 * Extracts issues with location information from all quality sources.
 *
 * Unlike the metrics extraction (which aggregates to counts), this preserves
 * the file:line:column information so we can compute target-space gradients.
 */

import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { getConfig, getSonarAuthToken } from '../config.js';
import type {
  LocatedIssue,
  ExtractedIssues,
  ExtractLocatedIssuesOptions,
  IssueSeverity,
} from './types.js';
import { mapLocationToSymbol } from '../symbols/mapper.js';
import type { SymbolTable, CodeSymbol } from '../symbols/types.js';

// =============================================================================
// Coverage Issue Extraction
// =============================================================================

/**
 * Istanbul coverage-final.json structure
 */
interface IstanbulCoverage {
  [filePath: string]: IstanbulFileCoverage;
}

interface IstanbulFileCoverage {
  path: string;
  statementMap: Record<string, IstanbulLocation>;
  fnMap: Record<string, IstanbulFunction>;
  branchMap: Record<string, IstanbulBranch>;
  s: Record<string, number>;  // statement hit counts
  f: Record<string, number>;  // function hit counts
  b: Record<string, number[]>; // branch hit counts per branch
}

interface IstanbulLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface IstanbulFunction {
  name: string;
  decl: IstanbulLocation;
  loc: IstanbulLocation;
}

interface IstanbulBranch {
  type: string;
  loc: IstanbulLocation;
  locations: IstanbulLocation[];
}

/**
 * coverage-summary.json structure
 */
interface CoverageSummaryEntry {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

interface CoverageSummaryJson {
  total?: CoverageSummaryEntry;
  [filePath: string]: CoverageSummaryEntry | undefined;
}

function shouldSkipCoverageFile(filePath: string): boolean {
  return (
    filePath.includes('node_modules') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  );
}

function extractCoverageIssuesFromSummary(
  summaryPath: string,
  dimensionPrefix: 'coverage.unit' | 'coverage.lambda'
): LocatedIssue[] {
  if (!existsSync(summaryPath)) return [];

  try {
    const data = JSON.parse(readFileSync(summaryPath, 'utf-8')) as CoverageSummaryJson;
    const issues: LocatedIssue[] = [];

    for (const [filePath, entry] of Object.entries(data)) {
      if (filePath === 'total' || !entry) continue;
      if (shouldSkipCoverageFile(filePath)) continue;

      const branchTotal = entry.branches.total ?? 0;
      const branchCovered = entry.branches.covered ?? 0;
      const branchMissing = Math.max(branchTotal - branchCovered, 0);

      if (branchTotal > 0 && branchMissing > 0) {
        const delta = branchMissing / branchTotal;
        issues.push({
          file: filePath,
          source: 'coverage',
          dimension: `${dimensionPrefix}.branches`,
          code: 'uncovered-branches',
          impact: {
            dimension: `${dimensionPrefix}.branches`,
            delta,
            direction: 'higher-better',
          },
          message: `Low branch coverage (${entry.branches.pct.toFixed(1)}%)`,
          context: `${branchMissing}/${branchTotal} branches uncovered`,
        });
      }

      const fnTotal = entry.functions.total ?? 0;
      const fnCovered = entry.functions.covered ?? 0;
      const fnMissing = Math.max(fnTotal - fnCovered, 0);

      if (fnTotal > 0 && fnMissing > 0) {
        const delta = fnMissing / fnTotal;
        issues.push({
          file: filePath,
          source: 'coverage',
          dimension: `${dimensionPrefix}.functions`,
          code: 'uncovered-functions',
          impact: {
            dimension: `${dimensionPrefix}.functions`,
            delta,
            direction: 'higher-better',
          },
          message: `Low function coverage (${entry.functions.pct.toFixed(1)}%)`,
          context: `${fnMissing}/${fnTotal} functions uncovered`,
        });
      }
    }

    return issues;
  } catch (error) {
    console.error(`Warning: Could not parse ${summaryPath}: ${error}`);
    return [];
  }
}

/**
 * Extract uncovered branches and lines from coverage-final.json.
 *
 * Each uncovered branch becomes a LocatedIssue with estimated coverage impact.
 */
export function extractCoverageIssues(coverageDir?: string): LocatedIssue[] {
  const config = getConfig();
  const issues: LocatedIssue[] = [];
  let foundCoverageFinal = false;

  // Try unit coverage first, then lambda
  const coveragePaths = [
    path.join(config.projectRoot, coverageDir ?? config.coverage.unitDir, 'coverage-final.json'),
    path.join(config.projectRoot, config.coverage.lambdaDir, 'coverage-final.json'),
  ];

  for (const coveragePath of coveragePaths) {
    if (!existsSync(coveragePath)) continue;
    foundCoverageFinal = true;

    try {
      const data = JSON.parse(readFileSync(coveragePath, 'utf-8')) as IstanbulCoverage;

      for (const [filePath, fileCoverage] of Object.entries(data)) {
        // Skip node_modules and test files
        if (shouldSkipCoverageFile(filePath)) {
          continue;
        }

        // Count total branches for this file to estimate per-branch impact
        const totalBranches = Object.values(fileCoverage.branchMap).reduce(
          (sum, branch) => sum + branch.locations.length,
          0
        );

        // Extract uncovered branches
        for (const [branchId, branch] of Object.entries(fileCoverage.branchMap)) {
          const hitCounts = fileCoverage.b[branchId] || [];

          for (let i = 0; i < branch.locations.length; i++) {
            const loc = branch.locations[i];
            const hits = hitCounts[i] ?? 0;

            if (hits === 0) {
              // Estimate impact: each branch is roughly equal fraction of file's branch coverage
              // If file has 10 branches and 5 uncovered, covering 1 branch adds ~10% to file's coverage
              const estimatedImpact = totalBranches > 0 ? 100 / totalBranches : 1;

              issues.push({
                file: filePath,
                line: loc.start.line,
                column: loc.start.column,
                endLine: loc.end.line,
                endColumn: loc.end.column,
                source: 'coverage',
                dimension: 'coverage.unit.branches',
                code: `branch-${branch.type}`,
                impact: {
                  dimension: 'coverage.unit.branches',
                  delta: estimatedImpact / 100, // Fractional coverage gain
                  direction: 'higher-better',
                },
                message: `Uncovered ${branch.type} branch`,
                context: `Branch ${branchId}[${i}] at line ${loc.start.line}`,
              });
            }
          }
        }

        // Extract uncovered functions
        for (const [fnId, fn] of Object.entries(fileCoverage.fnMap)) {
          const hits = fileCoverage.f[fnId] ?? 0;

          if (hits === 0) {
            issues.push({
              file: filePath,
              line: fn.loc.start.line,
              column: fn.loc.start.column,
              endLine: fn.loc.end.line,
              endColumn: fn.loc.end.column,
              symbol: fn.name || `anonymous_${fnId}`,
              source: 'coverage',
              dimension: 'coverage.unit.functions',
              code: 'uncovered-function',
              impact: {
                dimension: 'coverage.unit.functions',
                delta: 0.5, // Rough estimate: covering a function helps
                direction: 'higher-better',
              },
              message: `Uncovered function: ${fn.name || 'anonymous'}`,
              context: `Function at line ${fn.loc.start.line}`,
            });
          }
        }
      }
    } catch (error) {
      // Silently skip if coverage file is malformed
      console.error(`Warning: Could not parse ${coveragePath}: ${error}`);
    }
  }

  // Fallback: use coverage-summary.json when coverage-final.json is missing
  if (issues.length === 0) {
    const summaryPaths: Array<{ path: string; prefix: 'coverage.unit' | 'coverage.lambda' }> = [
      {
        path: path.join(
          config.projectRoot,
          coverageDir ?? config.coverage.unitDir,
          config.coverage.summaryFile
        ),
        prefix: 'coverage.unit',
      },
      {
        path: path.join(
          config.projectRoot,
          config.coverage.lambdaDir,
          config.coverage.summaryFile
        ),
        prefix: 'coverage.lambda',
      },
    ];

    for (const summary of summaryPaths) {
      const summaryIssues = extractCoverageIssuesFromSummary(summary.path, summary.prefix);
      if (summaryIssues.length > 0 && foundCoverageFinal) {
        console.error(`Warning: Using ${config.coverage.summaryFile} fallback for ${summary.prefix} coverage`);
      }
      issues.push(...summaryIssues);
    }
  }

  return issues;
}

// =============================================================================
// TypeScript Issue Extraction
// =============================================================================

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

function parseTypescriptOutput(output: string): TypeScriptError[] {
  const errors: TypeScriptError[] = [];
  // Match: file(line,col): error TSxxxx: message
  const errorRegex = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5],
    });
  }

  return errors;
}

/**
 * Extract TypeScript errors with location information.
 */
export function extractTypescriptIssues(): LocatedIssue[] {
  const config = getConfig();
  const result = spawnSync('npm', ['run', 'type-check'], {
    cwd: config.projectRoot,
    encoding: 'utf-8',
    shell: true,
    timeout: 60000,
  });

  const output = (result.stdout || '') + (result.stderr || '');
  const errors = parseTypescriptOutput(output);

  return errors.map((err): LocatedIssue => ({
    file: err.file,
    line: err.line,
    column: err.column,
    source: 'typescript',
    dimension: 'typescript.errors',
    code: err.code,
    impact: {
      dimension: 'typescript.errors',
      delta: -1, // Fixing one error reduces count by 1
      direction: 'lower-better',
    },
    message: err.message,
    context: `${err.code}: ${err.message}`,
  }));
}

// =============================================================================
// ESLint Issue Extraction
// =============================================================================

interface EslintMessage {
  ruleId: string | null;
  severity: number; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface EslintFileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: EslintMessage[];
}

/**
 * Extract ESLint issues with location information.
 */
export function extractEslintIssues(): LocatedIssue[] {
  const config = getConfig();
  const result = spawnSync('npx', ['eslint', '--format', 'json', 'src/'], {
    cwd: config.projectRoot,
    encoding: 'utf-8',
    shell: true,
    timeout: 120000,
  });

  const issues: LocatedIssue[] = [];

  try {
    const output = result.stdout || '[]';
    const results = JSON.parse(output) as EslintFileResult[];

    for (const fileResult of results) {
      for (const msg of fileResult.messages) {
        const isError = msg.severity === 2;
        const dimension = isError ? 'eslint.errors' : 'eslint.warnings';

        issues.push({
          file: fileResult.filePath,
          line: msg.line,
          column: msg.column,
          endLine: msg.endLine,
          endColumn: msg.endColumn,
          source: 'eslint',
          dimension,
          code: msg.ruleId || 'unknown',
          severity: isError ? 'major' : 'minor',
          impact: {
            dimension,
            delta: -1, // Fixing one issue reduces count by 1
            direction: 'lower-better',
          },
          message: msg.message,
          context: msg.ruleId ? `Rule: ${msg.ruleId}` : undefined,
        });
      }
    }
  } catch {
    // If parsing fails, return empty
  }

  return issues;
}

// =============================================================================
// SonarQube Issue Extraction
// =============================================================================

interface SonarIssue {
  key: string;
  component: string;
  line?: number;
  message: string;
  severity: string;
  type: string;
  rule: string;
  effort?: string;
  tags?: string[];
}

interface SonarResponse {
  total: number;
  issues: SonarIssue[];
}

function mapSonarSeverity(severity: string): IssueSeverity {
  switch (severity.toUpperCase()) {
    case 'BLOCKER': return 'blocker';
    case 'CRITICAL': return 'critical';
    case 'MAJOR': return 'major';
    case 'MINOR': return 'minor';
    default: return 'info';
  }
}

function mapSonarTypeToDimension(type: string): string {
  switch (type.toUpperCase()) {
    case 'BUG': return 'sonarqube.bugs';
    case 'VULNERABILITY': return 'sonarqube.vulnerabilities';
    case 'CODE_SMELL': return 'sonarqube.codeSmells';
    default: return 'sonarqube.codeSmells';
  }
}

/**
 * Extract SonarQube issues with location information.
 */
export function extractSonarqubeIssues(): LocatedIssue[] {
  const config = getConfig();
  const token = getSonarAuthToken();

  if (!token) {
    return [];
  }

  const issues: LocatedIssue[] = [];

  try {
    // Fetch all unresolved issues (paginated)
    let page = 1;
    const pageSize = 500;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        componentKeys: config.sonarqube.projectKey,
        ps: String(pageSize),
        p: String(page),
        resolved: 'false',
      });

      const result = spawnSync('curl', [
        '-s',
        '-u', `${token}:`,
        `${config.sonarqube.url}/api/issues/search?${params}`,
      ], {
        encoding: 'utf-8',
        timeout: 30000,
      });

      if (result.status !== 0 || !result.stdout) {
        break;
      }

      const response = JSON.parse(result.stdout) as SonarResponse;

      for (const issue of response.issues) {
        // Extract file path from component (format: projectKey:path/to/file.ts)
        const filePath = issue.component.replace(`${config.sonarqube.projectKey}:`, '');
        const dimension = mapSonarTypeToDimension(issue.type);
        const severity = mapSonarSeverity(issue.severity);

        issues.push({
          file: filePath,
          line: issue.line,
          source: 'sonarqube',
          dimension,
          code: issue.rule,
          severity,
          impact: {
            dimension,
            delta: -1, // Fixing one issue reduces count by 1
            direction: 'lower-better',
          },
          message: issue.message,
          context: `Rule: ${issue.rule}, Type: ${issue.type}`,
        });
      }

      // Check if there are more pages
      const totalFetched = page * pageSize;
      hasMore = totalFetched < response.total && response.issues.length === pageSize;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 10) break;
    }
  } catch {
    // If fetching fails, return empty
  }

  return issues;
}

// =============================================================================
// Symbol Enrichment
// =============================================================================

/**
 * Enrich issues with symbol information from a symbol table.
 *
 * For each issue:
 * - If it has a line number, maps to the containing symbol (precise)
 * - If no line number (file-level issues like coverage-summary), maps to
 *   the file's most significant symbol (largest by SLOC)
 *
 * This enables cross-axis analysis by mapping all issues to a unified symbol graph.
 */
function enrichIssuesWithSymbols(
  issues: LocatedIssue[],
  symbolTable: SymbolTable
): void {
  // Cache file-level symbol lookups (for file-level issues without line numbers)
  const filePrimarySymbol = new Map<string, CodeSymbol | null>();

  const findPrimarySymbolForFile = (file: string): CodeSymbol | null => {
    if (filePrimarySymbol.has(file)) {
      return filePrimarySymbol.get(file) ?? null;
    }

    // Get all symbols in file
    const fileSymbols = symbolTable.byFile.get(file);
    if (!fileSymbols || fileSymbols.length === 0) {
      // Try matching with different path formats
      for (const [tablePath, symbols] of symbolTable.byFile) {
        if (tablePath.endsWith(file) || file.endsWith(tablePath) ||
            tablePath.includes(file) || file.includes(tablePath)) {
          if (symbols.length > 0) {
            // Find largest top-level symbol by SLOC
            const topLevel = symbols.filter(s => !s.parent);
            const primary = topLevel.length > 0
              ? topLevel.reduce((a, b) => a.sloc > b.sloc ? a : b)
              : symbols.reduce((a, b) => a.sloc > b.sloc ? a : b);
            filePrimarySymbol.set(file, primary);
            return primary;
          }
        }
      }
      filePrimarySymbol.set(file, null);
      return null;
    }

    // Find largest top-level symbol by SLOC
    const topLevel = fileSymbols.filter(s => !s.parent);
    const primary = topLevel.length > 0
      ? topLevel.reduce((a, b) => a.sloc > b.sloc ? a : b)
      : fileSymbols.reduce((a, b) => a.sloc > b.sloc ? a : b);

    filePrimarySymbol.set(file, primary);
    return primary;
  };

  for (const issue of issues) {
    if (issue.line !== undefined) {
      // Line-level: map to containing symbol (precise)
      const symbol = mapLocationToSymbol(symbolTable, issue.file, issue.line, issue.column);
      if (symbol) {
        issue.symbol = issue.symbol ?? symbol.qualifiedName;
        issue.symbolId = symbol.id;
      }
    } else {
      // File-level: map to primary symbol in file
      const primary = findPrimarySymbolForFile(issue.file);
      if (primary) {
        issue.symbol = issue.symbol ?? primary.qualifiedName;
        issue.symbolId = primary.id;
      }
    }
  }
}

// =============================================================================
// Combined Extraction
// =============================================================================

/**
 * Extract located issues from all sources.
 *
 * This is the main entry point for Phase 2 of the location-aware targets system.
 *
 * When a symbolTable is provided in options, issues will be enriched with
 * symbol information for unified cross-axis analysis.
 */
export function extractLocatedIssues(
  options: ExtractLocatedIssuesOptions = {}
): ExtractedIssues {
  const coverage = extractCoverageIssues(options.coverageDir);
  const typescript = options.skipTypescript ? [] : extractTypescriptIssues();
  const eslint = options.skipEslint ? [] : extractEslintIssues();
  const sonarqube = options.skipSonarQube ? [] : extractSonarqubeIssues();

  // Enrich issues with symbol information if symbol table provided
  if (options.symbolTable) {
    enrichIssuesWithSymbols(coverage, options.symbolTable);
    enrichIssuesWithSymbols(typescript, options.symbolTable);
    enrichIssuesWithSymbols(eslint, options.symbolTable);
    enrichIssuesWithSymbols(sonarqube, options.symbolTable);
  }

  return {
    coverage,
    typescript,
    eslint,
    sonarqube,
    totalCount: coverage.length + typescript.length + eslint.length + sonarqube.length,
    summary: {
      coverage: coverage.length,
      typescript: typescript.length,
      eslint: eslint.length,
      sonarqube: sonarqube.length,
    },
  };
}
