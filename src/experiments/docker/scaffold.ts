/**
 * Experiment Scaffolding
 * ======================
 * Creates and manages experiment directory structures.
 * Each experiment gets its own self-contained directory with all necessary files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  DockerExperimentDefinition,
  DockerExperimentRun,
  ExperimentDirectoryStructure,
  RunDirectoryStructure,
  ScaffoldOptions,
  InitRunOptions,
} from './types.js';
import {
  generateDockerCompose,
  generateGateConfig,
  generateAgentConfig,
  generateExperimentDefinition,
  generateConditionConfigs,
  generateExperimentReadme,
} from './templates.js';
import { createConditions } from '../conditions.js';

// =============================================================================
// Directory Management
// =============================================================================

/**
 * Default base directory for experiments.
 */
const DEFAULT_EXPERIMENTS_DIR = 'experiments';

/**
 * Generate a unique ID for experiments or runs.
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Get the directory structure for an experiment.
 */
export function getExperimentDirs(
  experimentId: string,
  baseDir: string = DEFAULT_EXPERIMENTS_DIR
): ExperimentDirectoryStructure {
  const root = path.resolve(baseDir, experimentId);
  return {
    root,
    definition: path.join(root, 'experiment.json'),
    templates: path.join(root, 'templates'),
    configs: path.join(root, 'configs'),
    runs: path.join(root, 'runs'),
  };
}

/**
 * Get the directory structure for a single run.
 */
export function getRunDirs(
  experimentDirs: ExperimentDirectoryStructure,
  runId: string
): RunDirectoryStructure {
  const root = path.join(experimentDirs.runs, runId);
  return {
    root,
    workspace: path.join(root, 'workspace'),
    logs: path.join(root, 'logs'),
    trajectory: path.join(root, 'logs', 'trajectory.jsonl'),
    result: path.join(root, 'result.json'),
    compose: path.join(root, 'docker-compose.yml'),
    gateConfig: path.join(root, 'gate-config.json'),
  };
}

// =============================================================================
// Scaffold Creation
// =============================================================================

/**
 * Create a new experiment scaffold.
 * Creates the directory structure and all template files.
 */
export function createExperimentScaffold(options: ScaffoldOptions): ExperimentDirectoryStructure {
  const {
    baseDir = DEFAULT_EXPERIMENTS_DIR,
    name,
    description,
    design,
    agentType,
    customImage,
    taskSource,
    includeExample = true,
  } = options;

  // Generate experiment ID
  const experimentId = generateId('exp');

  // Get directory structure
  const dirs = getExperimentDirs(experimentId, baseDir);

  // Create directories
  fs.mkdirSync(dirs.root, { recursive: true });
  fs.mkdirSync(dirs.templates, { recursive: true });
  fs.mkdirSync(dirs.configs, { recursive: true });
  fs.mkdirSync(dirs.runs, { recursive: true });

  // Generate experiment definition
  const definition = generateExperimentDefinition({
    id: experimentId,
    name,
    description,
    design,
    agentType: agentType === 'custom' ? 'custom' : agentType,
    taskSource,
    taskId: includeExample ? 'example-task' : '',
  });

  // Override image if custom
  if (agentType === 'custom' && customImage) {
    definition.agent.image = customImage;
  }

  // Write experiment definition
  fs.writeFileSync(dirs.definition, JSON.stringify(definition, null, 2));

  // Generate and write condition configs
  const conditions = createConditions(design);
  for (const condition of conditions) {
    const configPath = path.join(dirs.configs, `${condition.name}.json`);
    fs.writeFileSync(configPath, JSON.stringify(condition, null, 2));
  }

  // Write docker-compose template
  const composeTemplatePath = path.join(dirs.templates, 'docker-compose.yml.template');
  const templateCompose = `# Docker Compose Template
# Variables will be substituted at run init time:
# - {{WORKSPACE_PATH}}
# - {{GATE_CONFIG_PATH}}
# - {{LOGS_PATH}}
# - {{GATE_PORT}}
# - {{AGENT_IMAGE}}

version: "3.8"

services:
  agent:
    image: {{AGENT_IMAGE}}
    container_name: experiment-agent
    working_dir: /workspace
    environment:
      GATE_URL: http://gate:{{GATE_PORT}}
    volumes:
      - {{WORKSPACE_PATH}}:/workspace
    depends_on:
      - gate
    networks:
      - experiment-net

  gate:
    image: node:20-slim
    container_name: experiment-gate
    working_dir: /app
    environment:
      PORT: "{{GATE_PORT}}"
      WORKSPACE_PATH: /workspace
      CONFIG_PATH: /config/gate-config.json
    volumes:
      - {{WORKSPACE_PATH}}:/workspace:ro
      - {{GATE_CONFIG_PATH}}:/config/gate-config.json:ro
      - {{LOGS_PATH}}:/logs
    ports:
      - "{{GATE_PORT}}:{{GATE_PORT}}"
    networks:
      - experiment-net
    command: ["node", "/app/dist/mcp/server.js"]

networks:
  experiment-net:
    driver: bridge
`;
  fs.writeFileSync(composeTemplatePath, templateCompose);

  // Write README
  const readme = generateExperimentReadme(definition);
  fs.writeFileSync(path.join(dirs.root, 'README.md'), readme);

  // Write .gitignore for runs directory
  const gitignore = `# Transient run data
runs/*/workspace/
runs/*/logs/*.log

# Keep structure
!runs/.gitkeep
!runs/*/.gitkeep
`;
  fs.writeFileSync(path.join(dirs.root, '.gitignore'), gitignore);
  fs.writeFileSync(path.join(dirs.runs, '.gitkeep'), '');

  return dirs;
}

// =============================================================================
// Run Initialization
// =============================================================================

/**
 * Initialize a new run for an experiment.
 * Creates a clean workspace directory and all run-specific files.
 */
export function initializeRun(options: InitRunOptions): DockerExperimentRun {
  const {
    experimentId,
    conditionName,
    taskId,
    runId = generateId('run'),
    cleanupOnComplete = true,
    timeout,
    baseDir,
  } = options;

  // Find experiment
  const experimentDirs = getExperimentDirs(experimentId, baseDir);
  if (!fs.existsSync(experimentDirs.definition)) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  // Load experiment definition
  const definition: DockerExperimentDefinition = JSON.parse(
    fs.readFileSync(experimentDirs.definition, 'utf-8')
  );

  // Load condition config
  const conditionPath = path.join(experimentDirs.configs, `${conditionName}.json`);
  if (!fs.existsSync(conditionPath)) {
    throw new Error(`Condition not found: ${conditionName}`);
  }
  const condition = JSON.parse(fs.readFileSync(conditionPath, 'utf-8'));

  // Create run directories
  const runDirs = getRunDirs(experimentDirs, runId);
  fs.mkdirSync(runDirs.root, { recursive: true });
  fs.mkdirSync(runDirs.workspace, { recursive: true });
  fs.mkdirSync(runDirs.logs, { recursive: true });

  // Generate docker-compose.yml
  const compose = generateDockerCompose({
    agent: definition.agent,
    gate: {
      ...definition.gate,
      condition,
    },
    runDirs,
  });
  fs.writeFileSync(runDirs.compose, compose);

  // Generate gate-config.json
  const gateConfig = generateGateConfig({
    condition,
    metrics: definition.gate.metrics,
    autoEvaluateInterval: definition.gate.autoEvaluateInterval,
    trajectoryPath: '/logs/trajectory.jsonl',
  });
  fs.writeFileSync(runDirs.gateConfig, gateConfig);

  // Initialize trajectory log
  fs.writeFileSync(runDirs.trajectory, '');

  // Create run record
  const run: DockerExperimentRun = {
    runId,
    experimentId,
    state: 'pending',
    runDir: runDirs.root,
  };

  // Write initial run state
  const runStatePath = path.join(runDirs.root, 'run-state.json');
  fs.writeFileSync(runStatePath, JSON.stringify({
    ...run,
    condition: conditionName,
    taskId,
    cleanupOnComplete,
    timeout,
  }, null, 2));

  return run;
}

// =============================================================================
// Workspace Management
// =============================================================================

/**
 * Clean a run's workspace directory.
 * Call this before starting a new run to ensure a fresh state.
 */
export function cleanWorkspace(runDirs: RunDirectoryStructure): void {
  if (fs.existsSync(runDirs.workspace)) {
    fs.rmSync(runDirs.workspace, { recursive: true, force: true });
  }
  fs.mkdirSync(runDirs.workspace, { recursive: true });
}

/**
 * Clone a repository into the workspace.
 */
export async function cloneToWorkspace(
  runDirs: RunDirectoryStructure,
  repo: { url: string; branch?: string; commit?: string }
): Promise<void> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve, reject) => {
    const args = ['clone', '--depth', '1'];
    if (repo.branch) {
      args.push('--branch', repo.branch);
    }
    args.push(repo.url, runDirs.workspace);

    const git = spawn('git', args);

    let stderr = '';
    git.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    git.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git clone failed: ${stderr}`));
        return;
      }

      // Checkout specific commit if specified
      if (repo.commit) {
        const checkout = spawn('git', ['checkout', repo.commit], {
          cwd: runDirs.workspace,
        });

        checkout.on('close', (checkoutCode) => {
          if (checkoutCode !== 0) {
            reject(new Error(`git checkout failed`));
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });

    git.on('error', reject);
  });
}

/**
 * Copy files into the workspace.
 */
export function copyToWorkspace(
  runDirs: RunDirectoryStructure,
  files: Array<{ source: string; dest?: string }>
): void {
  for (const file of files) {
    const destPath = path.join(runDirs.workspace, file.dest ?? path.basename(file.source));
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(file.source, destPath);
  }
}

// =============================================================================
// Experiment Discovery
// =============================================================================

/**
 * List all experiments in the base directory.
 */
export function listExperiments(baseDir: string = DEFAULT_EXPERIMENTS_DIR): DockerExperimentDefinition[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const experiments: DockerExperimentDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const definitionPath = path.join(baseDir, entry.name, 'experiment.json');
    if (fs.existsSync(definitionPath)) {
      try {
        const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf-8'));
        experiments.push(definition);
      } catch {
        // Skip invalid experiments
      }
    }
  }

  return experiments;
}

/**
 * List all runs for an experiment.
 */
export function listRuns(experimentId: string, baseDir: string = DEFAULT_EXPERIMENTS_DIR): DockerExperimentRun[] {
  const experimentDirs = getExperimentDirs(experimentId, baseDir);
  if (!fs.existsSync(experimentDirs.runs)) {
    return [];
  }

  const entries = fs.readdirSync(experimentDirs.runs, { withFileTypes: true });
  const runs: DockerExperimentRun[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.gitkeep') continue;

    const runStatePath = path.join(experimentDirs.runs, entry.name, 'run-state.json');
    if (fs.existsSync(runStatePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(runStatePath, 'utf-8'));
        runs.push(state);
      } catch {
        // Skip invalid runs
      }
    }
  }

  return runs;
}

/**
 * Load a specific run.
 */
export function loadRun(
  experimentId: string,
  runId: string,
  baseDir: string = DEFAULT_EXPERIMENTS_DIR
): DockerExperimentRun | null {
  const experimentDirs = getExperimentDirs(experimentId, baseDir);
  const runDirs = getRunDirs(experimentDirs, runId);
  const runStatePath = path.join(runDirs.root, 'run-state.json');

  if (!fs.existsSync(runStatePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(runStatePath, 'utf-8'));
}

/**
 * Update run state.
 */
export function updateRunState(
  experimentId: string,
  runId: string,
  updates: Partial<DockerExperimentRun>,
  baseDir: string = DEFAULT_EXPERIMENTS_DIR
): DockerExperimentRun {
  const run = loadRun(experimentId, runId, baseDir);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const updated = { ...run, ...updates };

  const experimentDirs = getExperimentDirs(experimentId, baseDir);
  const runDirs = getRunDirs(experimentDirs, runId);
  const runStatePath = path.join(runDirs.root, 'run-state.json');

  fs.writeFileSync(runStatePath, JSON.stringify(updated, null, 2));

  return updated;
}
