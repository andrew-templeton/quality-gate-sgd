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
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './config.js';
// =============================================================================
// File Discovery
// =============================================================================
/**
 * Get all TypeScript/JavaScript files in a directory recursively.
 * Excludes test files, type declarations, and node_modules.
 */
export function getAllTypeScriptFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip test directories and node_modules
            if (entry.name === '__tests__' || entry.name === 'node_modules')
                continue;
            getAllTypeScriptFiles(fullPath, files);
        }
        else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            // Skip test files and type declaration files
            if (entry.name.includes('.test.') ||
                entry.name.includes('.spec.') ||
                entry.name.endsWith('.d.ts'))
                continue;
            files.push(fullPath);
        }
    }
    return files;
}
// =============================================================================
// Import Extraction
// =============================================================================
/**
 * Extract local imports from a TypeScript/JavaScript file.
 * Handles both relative imports (./foo) and alias imports (@/foo).
 */
export function extractLocalImports(filePath, allFiles, srcDir) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = [];
    // Match various import patterns
    const importPatterns = [
        /import\s+.*?from\s+['"](@\/[^'"]+)['"]/g,
        /import\s+.*?from\s+['"](\.[^'"]+)['"]/g,
        /require\s*\(\s*['"](@\/[^'"]+)['"]\s*\)/g,
        /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of importPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const importPath = match[1];
            const resolvedPath = resolveImportPath(filePath, importPath, srcDir);
            if (resolvedPath && allFiles.has(resolvedPath)) {
                imports.push(resolvedPath);
            }
        }
    }
    return [...new Set(imports)]; // Deduplicate
}
/**
 * Resolve an import path to an absolute file path.
 */
function resolveImportPath(fromFile, importPath, srcDir) {
    let resolved;
    if (importPath.startsWith('@/')) {
        // Alias resolution - assumes @/ points to src/
        resolved = path.resolve(srcDir, importPath.slice(2));
    }
    else if (importPath.startsWith('.')) {
        // Relative import
        resolved = path.resolve(path.dirname(fromFile), importPath);
    }
    else {
        return null; // External package
    }
    // Try different extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of extensions) {
        const candidate = resolved + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return null;
}
// =============================================================================
// Degree Calculation (Forward Dependencies)
// =============================================================================
/**
 * Calculate the "degree" for each file based on its dependencies.
 * - Degree 0 = leaf nodes (no local dependencies)
 * - Degree N = depends only on files with degree < N
 * - Circular deps get max_degree + 1
 */
export function calculateDegrees(files, srcDir) {
    const allFilesSet = new Set(files);
    const fileInfoMap = new Map();
    // Initialize all files with their dependencies
    for (const file of files) {
        const localDeps = extractLocalImports(file, allFilesSet, srcDir);
        fileInfoMap.set(file, {
            path: file,
            degree: -1, // Unset
            localDependencies: localDeps,
            dependencyCount: localDeps.length,
            directDependents: 0,
            indirectDependents: 0,
            impact: 0,
        });
    }
    // Calculate degrees iteratively
    let changed = true;
    let iteration = 0;
    const maxIterations = 100; // Prevent infinite loops from circular deps
    while (changed && iteration < maxIterations) {
        changed = false;
        iteration++;
        for (const [, info] of fileInfoMap) {
            if (info.degree !== -1)
                continue; // Already calculated
            if (info.localDependencies.length === 0) {
                // Leaf node - no local dependencies
                info.degree = 0;
                changed = true;
            }
            else {
                // Check if all dependencies have degrees calculated
                const depDegrees = info.localDependencies.map((dep) => fileInfoMap.get(dep)?.degree ?? -1);
                if (depDegrees.every((d) => d !== -1)) {
                    info.degree = Math.max(...depDegrees) + 1;
                    changed = true;
                }
            }
        }
    }
    // Handle circular dependencies - assign highest degree + 1
    const maxDegree = Math.max(...[...fileInfoMap.values()].map((f) => f.degree).filter((d) => d !== -1), 0);
    for (const info of fileInfoMap.values()) {
        if (info.degree === -1) {
            info.degree = maxDegree + 1;
        }
    }
    return fileInfoMap;
}
// =============================================================================
// Dependent Calculation (Reverse Dependencies)
// =============================================================================
/**
 * Build the reverse dependency graph and calculate dependent counts.
 * This measures how "important" each file is - files with more dependents
 * are more critical because failures cascade through more code.
 */
export function buildDependentCounts(files) {
    // Build reverse adjacency list
    const reverseGraph = new Map();
    for (const [filePath, info] of files) {
        for (const dep of info.localDependencies) {
            if (!reverseGraph.has(dep)) {
                reverseGraph.set(dep, new Set());
            }
            reverseGraph.get(dep).add(filePath);
        }
    }
    // Count direct dependents
    for (const [filePath, info] of files) {
        info.directDependents = reverseGraph.get(filePath)?.size ?? 0;
    }
    // Count indirect dependents (transitive closure via BFS)
    for (const [filePath, info] of files) {
        const visited = new Set();
        const queue = [...(reverseGraph.get(filePath) ?? [])];
        while (queue.length > 0) {
            const dep = queue.shift();
            if (visited.has(dep))
                continue;
            visited.add(dep);
            queue.push(...(reverseGraph.get(dep) ?? []));
        }
        info.indirectDependents = visited.size;
    }
    // Normalize to impact score (0-1)
    const maxIndirect = Math.max(...[...files.values()].map((f) => f.indirectDependents), 1 // Avoid division by zero
    );
    for (const info of files.values()) {
        info.impact = info.indirectDependents / maxIndirect;
    }
}
/**
 * Attach coverage data to file info from coverage-summary.json.
 */
export function attachCoverageData(files, coveragePath) {
    if (!fs.existsSync(coveragePath)) {
        return;
    }
    let coverage;
    try {
        coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
    }
    catch {
        return;
    }
    for (const [filePath, info] of files) {
        const coverageEntry = coverage[filePath];
        if (coverageEntry && coverageEntry.statements) {
            info.coverage = {
                statements: coverageEntry.statements.pct,
                branches: coverageEntry.branches.pct,
                functions: coverageEntry.functions.pct,
                lines: coverageEntry.lines.pct,
            };
        }
    }
}
// =============================================================================
// Full Graph Building
// =============================================================================
/**
 * Build the complete dependency graph with degrees, dependents, and coverage.
 *
 * @param srcDir - Source directory to analyze (default: project's src/)
 * @param coveragePath - Path to coverage-summary.json (optional)
 * @returns Map of file paths to FileInfo with all metrics
 */
export function buildDependencyGraph(srcDir, coveragePath) {
    const config = getConfig();
    const effectiveSrcDir = srcDir || path.join(config.projectRoot, 'src');
    // Get all TypeScript files
    const files = getAllTypeScriptFiles(effectiveSrcDir);
    // Calculate forward dependencies (degree)
    const fileInfoMap = calculateDegrees(files, effectiveSrcDir);
    // Calculate reverse dependencies (dependents/impact)
    buildDependentCounts(fileInfoMap);
    // Attach coverage data if available
    if (coveragePath) {
        attachCoverageData(fileInfoMap, coveragePath);
    }
    else {
        // Try default coverage locations
        const defaultCoverage = path.join(config.projectRoot, 'coverage/coverage-summary.json');
        attachCoverageData(fileInfoMap, defaultCoverage);
    }
    return fileInfoMap;
}
//# sourceMappingURL=dependency-graph.js.map