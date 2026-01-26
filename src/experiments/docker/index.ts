/**
 * Docker Experiment Infrastructure
 * =================================
 * Scaffolding and execution for dockerized agent experiments.
 *
 * @module experiments/docker
 */

// Types
export type {
  DockerExperimentDefinition,
  AgentConfig,
  TaskConfig,
  GateConfig,
  RunState,
  DockerExperimentRun,
  DockerRunResult,
  TrajectoryEvent,
  TrajectoryEventType,
  GateQueryEvent,
  SuggestionEvent,
  ExperimentDirectoryStructure,
  RunDirectoryStructure,
  ScaffoldOptions,
  InitRunOptions,
} from './types.js';

// Templates
export {
  generateDockerCompose,
  generateGateConfig,
  generateAgentConfig,
  generateExperimentDefinition,
  generateConditionConfigs,
  generateExperimentReadme,
  AGENT_DEFAULTS,
} from './templates.js';

// Scaffolding
export {
  generateId,
  getExperimentDirs,
  getRunDirs,
  createExperimentScaffold,
  initializeRun,
  cleanWorkspace,
  cloneToWorkspace,
  copyToWorkspace,
  listExperiments,
  listRuns,
  loadRun,
  updateRunState,
} from './scaffold.js';

// Runner
export type {
  DockerRunnerOptions,
  BatchRunOptions,
} from './runner.js';

export {
  executeDockerRun,
  executeBatchRuns,
  parseTrajectory,
  appendTrajectoryEvent,
} from './runner.js';

// Trajectory
export type {
  TrajectoryLogger,
  MCPTrajectoryConfig,
  TrajectorySummary,
  TrajectoryMetrics,
} from './trajectory.js';

export {
  createTrajectoryLogger,
  createNullLogger,
  withTrajectoryLogging,
  analyzeTrajectory,
  computeTrajectoryMetrics,
} from './trajectory.js';

// SWE-bench Evaluator
export type {
  EvaluationResult,
  EvaluatorConfig,
  PatchToEvaluate,
} from './evaluator.js';

export {
  getImageName,
  imageExists,
  pullImage,
  ensureImage,
  evaluatePatch,
  evaluatePatches,
  computeEvaluationStats,
  isDockerAvailable,
  getDockerInfo,
} from './evaluator.js';

// Real LLM Agent (unbiased, uses Docker evaluation)
export type { RealAgentConfig } from './real-agent.js';

export {
  createRealLLMAgent,
  convertToUnifiedDiff,
} from './real-agent.js';

// Quality-Gated Agent (uses reasoning quality gate before patch generation)
export type { QualityGatedAgentConfig } from './quality-gated-agent.js';

export {
  createQualityGatedAgent,
} from './quality-gated-agent.js';

// Code Extraction from Docker
export type {
  CodeExtractionResult,
  CodeExtractionConfig,
} from './code-extractor.js';

export {
  extractCodeFromDocker,
  withExtractedCode,
} from './code-extractor.js';
