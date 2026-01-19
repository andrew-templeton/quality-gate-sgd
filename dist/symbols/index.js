/**
 * Symbols Module
 * ==============
 * Unified symbol representation for cross-axis quality analysis.
 *
 * This module enables mapping issues from ALL quality axes
 * (coverage, TypeScript, ESLint, SonarQube) to a consistent symbol graph,
 * allowing normalized issue density calculation and cross-cutting analysis.
 *
 * Usage:
 * ```typescript
 * import { extractSymbols, mapLocationToSymbol } from './symbols/index.js';
 *
 * // Extract symbols from codebase
 * const table = extractSymbols({ rootDir: '/path/to/project' });
 *
 * // Map an issue location to its containing symbol
 * const symbol = mapLocationToSymbol(table, 'src/auth.ts', 42);
 * if (symbol) {
 *   console.log(`Issue in ${symbol.qualifiedName} (${symbol.kind})`);
 * }
 * ```
 */
// =============================================================================
// Extraction
// =============================================================================
export { extractSymbols, extractSymbolsFromSingleFile, } from './extractor.js';
// =============================================================================
// Mapping
// =============================================================================
export { mapLocationToSymbol, mapLocationsToSymbols, getFileSymbols, getSymbolById, } from './mapper.js';
// =============================================================================
// Table Utilities
// =============================================================================
export { getSymbolTableStats, filterSymbols, getChildren, getParentChain, getSiblings, findSymbolsByName, findSymbolsByQualifiedName, getFiles, getTopLevelSymbols, mergeSymbolTables, createEmptySymbolTable, } from './table.js';
// =============================================================================
// Address Fitness
// =============================================================================
export { computeSymbolCallGraphStats, computeSymbolCallGraphWeights, } from './call-graph.js';
export { computeAddressFitness, formatAddressFitness, } from './fitness.js';
//# sourceMappingURL=index.js.map