/**
 * SWE-bench Integration
 * =====================
 * Task loading, evaluation, and integration utilities for running
 * experiments on the SWE-bench benchmark.
 *
 * @module experiments/swebench
 */
export type { SWEBenchInstance, SWEBenchTask, TestSpec, DatasetSplit, DatasetOptions, DatasetMetadata, EvaluationResult, EvaluationOptions, PatchResult, PatchOptions, RepoSetupResult, RepoSetupOptions, TestResult, } from './types.js';
export { loadFromFile, loadTasks, instanceToTask, filterByRepo, filterByTestCount, stratifiedSample, getUniqueRepos, groupByRepo, computeDatasetStats, } from './loader.js';
export { setupRepository, cleanupRepository, applyPatch, applyGoldPatch, applyTestPatch, reverseGoldPatch, evaluateTask, evaluateTaskFull, verifyGoldPatch, evaluateBatch, summarizeEvaluations, } from './evaluator.js';
export type { DownloadOptions, DownloadResult } from './downloader.js';
export { downloadSplit, downloadSplits, downloadAll, checkLocalSplits, getLocalPath, getDatasetInfo, formatBytes, progressBar, } from './downloader.js';
//# sourceMappingURL=index.d.ts.map