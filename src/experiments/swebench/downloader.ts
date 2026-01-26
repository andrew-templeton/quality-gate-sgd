/**
 * SWE-bench Dataset Downloader
 * ============================
 * Downloads SWE-bench datasets from HuggingFace Datasets Server API.
 *
 * Available splits:
 * - dev: Development set (~23 instances from Lite)
 * - test: Full test set (~2294 instances)
 * - lite: Lightweight subset (~300 instances)
 * - verified: Human-verified subset (~500 instances)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatasetSplit, SWEBenchInstance } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * HuggingFace Datasets Server API configuration.
 * This API returns rows as JSON, avoiding the need for Parquet parsing.
 */
const DATASETS_API_BASE = 'https://datasets-server.huggingface.co';

/**
 * Dataset identifiers and splits on HuggingFace.
 */
const DATASET_CONFIG: Record<DatasetSplit, { dataset: string; split: string; maxRows: number }> = {
  dev: {
    dataset: 'SWE-bench/SWE-bench_Lite',
    split: 'dev',
    maxRows: 50,
  },
  test: {
    dataset: 'SWE-bench/SWE-bench',
    split: 'test',
    maxRows: 3000,
  },
  lite: {
    dataset: 'SWE-bench/SWE-bench_Lite',
    split: 'test',
    maxRows: 500,
  },
  verified: {
    dataset: 'SWE-bench/SWE-bench_Verified',
    split: 'test',
    maxRows: 600,
  },
};

/**
 * Default download directory.
 */
const DEFAULT_DATA_DIR = 'data/swe-bench';

/**
 * Batch size for API requests (HF limits to 100 rows per request).
 */
const BATCH_SIZE = 100;

// =============================================================================
// Types
// =============================================================================

/**
 * Download options.
 */
export interface DownloadOptions {
  /** Target directory for downloaded files */
  dataDir?: string;
  /** Force re-download even if file exists */
  force?: boolean;
  /** Progress callback */
  onProgress?: (downloaded: number, total: number | null) => void;
  /** Timeout in ms (default: 5 minutes) */
  timeout?: number;
}

/**
 * Download result.
 */
export interface DownloadResult {
  /** Whether download succeeded */
  success: boolean;
  /** Path to downloaded file */
  filePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of instances in file */
  instanceCount: number;
  /** Download duration in ms */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Whether file was cached (already existed) */
  cached: boolean;
}

/**
 * HuggingFace Datasets Server API response.
 */
interface RowsAPIResponse {
  features: Array<{ name: string; type: unknown }>;
  rows: Array<{ row_idx: number; row: Record<string, unknown> }>;
  num_rows_total: number;
  num_rows_per_page: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch rows from HuggingFace Datasets Server API.
 */
async function fetchRows(
  dataset: string,
  split: string,
  offset: number,
  length: number,
  timeout: number
): Promise<RowsAPIResponse> {
  const url = new URL(`${DATASETS_API_BASE}/rows`);
  url.searchParams.set('dataset', dataset);
  url.searchParams.set('config', 'default');
  url.searchParams.set('split', split);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('length', String(length));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'quality-gate-sgd/0.1.0',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    return await response.json() as RowsAPIResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert API row to SWEBenchInstance format.
 */
function rowToInstance(row: Record<string, unknown>): SWEBenchInstance {
  return {
    instance_id: row.instance_id as string,
    repo: row.repo as string,
    base_commit: row.base_commit as string,
    problem_statement: row.problem_statement as string,
    hints_text: row.hints_text as string | undefined,
    created_at: row.created_at as string,
    patch: row.patch as string,
    test_patch: row.test_patch as string,
    version: row.version as string | undefined,
    environment_setup_commit: row.environment_setup_commit as string | undefined,
    FAIL_TO_PASS: row.FAIL_TO_PASS as string,
    PASS_TO_PASS: row.PASS_TO_PASS as string,
  };
}

// =============================================================================
// Downloader Implementation
// =============================================================================

/**
 * Download a SWE-bench split.
 */
export async function downloadSplit(
  split: DatasetSplit,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const {
    dataDir = DEFAULT_DATA_DIR,
    force = false,
    onProgress,
    timeout = 60 * 1000, // 1 minute per batch
  } = options;

  const startTime = Date.now();
  const fileName = `${split}.jsonl`;
  const filePath = path.resolve(dataDir, fileName);

  // Check if already exists
  if (!force && fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const instanceCount = content.split('\n').filter(line => line.trim()).length;

    return {
      success: true,
      filePath,
      sizeBytes: stats.size,
      instanceCount,
      durationMs: Date.now() - startTime,
      cached: true,
    };
  }

  // Ensure directory exists
  fs.mkdirSync(dataDir, { recursive: true });

  const config = DATASET_CONFIG[split];
  const instances: SWEBenchInstance[] = [];

  try {
    // First request to get total count
    const firstBatch = await fetchRows(config.dataset, config.split, 0, BATCH_SIZE, timeout);
    const totalRows = Math.min(firstBatch.num_rows_total, config.maxRows);

    // Add first batch
    for (const item of firstBatch.rows) {
      instances.push(rowToInstance(item.row));
    }

    onProgress?.(instances.length, totalRows);

    // Fetch remaining batches
    let offset = BATCH_SIZE;
    while (offset < totalRows) {
      const batchSize = Math.min(BATCH_SIZE, totalRows - offset);
      const batch = await fetchRows(config.dataset, config.split, offset, batchSize, timeout);

      for (const item of batch.rows) {
        instances.push(rowToInstance(item.row));
      }

      offset += batchSize;
      onProgress?.(instances.length, totalRows);
    }

    // Write as JSONL
    const jsonlContent = instances.map(inst => JSON.stringify(inst)).join('\n') + '\n';
    fs.writeFileSync(filePath, jsonlContent, 'utf-8');

    const stats = fs.statSync(filePath);

    return {
      success: true,
      filePath,
      sizeBytes: stats.size,
      instanceCount: instances.length,
      durationMs: Date.now() - startTime,
      cached: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      filePath,
      sizeBytes: 0,
      instanceCount: 0,
      durationMs: Date.now() - startTime,
      error: errorMessage,
      cached: false,
    };
  }
}

/**
 * Download multiple splits.
 */
export async function downloadSplits(
  splits: DatasetSplit[],
  options: DownloadOptions = {}
): Promise<Map<DatasetSplit, DownloadResult>> {
  const results = new Map<DatasetSplit, DownloadResult>();

  for (const split of splits) {
    const result = await downloadSplit(split, options);
    results.set(split, result);
  }

  return results;
}

/**
 * Download all available splits.
 */
export async function downloadAll(
  options: DownloadOptions = {}
): Promise<Map<DatasetSplit, DownloadResult>> {
  const allSplits: DatasetSplit[] = ['dev', 'test', 'lite', 'verified'];
  return downloadSplits(allSplits, options);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check which splits are available locally.
 */
export function checkLocalSplits(dataDir = DEFAULT_DATA_DIR): Record<DatasetSplit, boolean> {
  const splits: DatasetSplit[] = ['dev', 'test', 'lite', 'verified'];
  const result: Record<DatasetSplit, boolean> = {
    dev: false,
    test: false,
    lite: false,
    verified: false,
  };

  for (const split of splits) {
    const filePath = path.resolve(dataDir, `${split}.jsonl`);
    result[split] = fs.existsSync(filePath);
  }

  return result;
}

/**
 * Get local file path for a split.
 */
export function getLocalPath(split: DatasetSplit, dataDir = DEFAULT_DATA_DIR): string {
  return path.resolve(dataDir, `${split}.jsonl`);
}

/**
 * Get dataset info without loading full content.
 */
export function getDatasetInfo(split: DatasetSplit, dataDir = DEFAULT_DATA_DIR): {
  exists: boolean;
  filePath: string;
  sizeBytes: number;
  instanceCount: number;
} | null {
  const filePath = getLocalPath(split, dataDir);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stats = fs.statSync(filePath);

  // Quick line count without loading full file into memory
  let instanceCount = 0;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (line.trim()) instanceCount++;
  }

  return {
    exists: true,
    filePath,
    sizeBytes: stats.size,
    instanceCount,
  };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Create a progress bar string.
 */
export function progressBar(current: number, total: number | null, width = 30): string {
  if (total === null || total === 0) {
    return `${current} rows downloaded`;
  }

  const percent = Math.min(100, Math.floor((current / total) * 100));
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percent}% (${current}/${total} rows)`;
}
