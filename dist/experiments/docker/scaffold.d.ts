/**
 * Experiment Scaffolding
 * ======================
 * Creates and manages experiment directory structures.
 * Each experiment gets its own self-contained directory with all necessary files.
 */
import type { DockerExperimentDefinition, DockerExperimentRun, ExperimentDirectoryStructure, RunDirectoryStructure, ScaffoldOptions, InitRunOptions } from './types.js';
/**
 * Generate a unique ID for experiments or runs.
 */
export declare function generateId(prefix?: string): string;
/**
 * Get the directory structure for an experiment.
 */
export declare function getExperimentDirs(experimentId: string, baseDir?: string): ExperimentDirectoryStructure;
/**
 * Get the directory structure for a single run.
 */
export declare function getRunDirs(experimentDirs: ExperimentDirectoryStructure, runId: string): RunDirectoryStructure;
/**
 * Create a new experiment scaffold.
 * Creates the directory structure and all template files.
 */
export declare function createExperimentScaffold(options: ScaffoldOptions): ExperimentDirectoryStructure;
/**
 * Initialize a new run for an experiment.
 * Creates a clean workspace directory and all run-specific files.
 */
export declare function initializeRun(options: InitRunOptions): DockerExperimentRun;
/**
 * Clean a run's workspace directory.
 * Call this before starting a new run to ensure a fresh state.
 */
export declare function cleanWorkspace(runDirs: RunDirectoryStructure): void;
/**
 * Clone a repository into the workspace.
 */
export declare function cloneToWorkspace(runDirs: RunDirectoryStructure, repo: {
    url: string;
    branch?: string;
    commit?: string;
}): Promise<void>;
/**
 * Copy files into the workspace.
 */
export declare function copyToWorkspace(runDirs: RunDirectoryStructure, files: Array<{
    source: string;
    dest?: string;
}>): void;
/**
 * List all experiments in the base directory.
 */
export declare function listExperiments(baseDir?: string): DockerExperimentDefinition[];
/**
 * List all runs for an experiment.
 */
export declare function listRuns(experimentId: string, baseDir?: string): DockerExperimentRun[];
/**
 * Load a specific run.
 */
export declare function loadRun(experimentId: string, runId: string, baseDir?: string): DockerExperimentRun | null;
/**
 * Update run state.
 */
export declare function updateRunState(experimentId: string, runId: string, updates: Partial<DockerExperimentRun>, baseDir?: string): DockerExperimentRun;
//# sourceMappingURL=scaffold.d.ts.map