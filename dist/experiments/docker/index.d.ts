/**
 * Docker Experiment Infrastructure
 * =================================
 * Scaffolding and execution for dockerized agent experiments.
 *
 * @module experiments/docker
 */
export type { DockerExperimentDefinition, AgentConfig, TaskConfig, GateConfig, RunState, DockerExperimentRun, DockerRunResult, TrajectoryEvent, TrajectoryEventType, GateQueryEvent, SuggestionEvent, ExperimentDirectoryStructure, RunDirectoryStructure, ScaffoldOptions, InitRunOptions, } from './types.js';
export { generateDockerCompose, generateGateConfig, generateAgentConfig, generateExperimentDefinition, generateConditionConfigs, generateExperimentReadme, AGENT_DEFAULTS, } from './templates.js';
export { generateId, getExperimentDirs, getRunDirs, createExperimentScaffold, initializeRun, cleanWorkspace, cloneToWorkspace, copyToWorkspace, listExperiments, listRuns, loadRun, updateRunState, } from './scaffold.js';
export type { DockerRunnerOptions, BatchRunOptions, } from './runner.js';
export { executeDockerRun, executeBatchRuns, parseTrajectory, appendTrajectoryEvent, } from './runner.js';
export type { TrajectoryLogger, MCPTrajectoryConfig, TrajectorySummary, TrajectoryMetrics, } from './trajectory.js';
export { createTrajectoryLogger, createNullLogger, withTrajectoryLogging, analyzeTrajectory, computeTrajectoryMetrics, } from './trajectory.js';
export type { EvaluationResult, EvaluatorConfig, PatchToEvaluate, } from './evaluator.js';
export { getImageName, imageExists, pullImage, ensureImage, evaluatePatch, evaluatePatches, computeEvaluationStats, isDockerAvailable, getDockerInfo, } from './evaluator.js';
export type { RealAgentConfig } from './real-agent.js';
export { createRealLLMAgent, convertToUnifiedDiff, } from './real-agent.js';
export type { QualityGatedAgentConfig } from './quality-gated-agent.js';
export { createQualityGatedAgent, } from './quality-gated-agent.js';
export type { CodeExtractionResult, CodeExtractionConfig, } from './code-extractor.js';
export { extractCodeFromDocker, withExtractedCode, } from './code-extractor.js';
//# sourceMappingURL=index.d.ts.map