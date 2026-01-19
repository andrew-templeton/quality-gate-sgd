/**
 * Symbol Types
 * ============
 * Core type definitions for unified symbol representation.
 *
 * These types enable mapping issues from ALL quality axes
 * (coverage, TypeScript, ESLint, SonarQube) to a consistent symbol graph.
 */
import type { LocatedIssue } from '../targets/types.js';
/**
 * The kind of code symbol.
 */
export type SymbolKind = 'file' | 'class' | 'method' | 'function' | 'arrow-function' | 'const' | 'variable' | 'type-alias' | 'interface' | 'enum';
/**
 * Source location span for a symbol.
 */
export interface SymbolSpan {
    /** Start line (1-indexed) */
    startLine: number;
    /** Start column (0-indexed) */
    startColumn: number;
    /** End line (1-indexed) */
    endLine: number;
    /** End column (0-indexed) */
    endColumn: number;
}
/**
 * A code symbol extracted from the AST.
 *
 * Represents a function, class, method, or other named entity
 * that can contain quality issues.
 */
export interface CodeSymbol {
    /**
     * Unique identifier for this symbol.
     *
     * Format: "file.ts::ClassName.methodName" or "file.ts::functionName"
     * This allows consistent cross-referencing across quality axes.
     */
    id: string;
    /** Source file path (relative or absolute depending on context) */
    file: string;
    /** Symbol name (e.g., "handleRequest", "UserService") */
    name: string;
    /**
     * Qualified name including parent context.
     *
     * For class methods: "UserService.handleRequest"
     * For top-level: just the name
     * For nested: "OuterClass.InnerClass.method"
     */
    qualifiedName: string;
    /** What kind of symbol this is */
    kind: SymbolKind;
    /** Parent symbol ID (for methods inside classes, nested functions, etc.) */
    parent?: string;
    /** Whether this symbol is exported from its module */
    exported: boolean;
    /** Source location span */
    span: SymbolSpan;
    /** Lines of code in this symbol (endLine - startLine + 1) */
    sloc: number;
}
/**
 * A symbol table indexing all symbols in a codebase.
 *
 * Provides multiple access patterns for efficient lookup:
 * - By ID for direct access
 * - By file for iterating a file's symbols
 * - By line for mapping locations to containing symbols
 */
export interface SymbolTable {
    /** All symbols keyed by their unique ID */
    symbols: Map<string, CodeSymbol>;
    /** File path → symbols in that file (sorted by start line) */
    byFile: Map<string, CodeSymbol[]>;
    /**
     * Quick lookup index: "file.ts:42" → containing symbol.
     *
     * Maps each line number to the innermost symbol containing that line.
     * This enables O(1) location→symbol mapping.
     */
    lineIndex: Map<string, CodeSymbol>;
}
/**
 * Coverage statistics for a symbol.
 */
export interface SymbolCoverage {
    branches: {
        total: number;
        covered: number;
        uncovered: number;
        percentage: number;
    };
    statements: {
        total: number;
        covered: number;
        uncovered: number;
        percentage: number;
    };
}
/**
 * Issues grouped by axis for a symbol.
 */
export interface SymbolIssuesByAxis {
    typescript: LocatedIssue[];
    eslint: LocatedIssue[];
    sonarqube: LocatedIssue[];
    coverage: LocatedIssue[];
}
/**
 * Aggregated issues for a single symbol.
 *
 * This is the unified view: a symbol with its issues from ALL axes,
 * plus computed metrics for normalized comparison.
 */
export interface SymbolIssues {
    /** The symbol */
    symbol: CodeSymbol;
    /** Coverage metrics for this symbol (if available) */
    coverage: SymbolCoverage;
    /** Issues grouped by source axis */
    issues: SymbolIssuesByAxis;
    /** Total issue count across all axes (excluding coverage items) */
    totalIssueCount: number;
    /**
     * Issue density: totalIssueCount / sloc.
     *
     * Normalized metric enabling fair comparison across symbols
     * of different sizes. A 10-line function with 5 issues (0.5)
     * is worse than a 100-line function with 10 issues (0.1).
     */
    issueDensity: number;
    /**
     * Coverage gap: 1 - (branchCoverage / 100).
     *
     * 0 = fully covered, 1 = no coverage.
     * This normalizes coverage to the same "lower is better" as issueDensity.
     */
    coverageGap: number;
    /**
     * Total expected ΔQ if all issues at this symbol are fixed.
     *
     * Computed same way as OptimizationTarget.totalDeltaQ for consistency.
     */
    totalDeltaQ: number;
    /** Number of files that depend on this symbol's file */
    dependentCount?: number;
    /**
     * Centrality score from dependency graph.
     * Higher = more central, more impactful to fix.
     */
    centralityScore?: number;
    /**
     * Graph-weighted total ΔQ.
     * totalDeltaQ * (1 + log2(dependentCount + 1))
     */
    weightedDeltaQ?: number;
    /** Weighting source for weightedDeltaQ */
    weightingSource?: 'file' | 'call-graph';
    /** Number of symbols that call this symbol (call graph in-degree) */
    callersCount?: number;
    /** Number of symbols this symbol calls (call graph out-degree) */
    calleesCount?: number;
    /**
     * Estimated fraction of issues fixable in one pass (0-1).
     * Computed by LLM pre-reading the code segment.
     */
    fixabilityScore?: number;
    /**
     * Adjusted ΔQ accounting for fixability.
     * weightedDeltaQ * fixabilityScore (or totalDeltaQ * fixabilityScore if no graph)
     */
    adjustedDeltaQ?: number;
}
/**
 * Options for extracting symbols from source files.
 */
export interface ExtractSymbolsOptions {
    /** Root directory for resolving relative paths */
    rootDir?: string;
    /** Glob patterns to include */
    include?: string[];
    /** Glob patterns to exclude */
    exclude?: string[];
    /** Whether to include private members (default: true) */
    includePrivate?: boolean;
    /** Whether to include internal/nested symbols (default: true) */
    includeNested?: boolean;
}
//# sourceMappingURL=types.d.ts.map