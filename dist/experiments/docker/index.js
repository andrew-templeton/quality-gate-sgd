/**
 * Docker Experiment Infrastructure
 * =================================
 * Scaffolding and execution for dockerized agent experiments.
 *
 * @module experiments/docker
 */
// Templates
export { generateDockerCompose, generateGateConfig, generateAgentConfig, generateExperimentDefinition, generateConditionConfigs, generateExperimentReadme, AGENT_DEFAULTS, } from './templates.js';
// Scaffolding
export { generateId, getExperimentDirs, getRunDirs, createExperimentScaffold, initializeRun, cleanWorkspace, cloneToWorkspace, copyToWorkspace, listExperiments, listRuns, loadRun, updateRunState, } from './scaffold.js';
export { executeDockerRun, executeBatchRuns, parseTrajectory, appendTrajectoryEvent, } from './runner.js';
export { createTrajectoryLogger, createNullLogger, withTrajectoryLogging, analyzeTrajectory, computeTrajectoryMetrics, } from './trajectory.js';
export { getImageName, imageExists, pullImage, ensureImage, evaluatePatch, evaluatePatches, computeEvaluationStats, isDockerAvailable, getDockerInfo, } from './evaluator.js';
export { createRealLLMAgent, convertToUnifiedDiff, } from './real-agent.js';
export { createQualityGatedAgent, } from './quality-gated-agent.js';
export { extractCodeFromDocker, withExtractedCode, } from './code-extractor.js';
//# sourceMappingURL=index.js.map