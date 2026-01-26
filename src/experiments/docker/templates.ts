/**
 * Docker Experiment Templates
 * ===========================
 * Template generators for docker-compose files, gate configs, and agent configs.
 */

import type {
  DockerExperimentDefinition,
  AgentConfig,
  GateConfig,
  RunDirectoryStructure,
} from './types.js';
import type { ExperimentCondition } from '../types.js';
import { createConditions } from '../conditions.js';

// =============================================================================
// Docker Compose Template
// =============================================================================

/**
 * Generate docker-compose.yml content for an experiment run.
 */
export function generateDockerCompose(options: {
  agent: AgentConfig;
  gate: GateConfig;
  runDirs: RunDirectoryStructure;
  networkName?: string;
}): string {
  const { agent, gate, runDirs, networkName = 'experiment-net' } = options;

  const agentEnv = Object.entries(agent.env ?? {})
    .map(([k, v]) => `      ${k}: "${v}"`)
    .join('\n');

  const agentVolumes = [
    `      - ${runDirs.workspace}:/workspace`,
    ...(agent.volumes ?? []).map(v => `      - ${v}`),
  ].join('\n');

  const resourceLimits = agent.resources
    ? `
    deploy:
      resources:
        limits:
          memory: ${agent.resources.memory ?? '4g'}
          cpus: "${agent.resources.cpus ?? '2'}"
`
    : '';

  const command = agent.command
    ? `    command: ${JSON.stringify(agent.command)}`
    : '';

  return `version: "3.8"

services:
  agent:
    image: ${agent.image}
    container_name: experiment-agent
    working_dir: ${agent.workdir ?? '/workspace'}
    environment:
${agentEnv}
      GATE_URL: http://gate:${gate.port}
      GATE_ENABLED: "${gate.condition.config.gateEnabled}"
    volumes:
${agentVolumes}
    depends_on:
      - gate
    networks:
      - ${networkName}
${resourceLimits}${command}

  gate:
    image: node:20-slim
    container_name: experiment-gate
    working_dir: /app
    environment:
      PORT: "${gate.port}"
      WORKSPACE_PATH: /workspace
      CONFIG_PATH: /config/gate-config.json
    volumes:
      - ${runDirs.workspace}:/workspace:ro
      - ${runDirs.gateConfig}:/config/gate-config.json:ro
      - ${runDirs.logs}:/logs
    ports:
      - "${gate.port}:${gate.port}"
    networks:
      - ${networkName}
    command: ["node", "/app/dist/mcp/server.js"]

networks:
  ${networkName}:
    driver: bridge
`;
}

// =============================================================================
// Gate Config Template
// =============================================================================

/**
 * Generate gate-config.json content for an experiment run.
 */
export function generateGateConfig(options: {
  condition: ExperimentCondition;
  metrics?: GateConfig['metrics'];
  autoEvaluateInterval?: number;
  trajectoryPath: string;
}): string {
  const { condition, metrics, autoEvaluateInterval, trajectoryPath } = options;

  const config = {
    // Experiment condition
    condition: {
      name: condition.name,
      design: condition.design,
      config: condition.config,
    },

    // Metrics extraction
    metrics: {
      coveragePath: metrics?.coveragePath ?? 'coverage/coverage-final.json',
      tsconfigPath: metrics?.tsconfigPath ?? 'tsconfig.json',
      eslintConfigPath: metrics?.eslintConfigPath ?? '.eslintrc.json',
    },

    // Gate behavior
    gateEnabled: condition.config.gateEnabled,
    granularity: condition.config.granularity ?? 'dimension',
    callGraphWeighting: condition.config.callGraphWeighting ?? false,
    fixabilityEnabled: condition.config.fixabilityEnabled ?? false,
    prioritization: condition.config.prioritization ?? 'raw',

    // Logging
    trajectoryPath,
    autoEvaluateInterval: autoEvaluateInterval ?? 0,
  };

  return JSON.stringify(config, null, 2);
}

// =============================================================================
// Agent Config Templates
// =============================================================================

/**
 * Default configurations for supported agents.
 */
export const AGENT_DEFAULTS: Record<string, Partial<AgentConfig>> = {
  'swe-agent': {
    image: 'sweagent/swe-agent:latest',
    workdir: '/workspace',
    env: {
      MODEL: 'gpt-5',
      WORKSPACE: '/workspace',
    },
    resources: {
      memory: '8g',
      cpus: '4',
    },
  },

  'aider': {
    image: 'paulgauthier/aider:latest',
    workdir: '/workspace',
    env: {
      AIDER_MODEL: 'gpt-5',
      AIDER_YES: 'true',
      AIDER_NO_GIT: 'true',
    },
    resources: {
      memory: '4g',
      cpus: '2',
    },
  },

  'custom': {
    image: 'node:20-slim',
    workdir: '/workspace',
    env: {},
    resources: {
      memory: '4g',
      cpus: '2',
    },
  },
};

/**
 * Generate agent configuration with defaults.
 */
export function generateAgentConfig(
  agentType: string,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  const defaults = AGENT_DEFAULTS[agentType] ?? AGENT_DEFAULTS['custom'];

  return {
    type: agentType,
    image: overrides?.image ?? defaults.image ?? 'node:20-slim',
    workdir: overrides?.workdir ?? defaults.workdir ?? '/workspace',
    env: {
      ...defaults.env,
      ...overrides?.env,
    },
    volumes: [
      ...(defaults.volumes ?? []),
      ...(overrides?.volumes ?? []),
    ],
    resources: {
      ...defaults.resources,
      ...overrides?.resources,
    },
    command: overrides?.command ?? defaults.command,
  };
}

// =============================================================================
// Experiment Definition Template
// =============================================================================

/**
 * Generate a complete experiment definition.
 */
export function generateExperimentDefinition(options: {
  id: string;
  name: string;
  description?: string;
  design: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  agentType: string;
  taskSource: string;
  taskId: string;
  gatePort?: number;
}): DockerExperimentDefinition {
  const {
    id,
    name,
    description,
    design,
    agentType,
    taskSource,
    taskId,
    gatePort = 3000,
  } = options;

  const conditions = createConditions(design);
  const baselineCondition = conditions[0];

  return {
    id,
    name,
    description,
    design,
    agent: generateAgentConfig(agentType),
    task: {
      source: taskSource,
      taskId,
    },
    gate: {
      port: gatePort,
      condition: baselineCondition,
    },
    createdAt: Date.now(),
  };
}

// =============================================================================
// Condition Config Templates
// =============================================================================

/**
 * Generate condition-specific config files for all conditions in a design.
 */
export function generateConditionConfigs(design: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'): Map<string, ExperimentCondition> {
  const conditions = createConditions(design) as ExperimentCondition[];

  const configs = new Map<string, ExperimentCondition>();
  for (const condition of conditions) {
    configs.set(condition.name, condition);
  }

  return configs;
}

// =============================================================================
// README Template
// =============================================================================

/**
 * Generate a README.md for an experiment directory.
 */
export function generateExperimentReadme(definition: DockerExperimentDefinition): string {
  return `# ${definition.name}

${definition.description ?? 'Docker experiment for quality-gate-sgd validation.'}

## Design

- **Design**: ${definition.design}
- **Agent**: ${definition.agent.type}
- **Task Source**: ${definition.task.source}

## Directory Structure

\`\`\`
${definition.id}/
├── experiment.json    # Experiment definition
├── README.md          # This file
├── templates/
│   └── docker-compose.yml.template
├── configs/
│   └── <condition>.json  # Condition-specific configs
└── runs/
    └── <run-id>/
        ├── workspace/     # Transient, cleaned per run
        ├── logs/
        │   └── trajectory.jsonl
        ├── docker-compose.yml
        ├── gate-config.json
        └── result.json
\`\`\`

## Usage

1. Initialize a run:
   \`\`\`bash
   npx quality-gate-sgd init-run --experiment ${definition.id} --condition baseline --task <task-id>
   \`\`\`

2. Start the run:
   \`\`\`bash
   cd runs/<run-id>
   docker-compose up
   \`\`\`

3. View results:
   \`\`\`bash
   cat runs/<run-id>/result.json
   \`\`\`

## Conditions

The following conditions are available for Design ${definition.design}:

${getConditionDescriptions(definition.design)}

## Created

${new Date(definition.createdAt).toISOString()}
`;
}

/**
 * Get condition descriptions for a design.
 */
function getConditionDescriptions(design: string): string {
  const descriptions: Record<string, string> = {
    A: `- **baseline**: Gate disabled, no feedback
- **treatment**: Gate enabled with full feedback`,

    B: `- **coverage-only**: Single coverage dimension
- **coverage-ceilings**: Coverage with ceiling constraints
- **full**: All dimensions enabled`,

    C: `- **baseline**: No symbol-level targeting
- **file-level**: File-level targeting
- **symbol-level**: Symbol-level targeting`,

    D: `- **baseline**: Raw ΔQ prioritization
- **weighted**: Call graph weighted ΔQ`,

    E: `- **baseline**: No fixability estimation
- **fixability**: Fixability scores enabled`,

    F: `- **raw**: Raw ΔQ prioritization
- **weighted**: Call graph weighted only
- **adjusted**: Full adjusted prioritization`,
  };

  return descriptions[design] ?? '- See experiment definition';
}
