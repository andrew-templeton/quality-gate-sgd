/**
 * Docker Experiment Runner
 * ========================
 * Orchestrates dockerized experiment runs with trajectory capture.
 *
 * The runner:
 * 1. Creates an ephemeral workspace
 * 2. Starts the docker-compose services (agent + gate)
 * 3. Monitors for completion
 * 4. Captures trajectory from MCP calls
 * 5. Cleans up on completion
 */
import type { DockerExperimentRun, RunState, TrajectoryEvent, RunDirectoryStructure } from './types.js';
/**
 * Options for running a docker experiment.
 */
export interface DockerRunnerOptions {
    /** Base directory for experiments */
    baseDir?: string;
    /** Timeout in milliseconds (default: 30 minutes) */
    timeout?: number;
    /** Whether to clean workspace on completion */
    cleanupOnComplete?: boolean;
    /** Whether to follow logs in real-time */
    followLogs?: boolean;
    /** Callback for state changes */
    onStateChange?: (state: RunState, run: DockerExperimentRun) => void;
    /** Callback for trajectory events */
    onTrajectoryEvent?: (event: TrajectoryEvent) => void;
    /** Callback for log output */
    onLog?: (service: string, message: string) => void;
}
/**
 * Parse trajectory file for final analysis.
 */
export declare function parseTrajectory(trajectoryPath: string): TrajectoryEvent[];
/**
 * Append an event to the trajectory log.
 */
export declare function appendTrajectoryEvent(runDirs: RunDirectoryStructure, event: Omit<TrajectoryEvent, 'eventId' | 'timestamp'>): void;
/**
 * Execute a docker experiment run.
 */
export declare function executeDockerRun(experimentId: string, runId: string, options?: DockerRunnerOptions): Promise<DockerExperimentRun>;
/**
 * Options for batch execution.
 */
export interface BatchRunOptions extends DockerRunnerOptions {
    /** Maximum parallel runs */
    parallelism?: number;
    /** Continue on individual run failure */
    continueOnFailure?: boolean;
    /** Callback for run completion */
    onRunComplete?: (run: DockerExperimentRun, index: number, total: number) => void;
}
/**
 * Execute multiple runs in batch.
 */
export declare function executeBatchRuns(runs: Array<{
    experimentId: string;
    runId: string;
}>, options?: BatchRunOptions): Promise<DockerExperimentRun[]>;
//# sourceMappingURL=runner.d.ts.map