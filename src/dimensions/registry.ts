/**
 * Dimension Registry
 * ==================
 * Canonical list of valid metric paths with metadata.
 * Provides validation, documentation, and fitness function integration.
 */

// =============================================================================
// Types
// =============================================================================

export type DimensionUnit = 'percentage' | 'count' | 'density';
export type DimensionDirection = 'higher-better' | 'lower-better';
export type DimensionContinuity = 'smooth' | 'discrete' | 'binary';
export type DimensionCategory = 'coverage' | 'errors' | 'quality' | 'custom';

export interface DimensionDef {
  /** Dot-notation path e.g. "coverage.unit.branches" */
  path: string;
  /** Human-readable name e.g. "Unit Test Branch Coverage" */
  displayName: string;
  /** Description for MCP/LLM context */
  description: string;
  /** What the number represents */
  unit: DimensionUnit;
  /** Optimization direction */
  direction: DimensionDirection;
  /** SGD suitability - how continuous changes in code map to metric changes */
  continuity: DimensionContinuity;
  /** Default weight for fitness function (0-1, should sum to ~1 across all) */
  defaultWeight: number;
  /** Grouping category */
  category: DimensionCategory;
}

// =============================================================================
// Built-in Dimensions
// =============================================================================

export const BUILTIN_DIMENSIONS: readonly DimensionDef[] = [
  // ---------------------------------------------------------------------------
  // Coverage Metrics (smooth, high weight - ideal for SGD-like descent)
  // ---------------------------------------------------------------------------
  {
    path: 'coverage.unit.branches',
    displayName: 'Unit Branch Coverage',
    description: 'Percentage of code branches covered by unit tests. Branch coverage is the most sensitive indicator of test thoroughness.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.20,
    category: 'coverage',
  },
  {
    path: 'coverage.unit.statements',
    displayName: 'Unit Statement Coverage',
    description: 'Percentage of code statements executed by unit tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.15,
    category: 'coverage',
  },
  {
    path: 'coverage.unit.lines',
    displayName: 'Unit Line Coverage',
    description: 'Percentage of code lines covered by unit tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.10,
    category: 'coverage',
  },
  {
    path: 'coverage.unit.functions',
    displayName: 'Unit Function Coverage',
    description: 'Percentage of functions called by unit tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.10,
    category: 'coverage',
  },
  {
    path: 'coverage.lambda.branches',
    displayName: 'Lambda Branch Coverage',
    description: 'Percentage of Lambda function code branches covered by integration tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.05,
    category: 'coverage',
  },
  {
    path: 'coverage.lambda.statements',
    displayName: 'Lambda Statement Coverage',
    description: 'Percentage of Lambda function statements covered by integration tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.05,
    category: 'coverage',
  },
  {
    path: 'coverage.lambda.lines',
    displayName: 'Lambda Line Coverage',
    description: 'Percentage of Lambda function lines covered by integration tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.03,
    category: 'coverage',
  },
  {
    path: 'coverage.lambda.functions',
    displayName: 'Lambda Function Coverage',
    description: 'Percentage of Lambda functions called by integration tests.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.02,
    category: 'coverage',
  },
  {
    path: 'coverage.union.branches',
    displayName: 'Combined Branch Coverage',
    description: 'Union of unit and Lambda branch coverage. Useful when tests are split across suites.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.0, // Usually use unit OR union, not both
    category: 'coverage',
  },
  {
    path: 'coverage.union.statements',
    displayName: 'Combined Statement Coverage',
    description: 'Union of unit and Lambda statement coverage.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.0,
    category: 'coverage',
  },
  {
    path: 'coverage.union.lines',
    displayName: 'Combined Line Coverage',
    description: 'Union of unit and Lambda line coverage.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.0,
    category: 'coverage',
  },
  {
    path: 'coverage.union.functions',
    displayName: 'Combined Function Coverage',
    description: 'Union of unit and Lambda function coverage.',
    unit: 'percentage',
    direction: 'higher-better',
    continuity: 'smooth',
    defaultWeight: 0.0,
    category: 'coverage',
  },

  // ---------------------------------------------------------------------------
  // Error Metrics (discrete, constraint-suited - floors at 0)
  // ---------------------------------------------------------------------------
  {
    path: 'typescript.errors',
    displayName: 'TypeScript Errors',
    description: 'Count of TypeScript compilation errors. Should be zero for production code.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.05,
    category: 'errors',
  },
  {
    path: 'typescript.rootCauses',
    displayName: 'TypeScript Root Causes',
    description: 'Deduplicated count of TypeScript errors grouped by symbol path. More stable than raw error count.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.05,
    category: 'errors',
  },
  {
    path: 'eslint.errors',
    displayName: 'ESLint Errors',
    description: 'Count of ESLint errors (severity: error). Should be zero.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.05,
    category: 'errors',
  },
  {
    path: 'eslint.rootCauses',
    displayName: 'ESLint Root Causes',
    description: 'Deduplicated count of ESLint errors grouped by rule and location.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.05,
    category: 'errors',
  },
  {
    path: 'eslint.warnings',
    displayName: 'ESLint Warnings',
    description: 'Count of ESLint warnings. Trend toward zero for clean code.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.02,
    category: 'errors',
  },

  // ---------------------------------------------------------------------------
  // SonarQube Metrics (mixed continuity)
  // ---------------------------------------------------------------------------
  {
    path: 'sonarqube.bugs',
    displayName: 'Bugs',
    description: 'SonarQube-detected bugs. Reliability issues that could cause incorrect behavior.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.04,
    category: 'quality',
  },
  {
    path: 'sonarqube.vulnerabilities',
    displayName: 'Vulnerabilities',
    description: 'Security vulnerabilities detected by SonarQube.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.04,
    category: 'quality',
  },
  {
    path: 'sonarqube.codeSmells',
    displayName: 'Code Smells',
    description: 'Maintainability issues detected by SonarQube. Higher counts indicate technical debt.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'smooth', // Many small issues, trends smoothly
    defaultWeight: 0.02,
    category: 'quality',
  },
  {
    path: 'sonarqube.duplications',
    displayName: 'Duplications',
    description: 'Percentage of code that is duplicated. Higher values indicate DRY violations.',
    unit: 'percentage',
    direction: 'lower-better',
    continuity: 'smooth',
    defaultWeight: 0.02,
    category: 'quality',
  },
  {
    path: 'sonarqube.blocker',
    displayName: 'Blocker Issues',
    description: 'Blocker severity issues. Must be zero for release.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'binary', // Either you have blockers or you don\'t
    defaultWeight: 0.01,
    category: 'quality',
  },
  {
    path: 'sonarqube.critical',
    displayName: 'Critical Issues',
    description: 'Critical severity issues. Should be zero.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'binary',
    defaultWeight: 0.01,
    category: 'quality',
  },
  {
    path: 'sonarqube.major',
    displayName: 'Major Issues',
    description: 'Major severity issues.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.01,
    category: 'quality',
  },
  {
    path: 'sonarqube.minor',
    displayName: 'Minor Issues',
    description: 'Minor severity issues.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.005,
    category: 'quality',
  },
  {
    path: 'sonarqube.info',
    displayName: 'Info Issues',
    description: 'Informational issues from SonarQube.',
    unit: 'count',
    direction: 'lower-better',
    continuity: 'discrete',
    defaultWeight: 0.0,
    category: 'quality',
  },
] as const;

// =============================================================================
// Registry State
// =============================================================================

const customDimensions: DimensionDef[] = [];

// =============================================================================
// Registry Functions
// =============================================================================

/**
 * Register a custom dimension.
 * Custom dimension paths must start with "custom."
 */
export function registerDimension(def: DimensionDef): void {
  if (!def.path.startsWith('custom.')) {
    throw new Error(`Custom dimension path must start with "custom.": ${def.path}`);
  }
  if (getDimension(def.path)) {
    throw new Error(`Dimension already registered: ${def.path}`);
  }
  customDimensions.push(def);
}

/**
 * Clear all custom dimensions (useful for testing).
 */
export function clearCustomDimensions(): void {
  customDimensions.length = 0;
}

/**
 * Get a dimension definition by path.
 */
export function getDimension(path: string): DimensionDef | undefined {
  const builtin = BUILTIN_DIMENSIONS.find((d) => d.path === path);
  if (builtin) return builtin;
  return customDimensions.find((d) => d.path === path);
}

/**
 * Get all registered dimensions (builtin + custom).
 */
export function getAllDimensions(): DimensionDef[] {
  return [...BUILTIN_DIMENSIONS, ...customDimensions];
}

/**
 * Get all valid dimension paths.
 */
export function getValidPaths(): string[] {
  return getAllDimensions().map((d) => d.path);
}

/**
 * Validate that a path corresponds to a registered dimension.
 */
export function validatePath(path: string): boolean {
  return getDimension(path) !== undefined;
}

/**
 * Get dimensions filtered by category.
 */
export function getDimensionsByCategory(category: DimensionCategory): DimensionDef[] {
  return getAllDimensions().filter((d) => d.category === category);
}

/**
 * Get dimensions filtered by continuity (useful for SGD suitability).
 */
export function getDimensionsByContinuity(continuity: DimensionContinuity): DimensionDef[] {
  return getAllDimensions().filter((d) => d.continuity === continuity);
}

/**
 * Get dimensions suitable for gradient descent (smooth continuity).
 * These are the best dimensions for SGD-like optimization.
 */
export function getSmoothDimensions(): DimensionDef[] {
  return getDimensionsByContinuity('smooth');
}

/**
 * Get dimensions best used as hard constraints (discrete/binary).
 */
export function getConstraintDimensions(): DimensionDef[] {
  return getAllDimensions().filter(
    (d) => d.continuity === 'discrete' || d.continuity === 'binary'
  );
}

/**
 * Format dimensions as a table string for CLI/documentation.
 */
export function formatDimensionsTable(dimensions?: DimensionDef[]): string {
  const dims = dimensions ?? getAllDimensions();
  const lines: string[] = [
    '| Path | Display Name | Direction | Continuity | Weight |',
    '|------|--------------|-----------|------------|--------|',
  ];

  for (const d of dims) {
    const direction = d.direction === 'higher-better' ? '↑' : '↓';
    const weight = d.defaultWeight > 0 ? d.defaultWeight.toFixed(2) : '—';
    lines.push(`| ${d.path} | ${d.displayName} | ${direction} | ${d.continuity} | ${weight} |`);
  }

  return lines.join('\n');
}

/**
 * Generate documentation for all dimensions (for MCP resources).
 */
export function generateDimensionsDoc(): string {
  const categories: DimensionCategory[] = ['coverage', 'errors', 'quality', 'custom'];
  const lines: string[] = [
    '# Quality Gate Dimensions',
    '',
    'This document lists all available metric dimensions for quality gate configuration.',
    '',
  ];

  for (const category of categories) {
    const dims = getDimensionsByCategory(category);
    if (dims.length === 0) continue;

    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} Dimensions`);
    lines.push('');

    for (const d of dims) {
      const direction = d.direction === 'higher-better' ? 'higher is better' : 'lower is better';
      lines.push(`### \`${d.path}\``);
      lines.push('');
      lines.push(`**${d.displayName}**`);
      lines.push('');
      lines.push(d.description);
      lines.push('');
      lines.push(`- **Unit**: ${d.unit}`);
      lines.push(`- **Direction**: ${direction}`);
      lines.push(`- **Continuity**: ${d.continuity}`);
      lines.push(`- **Default Weight**: ${d.defaultWeight}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
