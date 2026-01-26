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
const DATASET_CONFIG = {
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
// API Functions
// =============================================================================
/**
 * Fetch rows from HuggingFace Datasets Server API.
 */
async function fetchRows(dataset, split, offset, length, timeout) {
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
        return await response.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Convert API row to SWEBenchInstance format.
 */
function rowToInstance(row) {
    return {
        instance_id: row.instance_id,
        repo: row.repo,
        base_commit: row.base_commit,
        problem_statement: row.problem_statement,
        hints_text: row.hints_text,
        created_at: row.created_at,
        patch: row.patch,
        test_patch: row.test_patch,
        version: row.version,
        environment_setup_commit: row.environment_setup_commit,
        FAIL_TO_PASS: row.FAIL_TO_PASS,
        PASS_TO_PASS: row.PASS_TO_PASS,
    };
}
// =============================================================================
// Downloader Implementation
// =============================================================================
/**
 * Download a SWE-bench split.
 */
export async function downloadSplit(split, options = {}) {
    const { dataDir = DEFAULT_DATA_DIR, force = false, onProgress, timeout = 60 * 1000, // 1 minute per batch
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
    const instances = [];
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
    }
    catch (error) {
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
export async function downloadSplits(splits, options = {}) {
    const results = new Map();
    for (const split of splits) {
        const result = await downloadSplit(split, options);
        results.set(split, result);
    }
    return results;
}
/**
 * Download all available splits.
 */
export async function downloadAll(options = {}) {
    const allSplits = ['dev', 'test', 'lite', 'verified'];
    return downloadSplits(allSplits, options);
}
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Check which splits are available locally.
 */
export function checkLocalSplits(dataDir = DEFAULT_DATA_DIR) {
    const splits = ['dev', 'test', 'lite', 'verified'];
    const result = {
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
export function getLocalPath(split, dataDir = DEFAULT_DATA_DIR) {
    return path.resolve(dataDir, `${split}.jsonl`);
}
/**
 * Get dataset info without loading full content.
 */
export function getDatasetInfo(split, dataDir = DEFAULT_DATA_DIR) {
    const filePath = getLocalPath(split, dataDir);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const stats = fs.statSync(filePath);
    // Quick line count without loading full file into memory
    let instanceCount = 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
        if (line.trim())
            instanceCount++;
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
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
/**
 * Create a progress bar string.
 */
export function progressBar(current, total, width = 30) {
    if (total === null || total === 0) {
        return `${current} rows downloaded`;
    }
    const percent = Math.min(100, Math.floor((current / total) * 100));
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percent}% (${current}/${total} rows)`;
}
//# sourceMappingURL=downloader.js.map