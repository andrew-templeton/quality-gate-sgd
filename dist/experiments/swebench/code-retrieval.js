/**
 * Code Retrieval for SWE-bench Tasks
 * ====================================
 * Provides source code context to LLM by extracting relevant files from Docker containers.
 *
 * Strategy:
 * 1. Extract file paths from problem statement and hints
 * 2. Read files from project root (Docker containers mount full repos)
 * 3. Provide bounded context (e.g., 10 most relevant files, max 500 lines each)
 * 4. Support both static provision and dynamic retrieval
 */
import * as fs from 'fs';
import * as path from 'path';
export const DEFAULT_RETRIEVAL_CONFIG = {
    maxFiles: 10,
    maxLinesPerFile: 500,
    includeTree: true,
    alwaysInclude: [],
};
// =============================================================================
// File Path Extraction
// =============================================================================
/**
 * Extract file paths mentioned in problem statement and hints.
 * Handles common patterns:
 * - Backtick code blocks: `path/to/file.py`
 * - Inline mentions: "in file path/to/file.py"
 * - Function references: "module.submodule.function"
 */
export function extractFilePaths(task) {
    const paths = new Set();
    const text = [
        task.problemStatement,
        task.hints ?? '',
    ].join('\n');
    // Pattern 1: Backtick paths
    const backtickMatches = text.match(/`([a-zA-Z0-9_/.-]+\.py)`/g);
    if (backtickMatches) {
        for (const match of backtickMatches) {
            paths.add(match.replace(/`/g, ''));
        }
    }
    // Pattern 2: "file" or "in" followed by path
    const fileMatches = text.match(/(?:file|in)\s+([a-zA-Z0-9_/.-]+\.py)/gi);
    if (fileMatches) {
        for (const match of fileMatches) {
            const pathMatch = match.match(/([a-zA-Z0-9_/.-]+\.py)/);
            if (pathMatch) {
                paths.add(pathMatch[1]);
            }
        }
    }
    // Pattern 3: Python module paths (django.utils.foo -> django/utils/foo.py)
    const moduleMatches = text.match(/\b([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,})\b/gi);
    if (moduleMatches) {
        for (const match of moduleMatches) {
            // Convert module path to file path
            const filePath = match.replace(/\./g, '/') + '.py';
            paths.add(filePath);
        }
    }
    // Pattern 4: Test file references (extract source file from test name)
    const testMatches = text.match(/test_([a-z0-9_]+)/gi);
    if (testMatches) {
        for (const match of testMatches) {
            const moduleName = match.replace(/test_/i, '');
            paths.add(`${moduleName}.py`);
        }
    }
    return Array.from(paths);
}
/**
 * Find file in project root (case-insensitive search).
 * SWE-bench repos may have files in various locations (src/, lib/, django/, etc.)
 */
function findFile(projectRoot, targetPath) {
    // Try direct path first
    const directPath = path.join(projectRoot, targetPath);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        return directPath;
    }
    // Try common source directories
    const commonDirs = ['', 'src', 'lib', 'django', 'tests'];
    for (const dir of commonDirs) {
        const candidatePath = path.join(projectRoot, dir, targetPath);
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
            return candidatePath;
        }
    }
    // Try basename search (last resort)
    const basename = path.basename(targetPath);
    try {
        const result = findFileRecursive(projectRoot, basename, 3); // max depth 3
        return result;
    }
    catch {
        return null;
    }
}
/**
 * Recursively search for file by basename (bounded depth to prevent long searches)
 */
function findFileRecursive(dir, filename, maxDepth) {
    if (maxDepth <= 0)
        return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === filename) {
                return fullPath;
            }
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                const found = findFileRecursive(fullPath, filename, maxDepth - 1);
                if (found)
                    return found;
            }
        }
    }
    catch {
        // Ignore permission errors
    }
    return null;
}
// =============================================================================
// File Reading
// =============================================================================
/**
 * Read file with bounded line count
 */
function readFileBounded(filePath, maxLines) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length <= maxLines) {
            return { content, lines: lines.length, truncated: false };
        }
        // Truncate with notice
        const truncatedContent = lines.slice(0, maxLines).join('\n') +
            `\n\n... [truncated: ${lines.length - maxLines} more lines] ...`;
        return { content: truncatedContent, lines: maxLines, truncated: true };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { content: `[Error reading file: ${errorMsg}]`, lines: 0, truncated: false };
    }
}
/**
 * Generate file tree for project (bounded depth)
 */
function generateFileTree(projectRoot, maxDepth = 2) {
    const tree = [];
    function traverse(dir, depth, prefix = '') {
        if (depth > maxDepth)
            return;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
                .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
                .sort((a, b) => {
                // Directories first
                if (a.isDirectory() && !b.isDirectory())
                    return -1;
                if (!a.isDirectory() && b.isDirectory())
                    return 1;
                return a.name.localeCompare(b.name);
            });
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const isLast = i === entries.length - 1;
                const marker = isLast ? '└── ' : '├── ';
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');
                tree.push(`${prefix}${marker}${entry.name}${entry.isDirectory() ? '/' : ''}`);
                if (entry.isDirectory()) {
                    traverse(path.join(dir, entry.name), depth + 1, nextPrefix);
                }
            }
        }
        catch {
            // Ignore permission errors
        }
    }
    tree.push(path.basename(projectRoot) + '/');
    traverse(projectRoot, 0);
    return tree.join('\n');
}
// =============================================================================
// Main Retrieval
// =============================================================================
/**
 * Retrieve code context for SWE-bench task
 */
export function retrieveCodeContext(task, projectRoot, config = {}) {
    const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    const files = [];
    let totalLines = 0;
    let truncated = false;
    // 1. Extract explicit paths from problem statement
    const explicitPaths = extractFilePaths(task);
    // 2. Find and read files
    const pathsToRetrieve = new Set([...explicitPaths, ...cfg.alwaysInclude]);
    for (const targetPath of pathsToRetrieve) {
        if (files.length >= cfg.maxFiles) {
            truncated = true;
            break;
        }
        const foundPath = findFile(projectRoot, targetPath);
        if (!foundPath)
            continue;
        const { content, lines, truncated: fileTruncated } = readFileBounded(foundPath, cfg.maxLinesPerFile);
        files.push({
            path: path.relative(projectRoot, foundPath),
            content,
            lines,
            relevance: cfg.alwaysInclude.includes(targetPath) ? 'always' : 'explicit',
        });
        totalLines += lines;
        if (fileTruncated)
            truncated = true;
    }
    // 3. Generate file tree if requested
    let fileTree;
    if (cfg.includeTree) {
        fileTree = generateFileTree(projectRoot);
    }
    return {
        files,
        fileTree,
        totalLines,
        truncated,
    };
}
/**
 * Format code context as markdown for LLM prompt
 */
export function formatCodeContext(context) {
    const parts = [];
    if (context.fileTree) {
        parts.push('## Project Structure\n');
        parts.push('```');
        parts.push(context.fileTree);
        parts.push('```\n');
    }
    if (context.files.length > 0) {
        parts.push('## Retrieved Files\n');
        for (const file of context.files) {
            parts.push(`### ${file.path} (${file.lines} lines, relevance: ${file.relevance})\n`);
            parts.push('```python');
            parts.push(file.content);
            parts.push('```\n');
        }
    }
    if (context.truncated) {
        parts.push('_Note: Some files or sections were truncated to fit context limits._\n');
    }
    parts.push(`**Total Context**: ${context.files.length} files, ${context.totalLines} lines\n`);
    return parts.join('\n');
}
//# sourceMappingURL=code-retrieval.js.map