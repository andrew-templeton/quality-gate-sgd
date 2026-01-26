/**
 * Rules Evaluation Engine
 * Evaluates quality metrics against defined rules
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  QualityRules,
  Metrics,
  EvaluationResult,
  FailedRule,
  CacheEntry,
} from './types.js';
import { getConfig } from './config.js';
import { getDefaultRules, isEmbeddedDefaults } from './defaults.js';

// =============================================================================
// Module State
// =============================================================================

// Track whether we're using embedded defaults (for CLI messaging)
let _usingEmbeddedDefaults = false;

/**
 * Check if the currently loaded rules are embedded defaults.
 */
export function isUsingEmbeddedDefaults(): boolean {
  return _usingEmbeddedDefaults;
}

// =============================================================================
// Rules Loading
// =============================================================================

export interface LoadRulesOptions {
  /** Use coverage-only defaults if no rules file exists */
  coverageOnly?: boolean;
  /** Suppress warning about using defaults */
  silent?: boolean;
}

export function loadRules(options: LoadRulesOptions = {}): QualityRules {
  const config = getConfig();
  const { coverageOnly = false, silent = false } = options;

  // Check if rulesFile is absolute or relative
  const rulesPath = path.isAbsolute(config.rulesFile)
    ? config.rulesFile
    : path.join(config.projectRoot, config.rulesFile);

  if (!fs.existsSync(rulesPath)) {
    // Zero-config mode: use embedded defaults
    _usingEmbeddedDefaults = true;
    const defaults = getDefaultRules(coverageOnly);

    if (!silent) {
      console.error(
        `[zero-config] No rules.json found, using embedded defaults (${coverageOnly ? 'coverage-only' : 'full'})`
      );
      console.error(
        '             Run "npx quality-gate-sgd init" to create a custom configuration\n'
      );
    }

    return defaults;
  }

  _usingEmbeddedDefaults = false;
  const content = fs.readFileSync(rulesPath, 'utf-8');
  const rules = JSON.parse(content) as QualityRules;

  // Check if loaded rules are actually embedded defaults (for testing)
  if (isEmbeddedDefaults(rules)) {
    _usingEmbeddedDefaults = true;
  }

  return rules;
}

export function computeRulesHash(rules: QualityRules): string {
  const content = JSON.stringify(rules);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// =============================================================================
// Metric Value Access
// =============================================================================

/**
 * Get a nested metric value using dot notation
 * e.g., 'coverage.branches' -> metrics.coverage?.branches
 */
function getMetricValue(metrics: Metrics, path: string): number | undefined {
  const parts = path.split('.');
  let current: unknown = metrics;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'number' ? current : undefined;
}

// =============================================================================
// Floor Evaluation
// =============================================================================

function evaluateFloors(rules: QualityRules, metrics: Metrics): FailedRule[] {
  const failures: FailedRule[] = [];
  const floors = rules.rules.floors;

  if (!floors) {
    return failures;
  }

  for (const [metricPath, threshold] of Object.entries(floors)) {
    const value = getMetricValue(metrics, metricPath);

    if (value === undefined) {
      failures.push({
        type: 'floor',
        rule: metricPath,
        message: `Metric '${metricPath}' not available`,
      });
      continue;
    }

    if (value < threshold) {
      failures.push({
        type: 'floor',
        rule: metricPath,
        message: `${metricPath} is ${value.toFixed(1)}%, must be >= ${threshold}%`,
        baseline: threshold,
        current: value,
      });
    }
  }

  return failures;
}

// =============================================================================
// Ceiling Evaluation
// =============================================================================

function evaluateCeilings(rules: QualityRules, metrics: Metrics): FailedRule[] {
  const failures: FailedRule[] = [];
  const ceilings = rules.rules.ceilings;

  if (!ceilings) {
    return failures;
  }

  for (const [metricPath, threshold] of Object.entries(ceilings)) {
    const value = getMetricValue(metrics, metricPath);

    if (value === undefined) {
      // Ceilings are optional - missing metric is not a failure
      continue;
    }

    if (value > threshold) {
      failures.push({
        type: 'ceiling',
        rule: metricPath,
        message: `${metricPath} is ${value}, must be <= ${threshold}`,
        baseline: threshold,
        current: value,
      });
    }
  }

  return failures;
}

// =============================================================================
// Monotonic Evaluation
// =============================================================================

function evaluateMonotonic(
  rules: QualityRules,
  currentMetrics: Metrics,
  baselineMetrics?: Metrics
): FailedRule[] {
  const failures: FailedRule[] = [];
  const monotonicRules = rules.rules.monotonic;

  if (!monotonicRules || !baselineMetrics) {
    return failures;
  }

  for (const rule of monotonicRules) {
    for (const metricPath of rule.metrics) {
      const baselineValue = getMetricValue(baselineMetrics, metricPath);
      const currentValue = getMetricValue(currentMetrics, metricPath);

      // Skip if either value is unavailable
      if (baselineValue === undefined || currentValue === undefined) {
        continue;
      }

      const isViolation =
        rule.direction === 'up'
          ? currentValue < baselineValue
          : currentValue > baselineValue;

      if (isViolation) {
        const directionWord =
          rule.direction === 'up' ? 'decreased' : 'increased';
        const expectation =
          rule.direction === 'up' ? 'must not decrease' : 'must not increase';

        failures.push({
          type: 'monotonic',
          rule: `${rule.direction}:${metricPath}`,
          message: `${metricPath} ${directionWord} from ${baselineValue} to ${currentValue} (${expectation})`,
          baseline: baselineValue,
          current: currentValue,
        });
      }
    }
  }

  return failures;
}

// =============================================================================
// Script Evaluation
// =============================================================================

function evaluateScripts(rules: QualityRules, metrics: Metrics): FailedRule[] {
  const failures: FailedRule[] = [];
  const requiredScripts = rules.rules.requiredScripts;

  if (!requiredScripts) {
    return failures;
  }

  for (const script of requiredScripts) {
    const result = metrics.scripts[script];

    if (result === undefined) {
      failures.push({
        type: 'script',
        rule: script,
        message: `Required script '${script}' was not run`,
      });
    } else if (result === 'fail') {
      failures.push({
        type: 'script',
        rule: script,
        message: `Required script '${script}' failed`,
      });
    }
  }

  return failures;
}

// =============================================================================
// Full Evaluation
// =============================================================================

export function evaluateRules(
  rules: QualityRules,
  currentMetrics: Metrics,
  baselineEntry?: CacheEntry
): EvaluationResult {
  const baselineMetrics = baselineEntry?.metrics;

  const allFailures: FailedRule[] = [
    ...evaluateFloors(rules, currentMetrics),
    ...evaluateCeilings(rules, currentMetrics),
    ...evaluateMonotonic(rules, currentMetrics, baselineMetrics),
    ...evaluateScripts(rules, currentMetrics),
  ];

  return {
    status: allFailures.length === 0 ? 'pass' : 'fail',
    failedRules: allFailures,
  };
}

/**
 * Check if cached evaluation is still valid
 * Returns false if:
 * - Rules have changed since cache entry was created
 * - Required floor metrics were missing but may now be available
 */
export function isCacheValid(entry: CacheEntry, rules: QualityRules): boolean {
  const currentHash = computeRulesHash(rules);

  // Rules changed - cache invalid
  if (entry.rulesHash !== currentHash || entry.rulesVersion !== rules.version) {
    return false;
  }

  // If evaluation passed, cache is valid - no need to re-check metrics
  if (entry.evaluation.status === 'pass') {
    return true;
  }

  // For failed evaluations, check if any floor metrics were missing
  // If they were, we should re-extract metrics in case they're now available
  const floors = rules.rules.floors;
  if (floors) {
    for (const metricPath of Object.keys(floors)) {
      const value = getMetricValue(entry.metrics, metricPath);
      if (value === undefined) {
        // A required metric was missing - cache invalid, try fresh extraction
        return false;
      }
    }
  }

  return true;
}
