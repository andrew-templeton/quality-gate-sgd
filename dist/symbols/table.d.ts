/**
 * Symbol Table Utilities
 * ======================
 * Utilities for working with symbol tables.
 */
import type { CodeSymbol, SymbolTable, SymbolKind } from './types.js';
/**
 * Statistics about a symbol table.
 */
export interface SymbolTableStats {
    /** Total number of symbols */
    totalSymbols: number;
    /** Number of files with symbols */
    fileCount: number;
    /** Breakdown by symbol kind */
    byKind: Record<SymbolKind, number>;
    /** Number of exported symbols */
    exportedCount: number;
    /** Average symbols per file */
    avgSymbolsPerFile: number;
    /** Total lines of code across all symbols */
    totalSloc: number;
}
/**
 * Compute statistics about a symbol table.
 */
export declare function getSymbolTableStats(table: SymbolTable): SymbolTableStats;
/**
 * Filter options for finding symbols.
 */
export interface SymbolFilterOptions {
    /** Filter by kind */
    kinds?: SymbolKind[];
    /** Filter by exported status */
    exported?: boolean;
    /** Filter by name pattern (regex) */
    namePattern?: RegExp;
    /** Filter by file pattern (regex) */
    filePattern?: RegExp;
    /** Minimum SLOC */
    minSloc?: number;
    /** Maximum SLOC */
    maxSloc?: number;
}
/**
 * Filter symbols based on criteria.
 */
export declare function filterSymbols(table: SymbolTable, options: SymbolFilterOptions): CodeSymbol[];
/**
 * Get all children of a symbol (methods of a class, etc.).
 */
export declare function getChildren(table: SymbolTable, symbolId: string): CodeSymbol[];
/**
 * Get the parent chain of a symbol (for nested structures).
 */
export declare function getParentChain(table: SymbolTable, symbolId: string): CodeSymbol[];
/**
 * Get all symbols in the same file as the given symbol.
 */
export declare function getSiblings(table: SymbolTable, symbolId: string): CodeSymbol[];
/**
 * Find symbols by name (exact match).
 */
export declare function findSymbolsByName(table: SymbolTable, name: string): CodeSymbol[];
/**
 * Find symbols by qualified name (exact match).
 */
export declare function findSymbolsByQualifiedName(table: SymbolTable, qualifiedName: string): CodeSymbol[];
/**
 * Get all files in the symbol table.
 */
export declare function getFiles(table: SymbolTable): string[];
/**
 * Get top-level symbols (no parent) in a file.
 */
export declare function getTopLevelSymbols(table: SymbolTable, file: string): CodeSymbol[];
/**
 * Merge multiple symbol tables into one.
 *
 * Useful for incremental updates or combining partial extractions.
 */
export declare function mergeSymbolTables(...tables: SymbolTable[]): SymbolTable;
/**
 * Create an empty symbol table.
 */
export declare function createEmptySymbolTable(): SymbolTable;
//# sourceMappingURL=table.d.ts.map