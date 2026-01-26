/**
 * Docker Code Extractor
 * ======================
 * Extracts source files from SWE-bench Docker containers for LLM context.
 *
 * Containers have repos mounted at `/testbed`, but we need files on host filesystem
 * for the code retrieval system to read them.
 *
 * Strategy:
 * 1. Start container in background
 * 2. Use `docker cp` to extract relevant files to temp directory
 * 3. Provide temp directory as projectRoot to code retrieval
 * 4. Cleanup temp files after use
 */
import type { SWEBenchTask } from '../swebench/types.js';
export interface CodeExtractionResult {
    /** Temporary directory containing extracted files */
    projectRoot: string;
    /** Number of files extracted */
    filesExtracted: number;
    /** List of extracted file paths (relative) */
    extractedPaths: string[];
    /** Cleanup function to remove temp directory */
    cleanup: () => void;
}
export interface CodeExtractionConfig {
    /** Max files to extract (prevent copying entire repo) */
    maxFiles?: number;
    /** Docker registry */
    registry?: string;
    /** Architecture */
    arch?: 'x86_64' | 'arm64';
    /** Verbose logging */
    verbose?: boolean;
}
/**
 * Extract source files from SWE-bench Docker container.
 *
 * IMPORTANT: This requires Docker image to be available locally.
 * Call ensureImage() first if needed.
 */
export declare function extractCodeFromDocker(task: SWEBenchTask, config?: CodeExtractionConfig): Promise<CodeExtractionResult>;
/**
 * Extract code and provide as context for reasoning.
 * Convenience wrapper that handles cleanup automatically.
 */
export declare function withExtractedCode<T>(task: SWEBenchTask, config: CodeExtractionConfig, fn: (projectRoot: string) => Promise<T>): Promise<T>;
//# sourceMappingURL=code-extractor.d.ts.map