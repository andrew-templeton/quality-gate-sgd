/**
 * Custom Dimensions
 * =================
 * Support for user-defined metrics via script extractors.
 *
 * Users configure custom dimensions in quality-gate.config.ts:
 *
 * ```typescript
 * export const customDimensions: CustomDimensionConfig[] = [
 *   {
 *     path: 'custom.anyCount',
 *     displayName: 'TypeScript "any" Usage',
 *     description: 'Count of "any" type annotations',
 *     direction: 'lower-better',
 *     continuity: 'discrete',
 *     defaultWeight: 0.03,
 *     extractor: {
 *       type: 'script',
 *       command: 'grep -r "any" src/ --include="*.ts" | wc -l',
 *     }
 *   }
 * ];
 * ```
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { registerDimension, type DimensionDef, type DimensionDirection, type DimensionContinuity } from './registry.js';

// =============================================================================
// Types
// =============================================================================

export interface ScriptExtractor {
  type: 'script';
  /** Command to run (can use shell syntax) */
  command: string;
  /** How to parse the output (default: 'number' - extract first number from output) */
  parseOutput?: 'number' | 'json' | 'regex';
  /** JSONPath expression if parseOutput is 'json' (e.g., '$.summary.total') */
  jsonPath?: string;
  /** Regex pattern with capture group if parseOutput is 'regex' */
  regex?: string;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

export interface CustomDimensionConfig {
  /** Must start with "custom." */
  path: string;
  /** Human-readable name */
  displayName: string;
  /** Description for MCP/LLM context */
  description?: string;
  /** Optimization direction */
  direction: DimensionDirection;
  /** SGD suitability */
  continuity?: DimensionContinuity;
  /** Weight for fitness function (default: 0.01) */
  defaultWeight?: number;
  /** How to extract the metric value */
  extractor: ScriptExtractor;
}

// =============================================================================
// Config Loading
// =============================================================================

/**
 * Possible config file names, in order of preference.
 */
const CONFIG_FILE_NAMES = [
  'quality-gate.config.ts',
  'quality-gate.config.js',
  'quality-gate.config.mjs',
  'quality-gate.config.cjs',
];

/**
 * Load custom dimensions from the project's config file.
 * Returns an empty array if no config file exists.
 *
 * @param basePath - Directory to search for config file (default: cwd)
 */
export async function loadCustomDimensions(basePath?: string): Promise<CustomDimensionConfig[]> {
  const dir = basePath ?? process.cwd();

  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = resolve(dir, fileName);
    if (existsSync(configPath)) {
      try {
        // For TypeScript files, we need to use dynamic import with tsx or ts-node
        // For JS files, we can import directly
        if (fileName.endsWith('.ts')) {
          // Try to import via tsx/ts-node
          const configModule = await importTypeScriptConfig(configPath);
          if (configModule?.customDimensions) {
            return validateCustomDimensions(configModule.customDimensions);
          }
        } else {
          // ES modules or CommonJS
          const configModule = await import(configPath);
          if (configModule?.customDimensions) {
            return validateCustomDimensions(configModule.customDimensions);
          }
        }
      } catch (error) {
        console.error(`Warning: Failed to load config from ${configPath}:`, error);
      }
    }
  }

  return [];
}

/**
 * Import a TypeScript config file.
 * Falls back to reading the file and extracting JSON if tsx/ts-node not available.
 */
async function importTypeScriptConfig(configPath: string): Promise<{ customDimensions?: unknown[] } | null> {
  try {
    // Try dynamic import (works if tsx or ts-node is in the path)
    return await import(configPath);
  } catch {
    // Fall back to parsing the file content for simple cases
    try {
      const content = readFileSync(configPath, 'utf-8');
      // Extract the customDimensions array if it's a simple export
      const match = content.match(/export\s+const\s+customDimensions\s*[:=]\s*(\[[\s\S]*?\]);/);
      if (match) {
        // This is a simple heuristic - will only work for literal arrays
        // For complex configs, users need tsx/ts-node
        const arrayStr = match[1];
        // Try to evaluate as JSON (will fail for JS expressions)
        try {
          const parsed = JSON.parse(arrayStr);
          return { customDimensions: parsed };
        } catch {
          console.error(`Warning: Config file ${configPath} uses JavaScript expressions. ` +
            'Install tsx or ts-node for full support, or use a .js config file.');
        }
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }
}

/**
 * Validate and normalize custom dimension configs.
 */
function validateCustomDimensions(configs: unknown[]): CustomDimensionConfig[] {
  const validated: CustomDimensionConfig[] = [];

  for (const config of configs) {
    if (!isValidCustomDimensionConfig(config)) {
      console.error('Warning: Invalid custom dimension config:', config);
      continue;
    }

    // Ensure path starts with "custom."
    if (!config.path.startsWith('custom.')) {
      console.error(`Warning: Custom dimension path must start with "custom.": ${config.path}`);
      continue;
    }

    validated.push({
      ...config,
      continuity: config.continuity ?? 'discrete',
      defaultWeight: config.defaultWeight ?? 0.01,
    });
  }

  return validated;
}

function isValidCustomDimensionConfig(config: unknown): config is CustomDimensionConfig {
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;

  return (
    typeof c.path === 'string' &&
    typeof c.displayName === 'string' &&
    (c.direction === 'higher-better' || c.direction === 'lower-better') &&
    typeof c.extractor === 'object' &&
    c.extractor !== null &&
    (c.extractor as { type?: string }).type === 'script' &&
    typeof (c.extractor as { command?: string }).command === 'string'
  );
}

// =============================================================================
// Metric Extraction
// =============================================================================

/**
 * Extract a custom metric by running its extractor.
 *
 * @param config - Custom dimension config
 * @returns The extracted numeric value
 */
export function extractCustomMetric(config: CustomDimensionConfig): number {
  const extractor = config.extractor;
  const timeout = extractor.timeout ?? 30000;

  try {
    const output = execSync(extractor.command, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return parseOutput(output, extractor);
  } catch (error) {
    console.error(`Warning: Failed to extract custom metric ${config.path}:`, error);
    return 0;
  }
}

/**
 * Parse the output of a script extractor.
 */
function parseOutput(output: string, extractor: ScriptExtractor): number {
  const mode = extractor.parseOutput ?? 'number';

  switch (mode) {
    case 'number':
      // Extract first number from output
      const numMatch = output.match(/-?\d+\.?\d*/);
      return numMatch ? parseFloat(numMatch[0]) : 0;

    case 'json':
      // Parse JSON and extract via jsonPath
      try {
        const json = JSON.parse(output);
        if (extractor.jsonPath) {
          const value = extractJsonPath(json, extractor.jsonPath);
          return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        }
        return typeof json === 'number' ? json : 0;
      } catch {
        console.error('Warning: Failed to parse JSON output');
        return 0;
      }

    case 'regex':
      // Extract using regex with capture group
      if (!extractor.regex) {
        console.error('Warning: regex parseOutput requires regex pattern');
        return 0;
      }
      try {
        const regex = new RegExp(extractor.regex);
        const match = output.match(regex);
        if (match && match[1]) {
          return parseFloat(match[1]) || 0;
        }
      } catch {
        console.error(`Warning: Invalid regex pattern: ${extractor.regex}`);
      }
      return 0;

    default:
      return 0;
  }
}

/**
 * Simple JSONPath extractor for paths like "$.summary.total" or "summary.total".
 */
function extractJsonPath(obj: unknown, path: string): unknown {
  // Strip leading "$." if present
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const parts = cleanPath.split('.');

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    // Handle array indexing like "items[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

// =============================================================================
// Registration
// =============================================================================

/**
 * Register all custom dimensions from config.
 * Should be called early in the CLI lifecycle.
 *
 * @param basePath - Directory to search for config file
 */
export async function registerCustomDimensions(basePath?: string): Promise<CustomDimensionConfig[]> {
  const configs = await loadCustomDimensions(basePath);

  for (const config of configs) {
    const def: DimensionDef = {
      path: config.path,
      displayName: config.displayName,
      description: config.description ?? `Custom metric: ${config.displayName}`,
      unit: 'count',
      direction: config.direction,
      continuity: config.continuity ?? 'discrete',
      defaultWeight: config.defaultWeight ?? 0.01,
      category: 'custom',
    };

    try {
      registerDimension(def);
    } catch (error) {
      console.error(`Warning: Failed to register custom dimension ${config.path}:`, error);
    }
  }

  return configs;
}

/**
 * Extract all custom metrics and return as a record.
 *
 * @param configs - Custom dimension configs (from loadCustomDimensions)
 * @returns Record of path -> value
 */
export function extractAllCustomMetrics(configs: CustomDimensionConfig[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const config of configs) {
    const shortPath = config.path.replace('custom.', '');
    result[shortPath] = extractCustomMetric(config);
  }

  return result;
}
