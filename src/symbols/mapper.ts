/**
 * Symbol Mapper
 * =============
 * Maps source locations to containing symbols.
 *
 * This enables mapping issues from any quality axis (TypeScript, ESLint,
 * SonarQube, coverage) to their containing symbol for unified analysis.
 */

import path from 'path';
import type { CodeSymbol, SymbolTable } from './types.js';

// =============================================================================
// Location Mapping
// =============================================================================

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
export function mapLocationToSymbol(
  table: SymbolTable,
  file: string,
  line: number,
  column?: number
): CodeSymbol | undefined {
  // Try direct lookup first (fast path)
  const directKey = `${file}:${line}`;
  const directMatch = table.lineIndex.get(directKey);
  if (directMatch) {
    return directMatch;
  }

  // Try with normalized path
  const normalizedFile = normalizePath(file);
  const normalizedKey = `${normalizedFile}:${line}`;
  const normalizedMatch = table.lineIndex.get(normalizedKey);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  // Try matching by file suffix (handles relative vs absolute paths)
  const matchingFile = findMatchingFile(table, file);
  if (matchingFile) {
    const suffixKey = `${matchingFile}:${line}`;
    const suffixMatch = table.lineIndex.get(suffixKey);
    if (suffixMatch) {
      return suffixMatch;
    }
  }

  // Fall back to span containment check if exact line not in index
  const fileSymbols = table.byFile.get(file)
    ?? table.byFile.get(normalizedFile)
    ?? (matchingFile ? table.byFile.get(matchingFile) : undefined);

  if (!fileSymbols) {
    return undefined;
  }

  return findContainingSymbol(fileSymbols, line, column);
}

/**
 * Find the innermost symbol containing a given location.
 */
function findContainingSymbol(
  symbols: CodeSymbol[],
  line: number,
  column?: number
): CodeSymbol | undefined {
  // Find all symbols that contain this line
  const candidates = symbols.filter(sym =>
    line >= sym.span.startLine && line <= sym.span.endLine
  );

  if (candidates.length === 0) {
    return undefined;
  }

  // If only one candidate, return it
  if (candidates.length === 1) {
    return candidates[0];
  }

  // Multiple candidates - prefer the most specific (smallest span)
  // Also check column if provided for precise matching on start/end lines
  let best: CodeSymbol | undefined;
  let bestSize = Infinity;

  for (const sym of candidates) {
    // Check column boundaries on edge lines
    if (column !== undefined) {
      if (line === sym.span.startLine && column < sym.span.startColumn) {
        continue;
      }
      if (line === sym.span.endLine && column > sym.span.endColumn) {
        continue;
      }
    }

    // Prefer smaller (more specific) symbols
    if (sym.sloc < bestSize) {
      best = sym;
      bestSize = sym.sloc;
    }
  }

  return best;
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize a file path for comparison.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Find a file in the symbol table that matches the given path.
 *
 * Handles cases where:
 * - Issue has relative path but table has absolute
 * - Issue has absolute path but table has relative
 * - Paths have different root prefixes
 */
function findMatchingFile(table: SymbolTable, targetPath: string): string | undefined {
  const normalizedTarget = normalizePath(targetPath);
  const targetBasename = path.basename(normalizedTarget);

  for (const [tablePath] of table.byFile) {
    const normalizedTable = normalizePath(tablePath);

    // Exact match
    if (normalizedTable === normalizedTarget) {
      return tablePath;
    }

    // Suffix match (one ends with the other)
    if (normalizedTable.endsWith(normalizedTarget) ||
        normalizedTarget.endsWith(normalizedTable)) {
      return tablePath;
    }

    // Same basename with similar directory structure
    if (path.basename(normalizedTable) === targetBasename) {
      // Check if they share directory structure
      const tableParts = normalizedTable.split('/');
      const targetParts = normalizedTarget.split('/');

      // Compare from the end, must match at least 2 path segments
      let matches = 0;
      const minLen = Math.min(tableParts.length, targetParts.length);
      for (let i = 1; i <= minLen; i++) {
        if (tableParts[tableParts.length - i] === targetParts[targetParts.length - i]) {
          matches++;
        } else {
          break;
        }
      }

      if (matches >= 2) {
        return tablePath;
      }
    }
  }

  return undefined;
}

// =============================================================================
// Bulk Mapping
// =============================================================================

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
export function mapLocationsToSymbols(
  table: SymbolTable,
  locations: Array<{ file: string; line: number; column?: number }>
): MappedLocation[] {
  // Group by file for efficient batch lookup
  const byFile = new Map<string, Array<{ index: number; line: number; column?: number }>>();

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const existing = byFile.get(loc.file) ?? [];
    existing.push({ index: i, line: loc.line, column: loc.column });
    byFile.set(loc.file, existing);
  }

  // Results array
  const results: MappedLocation[] = locations.map(loc => ({
    file: loc.file,
    line: loc.line,
    column: loc.column,
  }));

  // Process each file
  for (const [file, locs] of byFile) {
    // Find matching file once
    const matchingFile = findMatchingFile(table, file);
    const fileSymbols = matchingFile ? table.byFile.get(matchingFile) : undefined;

    for (const loc of locs) {
      // Try line index first
      const lineKey = matchingFile ? `${matchingFile}:${loc.line}` : `${file}:${loc.line}`;
      let symbol = table.lineIndex.get(lineKey);

      // Fall back to span search
      if (!symbol && fileSymbols) {
        symbol = findContainingSymbol(fileSymbols, loc.line, loc.column);
      }

      if (symbol) {
        results[loc.index].symbol = symbol;
        results[loc.index].symbolId = symbol.id;
        results[loc.index].qualifiedName = symbol.qualifiedName;
      }
    }
  }

  return results;
}

/**
 * Get all symbols in a file.
 */
export function getFileSymbols(table: SymbolTable, file: string): CodeSymbol[] {
  const direct = table.byFile.get(file);
  if (direct) return direct;

  const matchingFile = findMatchingFile(table, file);
  if (matchingFile) {
    return table.byFile.get(matchingFile) ?? [];
  }

  return [];
}

/**
 * Get a symbol by its ID.
 */
export function getSymbolById(table: SymbolTable, id: string): CodeSymbol | undefined {
  return table.symbols.get(id);
}
