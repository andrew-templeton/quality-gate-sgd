/**
 * Dimensions Module
 * =================
 * Exports the dimension registry and related utilities.
 */

export type {
  DimensionDef,
  DimensionUnit,
  DimensionDirection,
  DimensionContinuity,
  DimensionCategory,
} from './registry.js';

export {
  // Constants
  BUILTIN_DIMENSIONS,

  // Registration
  registerDimension,
  clearCustomDimensions,

  // Lookup
  getDimension,
  getAllDimensions,
  getValidPaths,
  validatePath,

  // Filtering
  getDimensionsByCategory,
  getDimensionsByContinuity,
  getSmoothDimensions,
  getConstraintDimensions,

  // Documentation
  formatDimensionsTable,
  generateDimensionsDoc,
} from './registry.js';

// Custom dimensions
export type {
  CustomDimensionConfig,
  ScriptExtractor,
} from './custom.js';

export {
  loadCustomDimensions,
  extractCustomMetric,
  registerCustomDimensions,
  extractAllCustomMetrics,
} from './custom.js';

// Dimension builder (LLM-assisted)
export type {
  DimensionBuilderOptions,
  DimensionBuilderResult,
} from './builder.js';

export {
  buildDimension,
  appendToConfigFile,
} from './builder.js';
