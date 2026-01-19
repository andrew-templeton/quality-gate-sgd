/**
 * Symbol Mapper
 * =============
 * Maps source locations to containing symbols.
 *
 * This enables mapping issues from any quality axis (TypeScript, ESLint,
 * SonarQube, coverage) to their containing symbol for unified analysis.
 */
import type { CodeSymbol, SymbolTable } from './types.js';
/**
 * Map a file:line location to its containing symbol.
 *
 * Returns the innermost symbol containing the given location,
 * or undefined if no symbol contains that location.
 *
 * @param table - The symbol table to search
 * @param file - File path (absolute or relative)
 * @param line - Line number (1-indexed)
 * @param column - Optional column number (0-indexed) for more precise matching
 */
export declare function mapLocationToSymbol(table: SymbolTable, file: string, line: number, column?: number): CodeSymbol | undefined;
/**
 * Result of mapping a location to a symbol.
 */
export interface MappedLocation {
    /** Original file path */
    file: string;
    /** Original line number */
    line: number;
    /** Original column (if provided) */
    column?: number;
    /** Containing symbol (if found) */
    symbol?: CodeSymbol;
    /** Symbol ID (if found) */
    symbolId?: string;
    /** Qualified name (if found) */
    qualifiedName?: string;
}
/**
 * Map multiple locations to their symbols.
 *
 * More efficient than calling mapLocationToSymbol repeatedly
 * because it batches file lookups.
 */
export declare function mapLocationsToSymbols(table: SymbolTable, locations: Array<{
    file: string;
    line: number;
    column?: number;
}>): MappedLocation[];
/**
 * Get all symbols in a file.
 */
export declare function getFileSymbols(table: SymbolTable, file: string): CodeSymbol[];
/**
 * Get a symbol by its ID.
 */
export declare function getSymbolById(table: SymbolTable, id: string): CodeSymbol | undefined;
//# sourceMappingURL=mapper.d.ts.map