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
import type { DatasetSplit } from './types.js';
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
 * Download a SWE-bench split.
 */
export declare function downloadSplit(split: DatasetSplit, options?: DownloadOptions): Promise<DownloadResult>;
/**
 * Download multiple splits.
 */
export declare function downloadSplits(splits: DatasetSplit[], options?: DownloadOptions): Promise<Map<DatasetSplit, DownloadResult>>;
/**
 * Download all available splits.
 */
export declare function downloadAll(options?: DownloadOptions): Promise<Map<DatasetSplit, DownloadResult>>;
/**
 * Check which splits are available locally.
 */
export declare function checkLocalSplits(dataDir?: string): Record<DatasetSplit, boolean>;
/**
 * Get local file path for a split.
 */
export declare function getLocalPath(split: DatasetSplit, dataDir?: string): string;
/**
 * Get dataset info without loading full content.
 */
export declare function getDatasetInfo(split: DatasetSplit, dataDir?: string): {
    exists: boolean;
    filePath: string;
    sizeBytes: number;
    instanceCount: number;
} | null;
/**
 * Format bytes to human-readable string.
 */
export declare function formatBytes(bytes: number): string;
/**
 * Create a progress bar string.
 */
export declare function progressBar(current: number, total: number | null, width?: number): string;
//# sourceMappingURL=downloader.d.ts.map