/**
 * Docker Experiment Templates
 * ===========================
 * Template generators for docker-compose files, gate configs, and agent configs.
 */
import type { DockerExperimentDefinition, AgentConfig, GateConfig, RunDirectoryStructure } from './types.js';
import type { ExperimentCondition } from '../types.js';
/**
 * Generate docker-compose.yml content for an experiment run.
 */
export declare function generateDockerCompose(options: {
    agent: AgentConfig;
    gate: GateConfig;
    runDirs: RunDirectoryStructure;
    networkName?: string;
}): string;
/**
 * Generate gate-config.json content for an experiment run.
 */
export declare function generateGateConfig(options: {
    condition: ExperimentCondition;
    metrics?: GateConfig['metrics'];
    autoEvaluateInterval?: number;
    trajectoryPath: string;
}): string;
/**
 * Default configurations for supported agents.
 */
export declare const AGENT_DEFAULTS: Record<string, Partial<AgentConfig>>;
/**
 * Generate agent configuration with defaults.
 */
export declare function generateAgentConfig(agentType: string, overrides?: Partial<AgentConfig>): AgentConfig;
/**
 * Generate a complete experiment definition.
 */
export declare function generateExperimentDefinition(options: {
    id: string;
    name: string;
    description?: string;
    design: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    agentType: string;
    taskSource: string;
    taskId: string;
    gatePort?: number;
}): DockerExperimentDefinition;
/**
 * Generate condition-specific config files for all conditions in a design.
 */
export declare function generateConditionConfigs(design: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'): Map<string, ExperimentCondition>;
/**
 * Generate a README.md for an experiment directory.
 */
export declare function generateExperimentReadme(definition: DockerExperimentDefinition): string;
//# sourceMappingURL=templates.d.ts.map