/**
 * Dimensions Module
 * =================
 * Exports the dimension registry and related utilities.
 */
export type { DimensionDef, DimensionUnit, DimensionDirection, DimensionContinuity, DimensionCategory, } from './registry.js';
export { BUILTIN_DIMENSIONS, registerDimension, clearCustomDimensions, getDimension, getAllDimensions, getValidPaths, validatePath, getDimensionsByCategory, getDimensionsByContinuity, getSmoothDimensions, getConstraintDimensions, formatDimensionsTable, generateDimensionsDoc, } from './registry.js';
export type { CustomDimensionConfig, ScriptExtractor, } from './custom.js';
export { loadCustomDimensions, extractCustomMetric, registerCustomDimensions, extractAllCustomMetrics, } from './custom.js';
export type { DimensionBuilderOptions, DimensionBuilderResult, } from './builder.js';
export { buildDimension, appendToConfigFile, } from './builder.js';
//# sourceMappingURL=index.d.ts.map