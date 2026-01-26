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
import type { SWEBenchTask } from './types.js';
export interface CodeRetrievalConfig {
    /** Maximum number of files to retrieve */
    maxFiles?: number;
    /** Maximum lines per file (prevent token overflow) */
    maxLinesPerFile?: number;
    /** Whether to include file tree */
    includeTree?: boolean;
    /** Custom file patterns to always include */
    alwaysInclude?: string[];
}
export declare const DEFAULT_RETRIEVAL_CONFIG: Required<CodeRetrievalConfig>;
export interface RetrievedFile {
    path: string;
    content: string;
    lines: number;
    relevance: 'explicit' | 'inferred' | 'always';
}
export interface CodeContext {
    files: RetrievedFile[];
    fileTree?: string;
    totalLines: number;
    truncated: boolean;
}
/**
 * Extract file paths mentioned in problem statement and hints.
 * Handles common patterns:
 * - Backtick code blocks: `path/to/file.py`
 * - Inline mentions: "in file path/to/file.py"
 * - Function references: "module.submodule.function"
 */
export declare function extractFilePaths(task: SWEBenchTask): string[];
/**
 * Retrieve code context for SWE-bench task
 */
export declare function retrieveCodeContext(task: SWEBenchTask, projectRoot: string, config?: CodeRetrievalConfig): CodeContext;
/**
 * Format code context as markdown for LLM prompt
 */
export declare function formatCodeContext(context: CodeContext): string;
//# sourceMappingURL=code-retrieval.d.ts.map