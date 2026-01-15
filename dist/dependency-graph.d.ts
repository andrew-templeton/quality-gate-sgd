/**
 * Dependency Graph Analysis Module
 * =================================
 * Analyzes the dependency structure of TypeScript/JavaScript projects.
 *
 * Key concepts:
 * - **Degree**: Forward dependencies - what this file imports
 *   - Degree 0 = leaf nodes (no local dependencies) - simplest to test
 *   - Degree N = depends only on files with degree < N
 *
 * - **Dependents**: Reverse dependencies - what imports this file
 *   - Direct dependents = files that directly import this file
 *   - Indirect dependents = transitive importers
 *   - High dependents = critical code, failures cascade further
 */
import type { FileInfo } from './types.js';
/**
 * Get all TypeScript/JavaScript files in a directory recursively.
 * Excludes test files, type declarations, and node_modules.
 */
export declare function getAllTypeScriptFiles(dir: string, files?: string[]): string[];
/**
 * Extract local imports from a TypeScript/JavaScript file.
 * Handles both relative imports (./foo) and alias imports (@/foo).
 */
export declare function extractLocalImports(filePath: string, allFiles: Set<string>, srcDir: string): string[];
/**
 * Calculate the "degree" for each file based on its dependencies.
 * - Degree 0 = leaf nodes (no local dependencies)
 * - Degree N = depends only on files with degree < N
 * - Circular deps get max_degree + 1
 */
export declare function calculateDegrees(files: string[], srcDir: string): Map<string, FileInfo>;
/**
 * Build the reverse dependency graph and calculate dependent counts.
 * This measures how "important" each file is - files with more dependents
 * are more critical because failures cascade through more code.
 */
export declare function buildDependentCounts(files: Map<string, FileInfo>): void;
/**
 * Attach coverage data to file info from coverage-summary.json.
 */
export declare function attachCoverageData(files: Map<string, FileInfo>, coveragePath: string): void;
/**
 * Build the complete dependency graph with degrees, dependents, and coverage.
 *
 * @param srcDir - Source directory to analyze (default: project's src/)
 * @param coveragePath - Path to coverage-summary.json (optional)
 * @returns Map of file paths to FileInfo with all metrics
 */
export declare function buildDependencyGraph(srcDir?: string, coveragePath?: string): Map<string, FileInfo>;
//# sourceMappingURL=dependency-graph.d.ts.map