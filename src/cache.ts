/**
 * Cache Module
 * Handles reading/writing the quality gate cache with schema versioning
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import type {
  QualityGateCache,
  CacheEntry,
  Metrics,
  QualityRules,
} from './types.js';
import { computeRulesHash } from './rules.js';
import { getConfig } from './config.js';

const CURRENT_SCHEMA_VERSION = 1;

// =============================================================================
// Git Utilities
// =============================================================================

export function getCurrentCommitHash(): string {
  const config = getConfig();
  try {
    return execSync('git rev-parse HEAD', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    throw new Error('Failed to get current commit hash');
  }
}

export function getBaselineCommitHash(): string | undefined {
  const config = getConfig();
  try {
    // Get the parent commit (baseline)
    return execSync('git rev-parse HEAD~1', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return undefined; // First commit has no parent
  }
}

// =============================================================================
// WIP Content Hashing
// =============================================================================

/**
 * Check if there are any uncommitted changes (staged or unstaged)
 */
function hasUncommittedChanges(): boolean {
  const config = getConfig();
  try {
    const output = execSync('git status --porcelain', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    });
    return output.trim().length > 0;
  } catch {
    // If git status fails, assume no changes (safe default)
    return false;
  }
}

/**
 * Build git pathspec from config
 */
function getCodePathspec(): string {
  const config = getConfig();
  return '-- ' + config.codePathspecs.join(' ');
}

/**
 * Check if a file path matches code patterns (affects quality)
 */
function isCodeFile(filePath: string): boolean {
  const config = getConfig();
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  // Check if file is in any of the configured code directories
  const isInCodeDir = config.codePathspecs.some((pathspec) =>
    filePath.startsWith(pathspec.replace(/\/$/, '') + '/')
  );
  const hasCodeExt = codeExtensions.some((ext) => filePath.endsWith(ext));

  // Also include specific config files that affect quality metrics
  const isQualityConfig = [
    'vitest.config.ts',
    'jest.config.ts',
    'sonar-project.properties',
    'rules.json',
  ].includes(filePath);

  return (isInCodeDir && hasCodeExt) || isQualityConfig;
}

/**
 * Compute a stable content hash from git diff + untracked files
 * Only includes source code files that affect quality metrics.
 * Changes to docs, config, etc. won't invalidate the cache.
 */
function computeContentHash(): string {
  const config = getConfig();
  const codePathspec = getCodePathspec();

  // Get diff of code file changes only (staged + unstaged vs HEAD)
  const trackedDiff = execSync(`git diff HEAD ${codePathspec}`, {
    cwd: config.projectRoot,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
  });

  // Get list of untracked files (not in .gitignore)
  const untrackedList = execSync('git ls-files --others --exclude-standard', {
    cwd: config.projectRoot,
    encoding: 'utf-8',
  }).trim();

  // Build content for untracked CODE files only
  let untrackedContent = '';
  if (untrackedList) {
    const files = untrackedList
      .split('\n')
      .filter((f) => f && isCodeFile(f))
      .sort();
    for (const file of files) {
      const fullPath = path.join(config.projectRoot, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        untrackedContent += `\n@@@ untracked: ${file} @@@\n`;
        try {
          untrackedContent += fs.readFileSync(fullPath, 'utf-8');
        } catch {
          // Skip files we can't read (binary, permissions, etc.)
          untrackedContent += '[unreadable]';
        }
      }
    }
  }

  // Combine and hash
  const combined = trackedDiff + untrackedContent;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Get the cache key for the current state
 * Returns commit hash for clean working tree, or wip:contentHash for uncommitted changes
 */
export function getCacheKey(): { key: string; isWIP: boolean } {
  if (!hasUncommittedChanges()) {
    return {
      key: getCurrentCommitHash(),
      isWIP: false,
    };
  }

  const contentHash = computeContentHash();
  return {
    key: `wip:${contentHash}`,
    isWIP: true,
  };
}

/**
 * Check if a cache key is a WIP content hash (vs a commit hash)
 */
export function isWIPKey(key: string): boolean {
  return key.startsWith('wip:');
}

// =============================================================================
// Cache I/O
// =============================================================================

function createEmptyCache(): QualityGateCache {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entries: {},
  };
}

function isValidCacheSchema(data: unknown): data is QualityGateCache {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    obj.schemaVersion === CURRENT_SCHEMA_VERSION &&
    typeof obj.entries === 'object' &&
    obj.entries !== null
  );
}

export function loadCache(): QualityGateCache {
  const config = getConfig();
  if (!fs.existsSync(config.cache.file)) {
    return createEmptyCache();
  }

  try {
    const content = fs.readFileSync(config.cache.file, 'utf-8');
    const data = JSON.parse(content) as unknown;

    if (isValidCacheSchema(data)) {
      return data;
    }

    // Schema mismatch - could implement migration here
    // For now, start fresh if schema version doesn't match
    console.error(
      `Cache schema version mismatch. Expected ${CURRENT_SCHEMA_VERSION}, got ${(data as Record<string, unknown>).schemaVersion}. Starting fresh.`
    );
    return createEmptyCache();
  } catch {
    console.error('Failed to load cache, starting fresh');
    return createEmptyCache();
  }
}

export function saveCache(cache: QualityGateCache): void {
  const config = getConfig();
  // Sort entries by commit hash for clean git diffs
  const sortedEntries: Record<string, CacheEntry> = {};
  const sortedKeys = Object.keys(cache.entries).sort();

  for (const key of sortedKeys) {
    sortedEntries[key] = cache.entries[key];
  }

  const sortedCache: QualityGateCache = {
    schemaVersion: cache.schemaVersion,
    entries: sortedEntries,
  };

  fs.writeFileSync(
    config.cache.file,
    JSON.stringify(sortedCache, null, 2) + '\n'
  );
}

// =============================================================================
// Cache Entry Operations
// =============================================================================

export function getCacheEntry(
  cache: QualityGateCache,
  commitHash: string
): CacheEntry | undefined {
  return cache.entries[commitHash];
}

export function setCacheEntry(
  cache: QualityGateCache,
  commitHash: string,
  entry: CacheEntry
): void {
  cache.entries[commitHash] = entry;
}

export function createCacheEntry(
  metrics: Metrics,
  rules: QualityRules,
  status: 'pass' | 'fail',
  failedRules: string[]
): CacheEntry {
  return {
    timestamp: Date.now(),
    rulesVersion: rules.version,
    rulesHash: computeRulesHash(rules),
    evaluation: {
      status,
      failedRules,
    },
    metrics,
  };
}

// =============================================================================
// Baseline Resolution
// =============================================================================

/**
 * Find the best baseline entry for comparison
 *
 * For WIP code: baseline is HEAD commit (the last committed state)
 * For committed code: baseline is HEAD~1 (parent commit)
 */
export function findBaselineEntry(
  cache: QualityGateCache,
  _rules: QualityRules,
  isWIP: boolean = false
): CacheEntry | undefined {
  if (isWIP) {
    // For WIP: baseline is HEAD commit (last committed state)
    const headCommit = getCurrentCommitHash();
    return cache.entries[headCommit];
  }

  // For committed code: baseline is HEAD~1
  const baselineHash = getBaselineCommitHash();

  if (!baselineHash) {
    return undefined;
  }

  const entry = cache.entries[baselineHash];

  if (!entry) {
    return undefined;
  }

  // Note: We still use old entries even if rules changed
  // The evaluation will be re-done, but we can compare metrics
  return entry;
}

// =============================================================================
// Cache Pruning
// =============================================================================

/**
 * Remove entries older than specified days to keep cache size manageable
 */
export function pruneOldEntries(
  cache: QualityGateCache,
  maxAgeDays: number = 90
): number {
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let pruned = 0;

  for (const [hash, entry] of Object.entries(cache.entries)) {
    if (entry.timestamp < cutoffTime) {
      delete cache.entries[hash];
      pruned++;
    }
  }

  return pruned;
}
