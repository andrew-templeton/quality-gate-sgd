/**
 * Symbol Call Graph
 * =================
 * Static call graph extraction using the TypeScript compiler API.
 *
 * This is intentionally conservative: it only records edges when both
 * the caller and callee can be resolved to known symbols.
 */
import type { SymbolTable } from './types.js';
export interface SymbolCallGraphStats {
    /** Total call sites encountered */
    totalCalls: number;
    /** Call sites resolved to both caller and callee symbols */
    resolvedCalls: number;
    /** Call sites that could not be resolved */
    unresolvedCalls: number;
    /** Number of edges in the call graph */
    edgeCount: number;
    /** Number of distinct symbols participating in edges */
    nodeCount: number;
    /** Average out-degree across participating nodes */
    avgOutDegree: number;
    /** Resolution rate (resolvedCalls / totalCalls) */
    resolutionRate: number;
}
export interface SymbolCallGraphWeights {
    callersCount: number;
    calleesCount: number;
}
/**
 * Compute call graph statistics for a symbol table.
 *
 * Uses static resolution via the type checker; dynamic calls may be unresolved.
 */
export declare function computeSymbolCallGraphStats(table: SymbolTable): SymbolCallGraphStats;
/**
 * Compute per-symbol call graph weights.
 *
 * callersCount: number of distinct symbols that call this symbol (in-degree)
 * calleesCount: number of distinct symbols this symbol calls (out-degree)
 */
export declare function computeSymbolCallGraphWeights(table: SymbolTable): Map<string, SymbolCallGraphWeights>;
//# sourceMappingURL=call-graph.d.ts.map