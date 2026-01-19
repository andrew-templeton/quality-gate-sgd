/**
 * Symbol Extractor
 * ================
 * Extracts code symbols from TypeScript/JavaScript source files using
 * the TypeScript compiler API.
 *
 * This enables unified symbol resolution across all quality axes.
 */

import * as ts from 'typescript';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type {
  CodeSymbol,
  SymbolKind,
  SymbolSpan,
  SymbolTable,
  ExtractSymbolsOptions,
} from './types.js';

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Simple glob-like pattern matching for file discovery.
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // Important: escape dots BEFORE converting ** to .* to avoid escaping the regex dot
  const regexPattern = pattern
    .replace(/\./g, '\\.')                    // Escape literal dots first
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')       // Placeholder for **
    .replace(/\*/g, '[^/]*')                  // Single * = any non-slash chars
    .replace(/<<<GLOBSTAR>>>/g, '.*');        // ** = any chars including /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Check if a file should be included based on include/exclude patterns.
 */
function shouldIncludeFile(
  relativePath: string,
  include: string[],
  exclude: string[]
): boolean {
  // Check exclusions first
  for (const pattern of exclude) {
    if (matchesPattern(relativePath, pattern)) {
      return false;
    }
  }

  // Check inclusions
  for (const pattern of include) {
    if (matchesPattern(relativePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively discover TypeScript/JavaScript files.
 */
function discoverFiles(
  rootDir: string,
  include: string[],
  exclude: string[]
): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Quick check for common exclusions
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') {
          continue;
        }
        walk(fullPath);
      } else if (stat.isFile()) {
        const relativePath = path.relative(rootDir, fullPath);
        if (shouldIncludeFile(relativePath, include, exclude)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return files;
}

// =============================================================================
// Symbol Extraction
// =============================================================================

/**
 * Get the SymbolKind for a TypeScript node.
 */
function getSymbolKind(node: ts.Node): SymbolKind | undefined {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isMethodDeclaration(node)) return 'method';
  if (ts.isArrowFunction(node)) return 'arrow-function';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type-alias';
  if (ts.isEnumDeclaration(node)) return 'enum';
  if (ts.isVariableDeclaration(node)) {
    const parent = node.parent;
    if (parent && ts.isVariableDeclarationList(parent)) {
      const flags = parent.flags;
      if (flags & ts.NodeFlags.Const) return 'const';
    }
    return 'variable';
  }
  return undefined;
}

/**
 * Get the name of a node.
 */
function getNodeName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isInterfaceDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isEnumDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

/**
 * Check if a node is exported.
 */
function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) return false;
  return modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Get the span of a node.
 */
function getSpan(node: ts.Node, sourceFile: ts.SourceFile): SymbolSpan {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    startLine: start.line + 1, // Convert to 1-indexed
    startColumn: start.character,
    endLine: end.line + 1,
    endColumn: end.character,
  };
}

/**
 * Create a symbol ID from file and qualified name.
 */
function createSymbolId(file: string, qualifiedName: string): string {
  return `${file}::${qualifiedName}`;
}

/**
 * Extract symbols from a single source file.
 */
function extractSymbolsFromFile(
  sourceFile: ts.SourceFile,
  options: ExtractSymbolsOptions
): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const filePath = sourceFile.fileName;

  // Track parent context for qualified names
  const parentStack: Array<{ name: string; id: string }> = [];

  function visit(node: ts.Node): void {
    const kind = getSymbolKind(node);
    const name = getNodeName(node);

    // Handle arrow functions assigned to variables
    let effectiveKind = kind;
    let effectiveName = name;

    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        effectiveKind = 'arrow-function';
        effectiveName = ts.isIdentifier(node.name) ? node.name.text : undefined;
      }
    }

    if (effectiveKind && effectiveName) {
      // Build qualified name
      const parentName = parentStack.length > 0
        ? parentStack[parentStack.length - 1].name
        : undefined;
      const qualifiedName = parentName
        ? `${parentName}.${effectiveName}`
        : effectiveName;

      const span = getSpan(node, sourceFile);
      const id = createSymbolId(filePath, qualifiedName);
      const parentId = parentStack.length > 0
        ? parentStack[parentStack.length - 1].id
        : undefined;

      const symbol: CodeSymbol = {
        id,
        file: filePath,
        name: effectiveName,
        qualifiedName,
        kind: effectiveKind,
        parent: parentId,
        exported: isExported(node),
        span,
        sloc: span.endLine - span.startLine + 1,
      };

      symbols.push(symbol);

      // For classes, track as parent for methods
      if (effectiveKind === 'class' && options.includeNested !== false) {
        parentStack.push({ name: qualifiedName, id });
        ts.forEachChild(node, visit);
        parentStack.pop();
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return symbols;
}

/**
 * Extract symbols from multiple source files.
 *
 * This is the main entry point for symbol extraction.
 */
export function extractSymbols(options: ExtractSymbolsOptions = {}): SymbolTable {
  const {
    rootDir = process.cwd(),
    include = ['**/*.ts', '**/*.tsx'],
    exclude = ['**/node_modules/**', '**/*.d.ts', '**/dist/**'],
  } = options;

  // Discover files
  const files = discoverFiles(rootDir, include, exclude);

  if (files.length === 0) {
    return {
      symbols: new Map(),
      byFile: new Map(),
      lineIndex: new Map(),
    };
  }

  // Create TypeScript program
  const program = ts.createProgram(files, {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });

  const symbols = new Map<string, CodeSymbol>();
  const byFile = new Map<string, CodeSymbol[]>();

  // Extract symbols from each file
  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files and external files
    if (sourceFile.isDeclarationFile) continue;
    if (!files.includes(sourceFile.fileName)) continue;

    const fileSymbols = extractSymbolsFromFile(sourceFile, options);

    for (const symbol of fileSymbols) {
      symbols.set(symbol.id, symbol);
    }

    // Sort by start line for consistent iteration
    fileSymbols.sort((a, b) => a.span.startLine - b.span.startLine);
    byFile.set(sourceFile.fileName, fileSymbols);
  }

  // Build line index
  const lineIndex = buildLineIndex(symbols, byFile);

  return { symbols, byFile, lineIndex };
}

/**
 * Build a line-to-symbol index for fast location mapping.
 *
 * For each line in each file, maps to the innermost containing symbol.
 */
function buildLineIndex(
  symbols: Map<string, CodeSymbol>,
  byFile: Map<string, CodeSymbol[]>
): Map<string, CodeSymbol> {
  const lineIndex = new Map<string, CodeSymbol>();

  for (const [file, fileSymbols] of byFile) {
    // Sort by span size (largest first) so innermost symbols override outer
    const sortedBySize = [...fileSymbols].sort(
      (a, b) => b.sloc - a.sloc
    );

    for (const symbol of sortedBySize) {
      for (let line = symbol.span.startLine; line <= symbol.span.endLine; line++) {
        const key = `${file}:${line}`;
        // Overwrite - smaller (more specific) symbols will be last
        lineIndex.set(key, symbol);
      }
    }
  }

  return lineIndex;
}

/**
 * Extract symbols from a single file by path.
 *
 * Useful for incremental updates or when you only need one file.
 */
export function extractSymbolsFromSingleFile(filePath: string): CodeSymbol[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const program = ts.createProgram([filePath], {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    return [];
  }

  return extractSymbolsFromFile(sourceFile, {});
}
