/**
 * Symbol Extractor
 * ================
 * Extracts code symbols from TypeScript/JavaScript source files using
 * the TypeScript compiler API.
 *
 * This enables unified symbol resolution across all quality axes.
 */
import type { CodeSymbol, SymbolTable, ExtractSymbolsOptions } from './types.js';
/**
 * Extract symbols from multiple source files.
 *
 * This is the main entry point for symbol extraction.
 */
export declare function extractSymbols(options?: ExtractSymbolsOptions): SymbolTable;
/**
 * Extract symbols from a single file by path.
 *
 * Useful for incremental updates or when you only need one file.
 */
export declare function extractSymbolsFromSingleFile(filePath: string): CodeSymbol[];
//# sourceMappingURL=extractor.d.ts.map