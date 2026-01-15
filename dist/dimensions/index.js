/**
 * Dimensions Module
 * =================
 * Exports the dimension registry and related utilities.
 */
export { 
// Constants
BUILTIN_DIMENSIONS, 
// Registration
registerDimension, clearCustomDimensions, 
// Lookup
getDimension, getAllDimensions, getValidPaths, validatePath, 
// Filtering
getDimensionsByCategory, getDimensionsByContinuity, getSmoothDimensions, getConstraintDimensions, 
// Documentation
formatDimensionsTable, generateDimensionsDoc, } from './registry.js';
export { loadCustomDimensions, extractCustomMetric, registerCustomDimensions, extractAllCustomMetrics, } from './custom.js';
export { buildDimension, appendToConfigFile, } from './builder.js';
//# sourceMappingURL=index.js.map