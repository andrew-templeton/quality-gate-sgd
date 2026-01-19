/**
 * Symbol Call Graph
 * =================
 * Static call graph extraction using the TypeScript compiler API.
 *
 * This is intentionally conservative: it only records edges when both
 * the caller and callee can be resolved to known symbols.
 */
import * as ts from 'typescript';
import { mapLocationToSymbol } from './mapper.js';
/**
 * Compute call graph statistics for a symbol table.
 *
 * Uses static resolution via the type checker; dynamic calls may be unresolved.
 */
export function computeSymbolCallGraphStats(table) {
    const graph = buildSymbolCallGraph(table);
    const { totalCalls, resolvedCalls, callerToCallees, calleeToCallers } = graph;
    let edgeCount = 0;
    for (const callees of callerToCallees.values()) {
        edgeCount += callees.size;
    }
    const nodes = new Set();
    for (const key of callerToCallees.keys()) {
        nodes.add(key);
    }
    for (const key of calleeToCallers.keys()) {
        nodes.add(key);
    }
    const nodeCount = nodes.size;
    const avgOutDegree = nodeCount > 0 ? edgeCount / nodeCount : 0;
    const resolutionRate = totalCalls > 0 ? resolvedCalls / totalCalls : 0;
    return {
        totalCalls,
        resolvedCalls,
        unresolvedCalls: totalCalls - resolvedCalls,
        edgeCount,
        nodeCount,
        avgOutDegree,
        resolutionRate,
    };
}
/**
 * Compute per-symbol call graph weights.
 *
 * callersCount: number of distinct symbols that call this symbol (in-degree)
 * calleesCount: number of distinct symbols this symbol calls (out-degree)
 */
export function computeSymbolCallGraphWeights(table) {
    const graph = buildSymbolCallGraph(table);
    const weights = new Map();
    for (const [symbolId, callers] of graph.calleeToCallers) {
        const existing = weights.get(symbolId) ?? { callersCount: 0, calleesCount: 0 };
        existing.callersCount = callers.size;
        weights.set(symbolId, existing);
    }
    for (const [symbolId, callees] of graph.callerToCallees) {
        const existing = weights.get(symbolId) ?? { callersCount: 0, calleesCount: 0 };
        existing.calleesCount = callees.size;
        weights.set(symbolId, existing);
    }
    return weights;
}
function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
}
function buildSymbolCallGraph(table) {
    const files = [...table.byFile.keys()];
    const callerToCallees = new Map();
    const calleeToCallers = new Map();
    if (files.length === 0) {
        return {
            totalCalls: 0,
            resolvedCalls: 0,
            callerToCallees,
            calleeToCallers,
        };
    }
    const program = ts.createProgram(files, {
        allowJs: true,
        checkJs: false,
        noEmit: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const checker = program.getTypeChecker();
    const fileSet = new Set(files.map(normalizePath));
    let totalCalls = 0;
    let resolvedCalls = 0;
    const addEdge = (caller, callee) => {
        if (caller.id === callee.id) {
            return;
        }
        let callees = callerToCallees.get(caller.id);
        if (!callees) {
            callees = new Set();
            callerToCallees.set(caller.id, callees);
        }
        callees.add(callee.id);
        let callers = calleeToCallers.get(callee.id);
        if (!callers) {
            callers = new Set();
            calleeToCallers.set(callee.id, callers);
        }
        callers.add(caller.id);
    };
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile)
            continue;
        if (!fileSet.has(normalizePath(sourceFile.fileName)))
            continue;
        const visit = (node) => {
            if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
                totalCalls++;
                const caller = getCallerSymbol(table, sourceFile, node);
                const callee = resolveCalleeSymbol(table, checker, node);
                if (caller && callee) {
                    resolvedCalls++;
                    addEdge(caller, callee);
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(sourceFile, visit);
    }
    return {
        totalCalls,
        resolvedCalls,
        callerToCallees,
        calleeToCallers,
    };
}
function getCallerSymbol(table, sourceFile, node) {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return mapLocationToSymbol(table, sourceFile.fileName, pos.line + 1, pos.character);
}
function resolveCalleeSymbol(table, checker, node) {
    const signature = ts.isCallExpression(node)
        ? checker.getResolvedSignature(node)
        : checker.getResolvedSignature(node);
    const declarations = [];
    if (signature?.declaration) {
        declarations.push(signature.declaration);
    }
    else {
        const symbol = checker.getSymbolAtLocation(node.expression);
        if (symbol) {
            const decls = symbol.getDeclarations() ?? [];
            declarations.push(...decls);
        }
    }
    for (const decl of declarations) {
        const declFile = decl.getSourceFile();
        if (declFile.isDeclarationFile)
            continue;
        const pos = declFile.getLineAndCharacterOfPosition(decl.getStart(declFile));
        const target = mapLocationToSymbol(table, declFile.fileName, pos.line + 1, pos.character);
        if (target) {
            return target;
        }
    }
    return undefined;
}
//# sourceMappingURL=call-graph.js.map