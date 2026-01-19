/**
 * Symbol Table Utilities
 * ======================
 * Utilities for working with symbol tables.
 */

import type {
  CodeSymbol,
  SymbolTable,
  SymbolKind,
} from './types.js';

// =============================================================================
// Symbol Table Statistics
// =============================================================================

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
export function getSymbolTableStats(table: SymbolTable): SymbolTableStats {
  const byKind: Record<SymbolKind, number> = {
    'file': 0,
    'class': 0,
    'method': 0,
    'function': 0,
    'arrow-function': 0,
    'const': 0,
    'variable': 0,
    'type-alias': 0,
    'interface': 0,
    'enum': 0,
  };

  let exportedCount = 0;
  let totalSloc = 0;

  for (const symbol of table.symbols.values()) {
    byKind[symbol.kind]++;
    if (symbol.exported) exportedCount++;
    totalSloc += symbol.sloc;
  }

  const totalSymbols = table.symbols.size;
  const fileCount = table.byFile.size;

  return {
    totalSymbols,
    fileCount,
    byKind,
    exportedCount,
    avgSymbolsPerFile: fileCount > 0 ? totalSymbols / fileCount : 0,
    totalSloc,
  };
}

// =============================================================================
// Symbol Filtering
// =============================================================================

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
export function filterSymbols(
  table: SymbolTable,
  options: SymbolFilterOptions
): CodeSymbol[] {
  const results: CodeSymbol[] = [];

  for (const symbol of table.symbols.values()) {
    // Kind filter
    if (options.kinds && !options.kinds.includes(symbol.kind)) {
      continue;
    }

    // Exported filter
    if (options.exported !== undefined && symbol.exported !== options.exported) {
      continue;
    }

    // Name pattern filter
    if (options.namePattern && !options.namePattern.test(symbol.name)) {
      continue;
    }

    // File pattern filter
    if (options.filePattern && !options.filePattern.test(symbol.file)) {
      continue;
    }

    // SLOC filters
    if (options.minSloc !== undefined && symbol.sloc < options.minSloc) {
      continue;
    }
    if (options.maxSloc !== undefined && symbol.sloc > options.maxSloc) {
      continue;
    }

    results.push(symbol);
  }

  return results;
}

// =============================================================================
// Symbol Relationships
// =============================================================================

/**
 * Get all children of a symbol (methods of a class, etc.).
 */
export function getChildren(table: SymbolTable, symbolId: string): CodeSymbol[] {
  const children: CodeSymbol[] = [];

  for (const symbol of table.symbols.values()) {
    if (symbol.parent === symbolId) {
      children.push(symbol);
    }
  }

  // Sort by start line
  children.sort((a, b) => a.span.startLine - b.span.startLine);
  return children;
}

/**
 * Get the parent chain of a symbol (for nested structures).
 */
export function getParentChain(table: SymbolTable, symbolId: string): CodeSymbol[] {
  const chain: CodeSymbol[] = [];
  let current = table.symbols.get(symbolId);

  while (current && current.parent) {
    const parent = table.symbols.get(current.parent);
    if (parent) {
      chain.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return chain;
}

/**
 * Get all symbols in the same file as the given symbol.
 */
export function getSiblings(table: SymbolTable, symbolId: string): CodeSymbol[] {
  const symbol = table.symbols.get(symbolId);
  if (!symbol) return [];

  const fileSymbols = table.byFile.get(symbol.file) ?? [];
  return fileSymbols.filter(s => s.id !== symbolId);
}

// =============================================================================
// Symbol Lookup Helpers
// =============================================================================

/**
 * Find symbols by name (exact match).
 */
export function findSymbolsByName(table: SymbolTable, name: string): CodeSymbol[] {
  const results: CodeSymbol[] = [];

  for (const symbol of table.symbols.values()) {
    if (symbol.name === name) {
      results.push(symbol);
    }
  }

  return results;
}

/**
 * Find symbols by qualified name (exact match).
 */
export function findSymbolsByQualifiedName(
  table: SymbolTable,
  qualifiedName: string
): CodeSymbol[] {
  const results: CodeSymbol[] = [];

  for (const symbol of table.symbols.values()) {
    if (symbol.qualifiedName === qualifiedName) {
      results.push(symbol);
    }
  }

  return results;
}

/**
 * Get all files in the symbol table.
 */
export function getFiles(table: SymbolTable): string[] {
  return [...table.byFile.keys()];
}

/**
 * Get top-level symbols (no parent) in a file.
 */
export function getTopLevelSymbols(table: SymbolTable, file: string): CodeSymbol[] {
  const fileSymbols = table.byFile.get(file) ?? [];
  return fileSymbols.filter(s => !s.parent);
}

// =============================================================================
// Symbol Table Merging
// =============================================================================

/**
 * Merge multiple symbol tables into one.
 *
 * Useful for incremental updates or combining partial extractions.
 */
export function mergeSymbolTables(...tables: SymbolTable[]): SymbolTable {
  const merged: SymbolTable = {
    symbols: new Map(),
    byFile: new Map(),
    lineIndex: new Map(),
  };

  for (const table of tables) {
    // Merge symbols
    for (const [id, symbol] of table.symbols) {
      merged.symbols.set(id, symbol);
    }

    // Merge byFile
    for (const [file, symbols] of table.byFile) {
      const existing = merged.byFile.get(file) ?? [];
      merged.byFile.set(file, [...existing, ...symbols]);
    }

    // Merge lineIndex
    for (const [key, symbol] of table.lineIndex) {
      merged.lineIndex.set(key, symbol);
    }
  }

  // De-duplicate and sort byFile entries
  for (const [file, symbols] of merged.byFile) {
    const unique = [...new Map(symbols.map(s => [s.id, s])).values()];
    unique.sort((a, b) => a.span.startLine - b.span.startLine);
    merged.byFile.set(file, unique);
  }

  return merged;
}

// =============================================================================
// Empty Table
// =============================================================================

/**
 * Create an empty symbol table.
 */
export function createEmptySymbolTable(): SymbolTable {
  return {
    symbols: new Map(),
    byFile: new Map(),
    lineIndex: new Map(),
  };
}
