/**
 * Dimension Registry
 * ==================
 * Canonical list of valid metric paths with metadata.
 * Provides validation, documentation, and fitness function integration.
 */
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
export declare const BUILTIN_DIMENSIONS: readonly DimensionDef[];
/**
 * Register a custom dimension.
 * Custom dimension paths must start with "custom."
 */
export declare function registerDimension(def: DimensionDef): void;
/**
 * Clear all custom dimensions (useful for testing).
 */
export declare function clearCustomDimensions(): void;
/**
 * Get a dimension definition by path.
 */
export declare function getDimension(path: string): DimensionDef | undefined;
/**
 * Get all registered dimensions (builtin + custom).
 */
export declare function getAllDimensions(): DimensionDef[];
/**
 * Get all valid dimension paths.
 */
export declare function getValidPaths(): string[];
/**
 * Validate that a path corresponds to a registered dimension.
 */
export declare function validatePath(path: string): boolean;
/**
 * Get dimensions filtered by category.
 */
export declare function getDimensionsByCategory(category: DimensionCategory): DimensionDef[];
/**
 * Get dimensions filtered by continuity (useful for SGD suitability).
 */
export declare function getDimensionsByContinuity(continuity: DimensionContinuity): DimensionDef[];
/**
 * Get dimensions suitable for gradient descent (smooth continuity).
 * These are the best dimensions for SGD-like optimization.
 */
export declare function getSmoothDimensions(): DimensionDef[];
/**
 * Get dimensions best used as hard constraints (discrete/binary).
 */
export declare function getConstraintDimensions(): DimensionDef[];
/**
 * Format dimensions as a table string for CLI/documentation.
 */
export declare function formatDimensionsTable(dimensions?: DimensionDef[]): string;
/**
 * Generate documentation for all dimensions (for MCP resources).
 */
export declare function generateDimensionsDoc(): string;
//# sourceMappingURL=registry.d.ts.map