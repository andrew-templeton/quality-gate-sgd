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

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { getValidPaths } from './registry.js';
import type { CustomDimensionConfig } from './custom.js';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Package Documentation Fetching
// =============================================================================

/**
 * Try to extract package name from a command.
 * Handles various command formats:
 * - npx <package> ...
 * - npm run <script> (would need package.json lookup)
 * - node_modules/.bin/<package> ...
 */
function extractPackageName(command: string): string | undefined {
  // npx <package>
  const npxMatch = command.match(/^npx\s+([^\s@]+)/);
  if (npxMatch) return npxMatch[1];

  // node_modules/.bin/<package>
  const binMatch = command.match(/node_modules\/\.bin\/([^\s]+)/);
  if (binMatch) return binMatch[1];

  // Common tool names that might appear directly
  const knownTools = [
    'plato', 'complexity-report', 'madge', 'depcheck', 'bundlesize',
    'size-limit', 'lighthouse', 'jscpd', 'eslint-nibble', 'tslint',
    'stylelint', 'audit-ci', 'snyk', 'nsp', 'retire',
  ];

  for (const tool of knownTools) {
    if (command.includes(tool)) return tool;
  }

  return undefined;
}

/**
 * Fetch README from npm registry for a package.
 */
async function fetchPackageDocs(packageName: string): Promise<string | undefined> {
  try {
    const result = execSync(
      `npm view ${packageName} readme 2>/dev/null | head -200`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Run a command and capture its output.
 */
function runCommand(command: string, timeout = 30000): { output: string; exitCode: number } {
  try {
    // Use shell to handle pipes, etc.
    const result = spawnSync('sh', ['-c', command], {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = (result.stdout || '') + (result.stderr || '');
    return {
      output: output.slice(0, 10000), // Limit to 10KB for LLM context
      exitCode: result.status ?? -1,
    };
  } catch (error) {
    return {
      output: String(error),
      exitCode: -1,
    };
  }
}

// =============================================================================
// LLM Prompt Building
// =============================================================================

/**
 * Build the LLM prompt for analyzing command output.
 */
function buildAnalysisPrompt(context: {
  command: string;
  hint?: string;
  sampleOutput?: string;
  packageDocs?: string;
  validPaths: string[];
}): string {
  return `You are helping configure a custom quality metric for a code quality gate system.

## Task
Generate a CustomDimensionConfig that extracts a numeric metric from this command's output.

## Command
\`${context.command}\`

${context.hint ? `## Developer's Description\n${context.hint}\n` : ''}

${context.sampleOutput ? `## Sample Output\n\`\`\`\n${context.sampleOutput.slice(0, 4000)}\n\`\`\`\n` : ''}

${context.packageDocs ? `## Package Documentation\n${context.packageDocs.slice(0, 2000)}\n` : ''}

## Output Format
Respond with ONLY a JSON object (no markdown code blocks, no explanation outside JSON) matching this schema:

{
  "path": "custom.<name>",
  "displayName": "<Human readable name>",
  "description": "<What this metric measures - 1-2 sentences>",
  "direction": "higher-better" | "lower-better",
  "continuity": "smooth" | "discrete" | "binary",
  "defaultWeight": <0.01-0.10>,
  "extractor": {
    "type": "script",
    "command": "<full command>",
    "parseOutput": "number" | "json" | "regex",
    "jsonPath": "<if json, the JSONPath to extract, e.g. $.summary.total>",
    "regex": "<if regex, pattern with capture group for the number>"
  }
}

## Guidelines

1. **Path naming**: Must start with "custom." followed by camelCase name (e.g., "custom.avgComplexity")

2. **Parse mode selection**:
   - Use "number" if output is a single number or the first number in output is the metric
   - Use "json" if output is JSON and you can extract via jsonPath
   - Use "regex" if you need to extract a specific number from text (use capture group)

3. **Direction**:
   - "lower-better" for: errors, complexity, warnings, size, count of bad things
   - "higher-better" for: scores, coverage percentages, good thing counts

4. **Continuity**:
   - "smooth" for metrics that change gradually (complexity scores, percentages)
   - "discrete" for counts that change in integers (error counts, dependency counts)
   - "binary" for pass/fail (0 or 1)

5. **Weight**: Use 0.01-0.03 for minor metrics, 0.05-0.10 for important ones

## Common patterns for recognized tools:

- **plato/complexity-report**: JSON output, extract from summary.average.cyclomatic
- **madge --circular --json**: JSON array, count circular dependencies with length
- **depcheck**: JSON, count unused dependencies
- **npm audit --json**: JSON, extract vulnerability counts
- **bundlesize/size-limit**: JSON, extract sizes
- **grep -c / wc -l**: Direct number output, use "number" parseOutput

## Important:
- The "command" in extractor should be the EXACT command to run
- For regex, the capture group (parentheses) must capture the number you want
- Test that your jsonPath or regex would actually work on the sample output
`;
}

// =============================================================================
// LLM Call
// =============================================================================

/**
 * Call Claude CLI with a prompt.
 */
function callClaude(prompt: string): string | undefined {
  try {
    // Use Claude CLI with --print flag for non-interactive mode
    const result = execSync(
      `echo ${JSON.stringify(prompt)} | claude --print 2>/dev/null`,
      {
        encoding: 'utf-8',
        timeout: 60000, // 60 second timeout for LLM
        maxBuffer: 1024 * 1024,
      }
    );
    return result.trim();
  } catch {
    // Try alternative invocation
    try {
      const result = spawnSync('claude', ['--print'], {
        input: prompt,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      });
      if (result.stdout) return result.stdout.trim();
    } catch {
      // Fall through to return undefined
    }
    return undefined;
  }
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse and validate the LLM response.
 */
function parseAndValidateResponse(response: string): CustomDimensionConfig | undefined {
  // Try to extract JSON from response (in case LLM wrapped it in markdown)
  let jsonStr = response;

  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Validate required fields
    if (
      typeof parsed.path !== 'string' ||
      !parsed.path.startsWith('custom.') ||
      typeof parsed.displayName !== 'string' ||
      (parsed.direction !== 'higher-better' && parsed.direction !== 'lower-better') ||
      typeof parsed.extractor !== 'object' ||
      parsed.extractor === null
    ) {
      return undefined;
    }

    const extractor = parsed.extractor as Record<string, unknown>;
    if (extractor.type !== 'script' || typeof extractor.command !== 'string') {
      return undefined;
    }

    // Build validated config
    const config: CustomDimensionConfig = {
      path: parsed.path as string,
      displayName: parsed.displayName as string,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      direction: parsed.direction as 'higher-better' | 'lower-better',
      continuity: ['smooth', 'discrete', 'binary'].includes(parsed.continuity as string)
        ? (parsed.continuity as 'smooth' | 'discrete' | 'binary')
        : 'discrete',
      defaultWeight: typeof parsed.defaultWeight === 'number'
        ? Math.max(0, Math.min(1, parsed.defaultWeight))
        : 0.01,
      extractor: {
        type: 'script',
        command: extractor.command as string,
        parseOutput: ['number', 'json', 'regex'].includes(extractor.parseOutput as string)
          ? (extractor.parseOutput as 'number' | 'json' | 'regex')
          : 'number',
        jsonPath: typeof extractor.jsonPath === 'string' ? extractor.jsonPath : undefined,
        regex: typeof extractor.regex === 'string' ? extractor.regex : undefined,
      },
    };

    return config;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Main Builder Function
// =============================================================================

/**
 * Build a custom dimension config using LLM analysis.
 */
export async function buildDimension(
  options: DimensionBuilderOptions
): Promise<DimensionBuilderResult> {
  const { command, hint, timeout = 30000 } = options;
  let { sampleOutput } = options;

  // Run command if requested and no sample output provided
  if (options.runNow && !sampleOutput) {
    const result = runCommand(command, timeout);
    sampleOutput = result.output;
  }

  // Try to fetch package docs if requested
  let packageDocs: string | undefined;
  if (options.fetchDocs !== false) {
    const packageName = extractPackageName(command);
    if (packageName) {
      packageDocs = await fetchPackageDocs(packageName);
    }
  }

  // Build prompt
  const prompt = buildAnalysisPrompt({
    command,
    hint,
    sampleOutput,
    packageDocs,
    validPaths: getValidPaths(),
  });

  // Call LLM
  const response = callClaude(prompt);
  if (!response) {
    return {
      error: 'Failed to get response from Claude CLI. Make sure claude is installed and authenticated.',
      rawResponse: undefined,
    };
  }

  // Parse response
  const config = parseAndValidateResponse(response);
  if (!config) {
    return {
      error: 'Failed to parse LLM response as valid dimension config.',
      rawResponse: response,
    };
  }

  return {
    config,
    rawResponse: response,
  };
}

// =============================================================================
// Config File Management
// =============================================================================

/**
 * Append a custom dimension config to the quality-gate.config.ts file.
 * Creates the file if it doesn't exist.
 */
export function appendToConfigFile(
  config: CustomDimensionConfig,
  configPath?: string
): void {
  const filePath = configPath ?? resolve(process.cwd(), 'quality-gate.config.ts');

  if (!existsSync(filePath)) {
    // Create new config file
    const content = `/**
 * Quality Gate Custom Dimensions
 * ==============================
 * Custom metrics to include in quality gate evaluation.
 */

import type { CustomDimensionConfig } from 'quality-gate-sgd';

export const customDimensions: CustomDimensionConfig[] = [
  ${JSON.stringify(config, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},
];
`;
    writeFileSync(filePath, content, 'utf-8');
    return;
  }

  // Append to existing file
  const content = readFileSync(filePath, 'utf-8');

  // Find the array closing bracket
  const match = content.match(/export\s+const\s+customDimensions[^=]*=\s*\[([\s\S]*?)\];/);
  if (match) {
    // Insert before the closing bracket
    const arrayContent = match[1].trim();
    const newContent = content.replace(
      match[0],
      `export const customDimensions: CustomDimensionConfig[] = [${arrayContent ? '\n  ' + arrayContent + ',' : ''}
  ${JSON.stringify(config, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},
];`
    );
    writeFileSync(filePath, newContent, 'utf-8');
  } else {
    // Append as new export
    appendFileSync(
      filePath,
      `\n\nexport const customDimensions: CustomDimensionConfig[] = [
  ${JSON.stringify(config, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},
];\n`,
      'utf-8'
    );
  }
}
