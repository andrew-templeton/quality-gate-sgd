/**
 * Docker Experiment Types
 * =======================
 * Types for running experiments with dockerized agents (SWE-agent, Aider, etc.)
 *
 * Key insight: Dockerized agents run autonomously - the gate acts as an MCP server
 * that the agent queries, rather than controlling iteration flow directly.
 */

import type { ExperimentDesign, ExperimentConfig, ExperimentCondition } from '../types.js';

// =============================================================================
// Experiment Definition
// =============================================================================

/**
 * Definition of a docker-based experiment.
 * Each experiment has its own directory with all necessary files.
 */
export interface DockerExperimentDefinition {
  /** Unique experiment identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Experiment design being tested */
  design: ExperimentDesign;
  /** Agent configuration */
  agent: AgentConfig;
  /** Task configuration */
  task: TaskConfig;
  /** Gate MCP server configuration */
  gate: GateConfig;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Agent-specific configuration.
 */
export interface AgentConfig {
  /** Agent type (e.g., "swe-agent", "aider", "custom") */
  type: string;
  /** Docker image to use */
  image: string;
  /** Environment variables for the agent container */
  env?: Record<string, string>;
  /** Volume mounts (host:container paths) */
  volumes?: string[];
  /** Container resource limits */
  resources?: {
    memory?: string;
    cpus?: string;
  };
  /** Command override */
  command?: string[];
  /** Working directory inside container */
  workdir?: string;
}

/**
 * Task configuration for SWE-bench or similar benchmarks.
 */
export interface TaskConfig {
  /** Task source (e.g., "swe-bench", "custom") */
  source: string;
  /** Task identifier */
  taskId: string;
  /** Repository to clone */
  repo?: {
    url: string;
    branch?: string;
    commit?: string;
  };
  /** Problem statement / task description */
  problemStatement?: string;
  /** Test command to run for evaluation */
  testCommand?: string;
  /** Files to include in workspace */
  files?: string[];
}

/**
 * Gate MCP server configuration.
 */
export interface GateConfig {
  /** Port for MCP server */
  port: number;
  /** Experiment condition for this run */
  condition: ExperimentCondition;
  /** Metrics extraction settings */
  metrics?: {
    /** Coverage report path (relative to workspace) */
    coveragePath?: string;
    /** TypeScript config path */
    tsconfigPath?: string;
    /** ESLint config path */
    eslintConfigPath?: string;
  };
  /** How often to auto-evaluate (ms, 0 = only on request) */
  autoEvaluateInterval?: number;
}

// =============================================================================
// Run State
// =============================================================================

/**
 * State of a docker experiment run.
 */
export type RunState =
  | 'pending'      // Created but not started
  | 'initializing' // Setting up workspace
  | 'running'      // Agent is executing
  | 'evaluating'   // Final evaluation in progress
  | 'completed'    // Finished successfully
  | 'failed'       // Finished with error
  | 'cancelled';   // Manually stopped

/**
 * Record of an active or completed docker experiment run.
 */
export interface DockerExperimentRun {
  /** Run identifier */
  runId: string;
  /** Parent experiment */
  experimentId: string;
  /** Current state */
  state: RunState;
  /** Directory containing this run */
  runDir: string;
  /** Start timestamp */
  startedAt?: number;
  /** End timestamp */
  endedAt?: number;
  /** Container ID (while running) */
  containerId?: string;
  /** Error message (if failed) */
  error?: string;
  /** Final result */
  result?: DockerRunResult;
}

/**
 * Result of a docker experiment run.
 */
export interface DockerRunResult {
  /** Whether the task was completed successfully */
  taskCompleted: boolean;
  /** Whether the gate passed */
  gatePassed: boolean;
  /** Final quality score */
  finalScore: number;
  /** Number of gate queries */
  gateQueries: number;
  /** Number of suggestions taken */
  suggestionsTaken: number;
  /** Total run duration (ms) */
  durationMs: number;
  /** Agent exit code */
  agentExitCode: number;
  /** Test results */
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

// =============================================================================
// Trajectory Capture
// =============================================================================

/**
 * A single event in the trajectory log.
 * Captures all MCP tool calls and their results.
 */
export interface TrajectoryEvent {
  /** Unique event ID */
  eventId: string;
  /** Event timestamp */
  timestamp: number;
  /** Event type */
  type: TrajectoryEventType;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Types of trajectory events we capture.
 */
export type TrajectoryEventType =
  | 'run_started'
  | 'run_ended'
  | 'gate_query'        // Agent queried gate status
  | 'suggestion_request' // Agent requested suggestions
  | 'suggestion_received'
  | 'metrics_extracted'
  | 'evaluation_completed'
  | 'file_modified'      // Agent modified a file
  | 'test_run'           // Agent ran tests
  | 'error';

/**
 * Gate query event data.
 */
export interface GateQueryEvent extends TrajectoryEvent {
  type: 'gate_query';
  data: {
    qualityScore: number;
    passed: boolean;
    metrics: Record<string, number>;
    condition: string;
  };
}

/**
 * Suggestion request event data.
 */
export interface SuggestionEvent extends TrajectoryEvent {
  type: 'suggestion_received';
  data: {
    suggestions: Array<{
      type: string;
      id: string;
      expectedDeltaQ: number;
    }>;
    gateEnabled: boolean;
  };
}

// =============================================================================
// Directory Structure
// =============================================================================

/**
 * Standard directory structure for an experiment.
 */
export interface ExperimentDirectoryStructure {
  /** Root experiment directory */
  root: string;
  /** Experiment definition file */
  definition: string;  // experiment.json
  /** Templates directory */
  templates: string;
  /** Configs for each condition */
  configs: string;
  /** Runs directory (transient) */
  runs: string;
}

/**
 * Standard directory structure for a single run.
 */
export interface RunDirectoryStructure {
  /** Root run directory */
  root: string;
  /** Workspace directory (cloned repo, transient) */
  workspace: string;
  /** Logs directory */
  logs: string;
  /** Trajectory log file */
  trajectory: string;  // logs/trajectory.jsonl
  /** Result file */
  result: string;      // result.json
  /** Docker compose file */
  compose: string;     // docker-compose.yml
  /** Gate config file */
  gateConfig: string;  // gate-config.json
}

// =============================================================================
// Scaffold Options
// =============================================================================

/**
 * Options for creating a new experiment scaffold.
 */
export interface ScaffoldOptions {
  /** Base directory for experiments */
  baseDir?: string;
  /** Experiment name */
  name: string;
  /** Description */
  description?: string;
  /** Experiment design */
  design: ExperimentDesign;
  /** Agent type to use */
  agentType: 'swe-agent' | 'aider' | 'custom';
  /** Custom agent image (for custom type) */
  customImage?: string;
  /** Task source */
  taskSource: 'swe-bench' | 'custom';
  /** Include example task */
  includeExample?: boolean;
}

/**
 * Options for initializing a run.
 */
export interface InitRunOptions {
  /** Experiment to run */
  experimentId: string;
  /** Condition name to use */
  conditionName: string;
  /** Task ID to run */
  taskId: string;
  /** Custom run ID (auto-generated if not provided) */
  runId?: string;
  /** Whether to clean workspace after run */
  cleanupOnComplete?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Base directory for experiments */
  baseDir?: string;
}
