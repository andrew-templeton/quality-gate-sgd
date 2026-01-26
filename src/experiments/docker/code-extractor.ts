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

import { exec as execCallback, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SWEBenchTask } from '../swebench/types.js';
import { getImageName, ensureImage } from './evaluator.js';
import { extractFilePaths } from '../swebench/code-retrieval.js';

const exec = promisify(execCallback);

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Main Extraction
// =============================================================================

/**
 * Extract source files from SWE-bench Docker container.
 *
 * IMPORTANT: This requires Docker image to be available locally.
 * Call ensureImage() first if needed.
 */
export async function extractCodeFromDocker(
  task: SWEBenchTask,
  config: CodeExtractionConfig = {}
): Promise<CodeExtractionResult> {
  const verbose = config.verbose ?? false;
  const maxFiles = config.maxFiles ?? 20;

  const log = (msg: string) => {
    if (verbose) {
      console.error(`[CodeExtractor] ${msg}`);
    }
  };

  // 1. Ensure image is available
  log(`Ensuring image for ${task.instanceId}...`);
  const { available, imageName } = await ensureImage(task.instanceId, {
    registry: config.registry,
    arch: config.arch,
    pullImages: true,
  });

  if (!available) {
    throw new Error(`Docker image not available: ${imageName}`);
  }

  // 2. Extract file paths from problem statement
  log('Extracting file paths from problem statement...');
  const targetPaths = extractFilePaths(task).slice(0, maxFiles);

  if (targetPaths.length === 0) {
    log('No file paths found in problem statement');
    // Return empty result
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swebench-empty-'));
    return {
      projectRoot: emptyDir,
      filesExtracted: 0,
      extractedPaths: [],
      cleanup: () => {
        try {
          fs.rmSync(emptyDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      },
    };
  }

  log(`Found ${targetPaths.length} potential files to extract`);

  // 3. Create temp directory for extracted files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swebench-code-'));
  log(`Created temp directory: ${tempDir}`);

  // 4. Start container (no-op command, just keep alive briefly)
  const containerName = `swebench-extract-${task.instanceId}-${Date.now()}`;
  log(`Starting container: ${containerName}`);

  try {
    // Start container with sleep command (will be killed after extraction)
    await exec(`docker run -d --name ${containerName} ${imageName} sleep 300`);

    // 5. Extract each file
    const extractedPaths: string[] = [];

    for (const targetPath of targetPaths) {
      try {
        // Try to copy from /testbed/<path>
        const sourcePath = `/testbed/${targetPath}`;
        const destPath = path.join(tempDir, targetPath);

        log(`  Extracting ${targetPath}...`);

        // Ensure parent directory exists
        const parentDir = path.dirname(destPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        // Use docker cp
        await exec(`docker cp ${containerName}:${sourcePath} ${destPath}`);

        extractedPaths.push(targetPath);
        log(`    ✓ Extracted ${targetPath}`);
      } catch (error) {
        // File not found or other error - skip
        log(`    ✗ Failed to extract ${targetPath}`);
      }
    }

    // 6. Stop and remove container
    log('Cleaning up container...');
    try {
      await exec(`docker rm -f ${containerName}`);
    } catch {
      // Ignore cleanup errors
    }

    log(`Extraction complete: ${extractedPaths.length}/${targetPaths.length} files`);

    return {
      projectRoot: tempDir,
      filesExtracted: extractedPaths.length,
      extractedPaths,
      cleanup: () => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          log(`Cleaned up temp directory: ${tempDir}`);
        } catch {
          // Ignore cleanup errors
        }
      },
    };
  } catch (error) {
    // Cleanup on error
    try {
      await exec(`docker rm -f ${containerName}`);
    } catch {
      // Ignore
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Code extraction failed: ${errorMsg}`);
  }
}

/**
 * Extract code and provide as context for reasoning.
 * Convenience wrapper that handles cleanup automatically.
 */
export async function withExtractedCode<T>(
  task: SWEBenchTask,
  config: CodeExtractionConfig,
  fn: (projectRoot: string) => Promise<T>
): Promise<T> {
  const extraction = await extractCodeFromDocker(task, config);

  try {
    return await fn(extraction.projectRoot);
  } finally {
    extraction.cleanup();
  }
}
