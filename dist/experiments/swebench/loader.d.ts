/**
 * SWE-bench Task Loader
 * =====================
 * Utilities for loading and processing SWE-bench dataset tasks.
 *
 * Supports:
 * - Loading from local JSONL files
 * - Filtering by repo, difficulty, instance ID
 * - Converting to ExperimentTask format
 */
import type { SWEBenchInstance, SWEBenchTask, DatasetOptions, DatasetMetadata } from './types.js';
/**
 * Load SWE-bench tasks from a local file.
 */
export declare function loadFromFile(filePath: string): SWEBenchInstance[];
/**
 * Load tasks with filtering and processing.
 */
export declare function loadTasks(options?: DatasetOptions): {
    tasks: SWEBenchTask[];
    metadata: DatasetMetadata;
};
/**
 * Convert a raw SWE-bench instance to an ExperimentTask.
 */
export declare function instanceToTask(instance: SWEBenchInstance, difficulty?: 'easy' | 'medium' | 'hard'): SWEBenchTask;
/**
 * Filter tasks by repository.
 */
export declare function filterByRepo(tasks: SWEBenchTask[], repos: string[]): SWEBenchTask[];
/**
 * Filter tasks by minimum test count.
 */
export declare function filterByTestCount(tasks: SWEBenchTask[], minTests: number): SWEBenchTask[];
/**
 * Stratified sample by repository.
 */
export declare function stratifiedSample(tasks: SWEBenchTask[], tasksPerRepo: number, seed?: number): SWEBenchTask[];
/**
 * Get unique repositories from tasks.
 */
export declare function getUniqueRepos(tasks: SWEBenchTask[]): string[];
/**
 * Group tasks by repository.
 */
export declare function groupByRepo(tasks: SWEBenchTask[]): Map<string, SWEBenchTask[]>;
/**
 * Compute dataset statistics.
 */
export declare function computeDatasetStats(tasks: SWEBenchTask[]): {
    totalTasks: number;
    totalRepos: number;
    avgTestsPerTask: number;
    tasksPerRepo: Record<string, number>;
};
//# sourceMappingURL=loader.d.ts.map