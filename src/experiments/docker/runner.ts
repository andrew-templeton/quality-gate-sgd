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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type {
  DockerExperimentRun,
  DockerRunResult,
  RunState,
  TrajectoryEvent,
  RunDirectoryStructure,
} from './types.js';
import {
  getExperimentDirs,
  getRunDirs,
  loadRun,
  updateRunState,
  cleanWorkspace,
  cloneToWorkspace,
} from './scaffold.js';

// =============================================================================
// Runner Options
// =============================================================================

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

// =============================================================================
// Docker Compose Control
// =============================================================================

/**
 * Start docker-compose services.
 */
async function dockerComposeUp(
  runDirs: RunDirectoryStructure,
  options: DockerRunnerOptions
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker-compose', ['-f', runDirs.compose, 'up'], {
      cwd: runDirs.root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle stdout/stderr
    if (options.followLogs) {
      proc.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            // Parse docker-compose log format: "service_1 | message"
            const match = line.match(/^(\w+)_?\d*\s*\|\s*(.*)$/);
            if (match) {
              options.onLog?.(match[1], match[2]);
            } else {
              options.onLog?.('compose', line);
            }
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        options.onLog?.('compose-error', data.toString());
      });
    }

    // Wait a bit for services to start
    setTimeout(() => {
      if (proc.exitCode === null) {
        resolve(proc);
      } else {
        reject(new Error(`docker-compose exited with code ${proc.exitCode}`));
      }
    }, 5000);

    proc.on('error', reject);
  });
}

/**
 * Stop docker-compose services.
 */
async function dockerComposeDown(runDirs: RunDirectoryStructure): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker-compose', ['-f', runDirs.compose, 'down', '-v'], {
      cwd: runDirs.root,
      stdio: 'ignore',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker-compose down failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Get container status.
 */
async function getContainerStatus(
  runDirs: RunDirectoryStructure
): Promise<{ agent: string; gate: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker-compose', ['-f', runDirs.compose, 'ps', '--format', 'json'], {
      cwd: runDirs.root,
    });

    let output = '';
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ agent: 'unknown', gate: 'unknown' });
        return;
      }

      try {
        const services = output.trim().split('\n').map(line => JSON.parse(line));
        const status = { agent: 'unknown', gate: 'unknown' };
        for (const service of services) {
          if (service.Service === 'agent') {
            status.agent = service.State;
          } else if (service.Service === 'gate') {
            status.gate = service.State;
          }
        }
        resolve(status);
      } catch {
        resolve({ agent: 'unknown', gate: 'unknown' });
      }
    });

    proc.on('error', () => {
      resolve({ agent: 'unknown', gate: 'unknown' });
    });
  });
}

// =============================================================================
// Trajectory Watching
// =============================================================================

/**
 * Watch trajectory file for new events.
 */
function watchTrajectory(
  runDirs: RunDirectoryStructure,
  onEvent: (event: TrajectoryEvent) => void
): fs.FSWatcher {
  let lastSize = 0;

  const watcher = fs.watch(runDirs.logs, (eventType, filename) => {
    if (filename !== 'trajectory.jsonl') return;

    const stats = fs.statSync(runDirs.trajectory);
    if (stats.size <= lastSize) return;

    // Read new content
    const content = fs.readFileSync(runDirs.trajectory, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    // Parse new events
    for (let i = Math.floor(lastSize / 100); i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]) as TrajectoryEvent;
        onEvent(event);
      } catch {
        // Skip invalid lines
      }
    }

    lastSize = stats.size;
  });

  return watcher;
}

/**
 * Parse trajectory file for final analysis.
 */
export function parseTrajectory(trajectoryPath: string): TrajectoryEvent[] {
  if (!fs.existsSync(trajectoryPath)) {
    return [];
  }

  const content = fs.readFileSync(trajectoryPath, 'utf-8');
  const events: TrajectoryEvent[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip invalid lines
    }
  }

  return events;
}

/**
 * Append an event to the trajectory log.
 */
export function appendTrajectoryEvent(
  runDirs: RunDirectoryStructure,
  event: Omit<TrajectoryEvent, 'eventId' | 'timestamp'>
): void {
  const fullEvent: TrajectoryEvent = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...event,
  };

  fs.appendFileSync(runDirs.trajectory, JSON.stringify(fullEvent) + '\n');
}

// =============================================================================
// Run Execution
// =============================================================================

/**
 * Execute a docker experiment run.
 */
export async function executeDockerRun(
  experimentId: string,
  runId: string,
  options: DockerRunnerOptions = {}
): Promise<DockerExperimentRun> {
  const {
    baseDir,
    timeout = 30 * 60 * 1000, // 30 minutes
    cleanupOnComplete = true,
    followLogs = false,
    onStateChange,
    onTrajectoryEvent,
    onLog,
  } = options;

  // Load run
  const run = loadRun(experimentId, runId, baseDir);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const experimentDirs = getExperimentDirs(experimentId, baseDir);
  const runDirs = getRunDirs(experimentDirs, runId);

  // Helper to update state
  const setState = (state: RunState, updates?: Partial<DockerExperimentRun>) => {
    const updated = updateRunState(experimentId, runId, { state, ...updates }, baseDir);
    onStateChange?.(state, updated);
    return updated;
  };

  let composeProc: ChildProcess | null = null;
  let trajectoryWatcher: fs.FSWatcher | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    // Initialize
    setState('initializing', { startedAt: Date.now() });

    // Clean and prepare workspace
    cleanWorkspace(runDirs);

    // Log run start
    appendTrajectoryEvent(runDirs, {
      type: 'run_started',
      data: { experimentId, runId },
    });

    // Check if we need to clone a repo
    const definition = JSON.parse(
      fs.readFileSync(experimentDirs.definition, 'utf-8')
    );

    if (definition.task.repo) {
      await cloneToWorkspace(runDirs, definition.task.repo);
    }

    // Start services
    setState('running');
    composeProc = await dockerComposeUp(runDirs, { followLogs, onLog });

    // Watch trajectory
    if (onTrajectoryEvent) {
      trajectoryWatcher = watchTrajectory(runDirs, onTrajectoryEvent);
    }

    // Set timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Run timed out after ${timeout}ms`));
      }, timeout);
    });

    // Wait for completion
    const completionPromise = waitForCompletion(composeProc, runDirs);

    await Promise.race([completionPromise, timeoutPromise]);

    // Get result from trajectory
    const result = computeResult(runDirs);

    // Log run end
    appendTrajectoryEvent(runDirs, {
      type: 'run_ended',
      data: { result },
    });

    // Update final state
    setState('completed', {
      endedAt: Date.now(),
      result,
    });

    return loadRun(experimentId, runId, baseDir)!;
  } catch (error) {
    // Log error
    appendTrajectoryEvent(runDirs, {
      type: 'error',
      data: { message: error instanceof Error ? error.message : String(error) },
    });

    setState('failed', {
      endedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  } finally {
    // Cleanup
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (trajectoryWatcher) {
      trajectoryWatcher.close();
    }

    if (composeProc) {
      try {
        await dockerComposeDown(runDirs);
      } catch {
        // Ignore cleanup errors
      }
    }

    if (cleanupOnComplete) {
      try {
        fs.rmSync(runDirs.workspace, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Wait for the docker-compose run to complete.
 */
async function waitForCompletion(
  composeProc: ChildProcess,
  runDirs: RunDirectoryStructure
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Poll for agent container exit
    const pollInterval = setInterval(async () => {
      const status = await getContainerStatus(runDirs);

      if (status.agent === 'exited' || status.agent === 'dead') {
        clearInterval(pollInterval);
        resolve();
      }
    }, 5000);

    // Also watch for compose process exit
    composeProc.on('close', (code) => {
      clearInterval(pollInterval);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker-compose exited with code ${code}`));
      }
    });

    composeProc.on('error', (err) => {
      clearInterval(pollInterval);
      reject(err);
    });
  });
}

/**
 * Compute result from trajectory events.
 */
function computeResult(runDirs: RunDirectoryStructure): DockerRunResult {
  const events = parseTrajectory(runDirs.trajectory);

  // Find gate queries
  const gateQueries = events.filter(e => e.type === 'gate_query');
  const suggestions = events.filter(e => e.type === 'suggestion_received');

  // Get final state from last gate query
  const lastGateQuery = gateQueries[gateQueries.length - 1];
  const finalScore = (lastGateQuery?.data?.qualityScore as number) ?? 0;
  const gatePassed = (lastGateQuery?.data?.passed as boolean) ?? false;

  // Calculate duration
  const runStart = events.find(e => e.type === 'run_started');
  const runEnd = events.find(e => e.type === 'run_ended');
  const durationMs = runEnd && runStart
    ? runEnd.timestamp - runStart.timestamp
    : 0;

  return {
    taskCompleted: gatePassed,
    gatePassed,
    finalScore,
    gateQueries: gateQueries.length,
    suggestionsTaken: suggestions.length,
    durationMs,
    agentExitCode: 0, // Would need to capture from container
  };
}

// =============================================================================
// Batch Execution
// =============================================================================

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
export async function executeBatchRuns(
  runs: Array<{ experimentId: string; runId: string }>,
  options: BatchRunOptions = {}
): Promise<DockerExperimentRun[]> {
  const {
    parallelism = 1,
    continueOnFailure = true,
    onRunComplete,
    ...runOptions
  } = options;

  const results: DockerExperimentRun[] = [];
  const total = runs.length;

  if (parallelism <= 1) {
    // Sequential execution
    for (let i = 0; i < runs.length; i++) {
      const { experimentId, runId } = runs[i];
      try {
        const result = await executeDockerRun(experimentId, runId, runOptions);
        results.push(result);
        onRunComplete?.(result, i, total);
      } catch (error) {
        if (!continueOnFailure) {
          throw error;
        }
        console.error(`Run ${runId} failed:`, error);
      }
    }
  } else {
    // Parallel execution with limited concurrency
    const queue = [...runs];
    const executing: Promise<void>[] = [];
    let completed = 0;

    const processNext = async () => {
      while (queue.length > 0 && executing.length < parallelism) {
        const run = queue.shift()!;
        const index = runs.indexOf(run);

        const promise = (async () => {
          try {
            const result = await executeDockerRun(run.experimentId, run.runId, runOptions);
            results.push(result);
            onRunComplete?.(result, completed++, total);
          } catch (error) {
            if (!continueOnFailure) {
              throw error;
            }
            console.error(`Run ${run.runId} failed:`, error);
          }
        })();

        executing.push(promise);
        promise.finally(() => {
          executing.splice(executing.indexOf(promise), 1);
          processNext();
        });
      }
    };

    await processNext();
    await Promise.all(executing);
  }

  return results;
}
