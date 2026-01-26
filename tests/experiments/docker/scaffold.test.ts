import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateId,
  getExperimentDirs,
  getRunDirs,
  createExperimentScaffold,
  initializeRun,
  cleanWorkspace,
  copyToWorkspace,
  listExperiments,
  listRuns,
  loadRun,
  updateRunState,
  type ScaffoldOptions,
} from '../../../src/experiments/docker/scaffold.js';
import type { ExperimentDirectoryStructure } from '../../../src/experiments/docker/types.js';

describe('docker experiment scaffolding', () => {
  const testBaseDir = path.join(process.cwd(), '.test-experiments');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('generates IDs with prefix', () => {
      const id = generateId('exp');
      expect(id).toMatch(/^exp-/);
    });

    it('generates IDs without prefix', () => {
      const id = generateId();
      expect(id).not.toMatch(/^-/);
    });
  });

  describe('getExperimentDirs', () => {
    it('returns correct directory structure', () => {
      const dirs = getExperimentDirs('test-exp', testBaseDir);

      expect(dirs.root).toBe(path.resolve(testBaseDir, 'test-exp'));
      expect(dirs.definition).toBe(path.join(dirs.root, 'experiment.json'));
      expect(dirs.templates).toBe(path.join(dirs.root, 'templates'));
      expect(dirs.configs).toBe(path.join(dirs.root, 'configs'));
      expect(dirs.runs).toBe(path.join(dirs.root, 'runs'));
    });

    it('uses default base dir when not specified', () => {
      const dirs = getExperimentDirs('test-exp');
      expect(dirs.root).toBe(path.resolve('experiments', 'test-exp'));
    });
  });

  describe('getRunDirs', () => {
    it('returns correct run directory structure', () => {
      const expDirs = getExperimentDirs('test-exp', testBaseDir);
      const runDirs = getRunDirs(expDirs, 'run-123');

      expect(runDirs.root).toBe(path.join(expDirs.runs, 'run-123'));
      expect(runDirs.workspace).toBe(path.join(runDirs.root, 'workspace'));
      expect(runDirs.logs).toBe(path.join(runDirs.root, 'logs'));
      expect(runDirs.trajectory).toBe(path.join(runDirs.root, 'logs', 'trajectory.jsonl'));
      expect(runDirs.result).toBe(path.join(runDirs.root, 'result.json'));
      expect(runDirs.compose).toBe(path.join(runDirs.root, 'docker-compose.yml'));
      expect(runDirs.gateConfig).toBe(path.join(runDirs.root, 'gate-config.json'));
    });
  });

  describe('createExperimentScaffold', () => {
    it('creates experiment directory structure', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Test Experiment',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      };

      const dirs = createExperimentScaffold(options);

      expect(fs.existsSync(dirs.root)).toBe(true);
      expect(fs.existsSync(dirs.templates)).toBe(true);
      expect(fs.existsSync(dirs.configs)).toBe(true);
      expect(fs.existsSync(dirs.runs)).toBe(true);
    });

    it('creates experiment.json with correct content', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Test Experiment',
        description: 'A test experiment',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      };

      const dirs = createExperimentScaffold(options);

      const definition = JSON.parse(fs.readFileSync(dirs.definition, 'utf-8'));
      expect(definition.name).toBe('Test Experiment');
      expect(definition.description).toBe('A test experiment');
      expect(definition.design).toBe('A');
      expect(definition.agent.type).toBe('swe-agent');
    });

    it('creates condition configs for design A', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Gate Test',
        design: 'A',
        agentType: 'aider',
        taskSource: 'custom',
      };

      const dirs = createExperimentScaffold(options);

      // Design A has 'no-gate' and 'gate' conditions
      const noGateConfig = path.join(dirs.configs, 'no-gate.json');
      const gateConfig = path.join(dirs.configs, 'gate.json');

      expect(fs.existsSync(noGateConfig)).toBe(true);
      expect(fs.existsSync(gateConfig)).toBe(true);

      const noGate = JSON.parse(fs.readFileSync(noGateConfig, 'utf-8'));
      expect(noGate.config.gateEnabled).toBe(false);

      const gate = JSON.parse(fs.readFileSync(gateConfig, 'utf-8'));
      expect(gate.config.gateEnabled).toBe(true);
    });

    it('creates docker-compose template', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Test',
        design: 'B',
        agentType: 'custom',
        customImage: 'myagent:latest',
        taskSource: 'swe-bench',
      };

      const dirs = createExperimentScaffold(options);

      const templatePath = path.join(dirs.templates, 'docker-compose.yml.template');
      expect(fs.existsSync(templatePath)).toBe(true);

      const template = fs.readFileSync(templatePath, 'utf-8');
      expect(template).toContain('{{WORKSPACE_PATH}}');
      expect(template).toContain('{{GATE_PORT}}');
    });

    it('creates README.md', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Test',
        design: 'C',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      };

      const dirs = createExperimentScaffold(options);

      const readmePath = path.join(dirs.root, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);

      const readme = fs.readFileSync(readmePath, 'utf-8');
      expect(readme).toContain('# Test');
      expect(readme).toContain('Design');
    });

    it('creates .gitignore', () => {
      const options: ScaffoldOptions = {
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      };

      const dirs = createExperimentScaffold(options);

      const gitignorePath = path.join(dirs.root, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignore).toContain('workspace');
    });
  });

  describe('initializeRun', () => {
    let experimentDirs: ExperimentDirectoryStructure;

    beforeEach(() => {
      // Create an experiment first
      experimentDirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });
    });

    it('creates run directory structure', () => {
      const experimentId = path.basename(experimentDirs.root);

      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task-1',
        baseDir: testBaseDir,
      });

      expect(fs.existsSync(run.runDir)).toBe(true);
      expect(fs.existsSync(path.join(run.runDir, 'workspace'))).toBe(true);
      expect(fs.existsSync(path.join(run.runDir, 'logs'))).toBe(true);
    });

    it('generates docker-compose.yml', () => {
      const experimentId = path.basename(experimentDirs.root);

      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task-1',
        baseDir: testBaseDir,
      });

      const composePath = path.join(run.runDir, 'docker-compose.yml');
      expect(fs.existsSync(composePath)).toBe(true);

      const compose = fs.readFileSync(composePath, 'utf-8');
      expect(compose).toContain('agent:');
      expect(compose).toContain('gate:');
    });

    it('generates gate-config.json', () => {
      const experimentId = path.basename(experimentDirs.root);

      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task-1',
        baseDir: testBaseDir,
      });

      const configPath = path.join(run.runDir, 'gate-config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.condition.name).toBe('no-gate');
      expect(config.gateEnabled).toBe(false); // no-gate condition has gate disabled
    });

    it('initializes empty trajectory log', () => {
      const experimentId = path.basename(experimentDirs.root);

      const run = initializeRun({
        experimentId,
        conditionName: 'gate',
        taskId: 'test-task-1',
        baseDir: testBaseDir,
      });

      const trajectoryPath = path.join(run.runDir, 'logs', 'trajectory.jsonl');
      expect(fs.existsSync(trajectoryPath)).toBe(true);
    });

    it('uses custom run ID when provided', () => {
      const experimentId = path.basename(experimentDirs.root);

      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task-1',
        runId: 'my-custom-run',
        baseDir: testBaseDir,
      });

      expect(run.runId).toBe('my-custom-run');
      expect(run.runDir).toContain('my-custom-run');
    });

    it('throws for non-existent condition', () => {
      const experimentId = path.basename(experimentDirs.root);

      expect(() => initializeRun({
        experimentId,
        conditionName: 'non-existent',
        taskId: 'test-task-1',
        baseDir: testBaseDir,
      })).toThrow('Condition not found');
    });
  });

  describe('cleanWorkspace', () => {
    it('removes and recreates workspace directory', () => {
      const experimentDirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const experimentId = path.basename(experimentDirs.root);
      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task',
        baseDir: testBaseDir,
      });

      const runDirs = getRunDirs(experimentDirs, run.runId);

      // Add some files to workspace
      fs.writeFileSync(path.join(runDirs.workspace, 'test.txt'), 'test');

      // Clean workspace
      cleanWorkspace(runDirs);

      // Workspace should exist but be empty
      expect(fs.existsSync(runDirs.workspace)).toBe(true);
      expect(fs.readdirSync(runDirs.workspace)).toHaveLength(0);
    });
  });

  describe('copyToWorkspace', () => {
    it('copies files to workspace', () => {
      const experimentDirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const experimentId = path.basename(experimentDirs.root);
      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'test-task',
        baseDir: testBaseDir,
      });

      const runDirs = getRunDirs(experimentDirs, run.runId);

      // Create a temp file to copy
      const tempFile = path.join(testBaseDir, 'temp-source.txt');
      fs.writeFileSync(tempFile, 'source content');

      copyToWorkspace(runDirs, [
        { source: tempFile, dest: 'copied.txt' },
      ]);

      const destPath = path.join(runDirs.workspace, 'copied.txt');
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('source content');
    });
  });

  describe('listExperiments', () => {
    it('returns empty array when no experiments', () => {
      const experiments = listExperiments(testBaseDir);
      expect(experiments).toEqual([]);
    });

    it('lists all experiments', () => {
      createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Exp 1',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Exp 2',
        design: 'B',
        agentType: 'aider',
        taskSource: 'custom',
      });

      const experiments = listExperiments(testBaseDir);
      expect(experiments).toHaveLength(2);
      expect(experiments.map(e => e.name)).toContain('Exp 1');
      expect(experiments.map(e => e.name)).toContain('Exp 2');
    });
  });

  describe('listRuns', () => {
    it('returns empty array when no runs', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const runs = listRuns(path.basename(dirs.root), testBaseDir);
      expect(runs).toEqual([]);
    });

    it('lists all runs for experiment', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const experimentId = path.basename(dirs.root);

      initializeRun({ experimentId, conditionName: 'no-gate', taskId: 'task-1', baseDir: testBaseDir });
      initializeRun({ experimentId, conditionName: 'gate', taskId: 'task-2', baseDir: testBaseDir });

      const runs = listRuns(experimentId, testBaseDir);
      expect(runs).toHaveLength(2);
    });
  });

  describe('loadRun', () => {
    it('returns null for non-existent run', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const run = loadRun(path.basename(dirs.root), 'non-existent', testBaseDir);
      expect(run).toBeNull();
    });

    it('loads existing run', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const experimentId = path.basename(dirs.root);
      const created = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'task-1',
        baseDir: testBaseDir,
      });

      const loaded = loadRun(experimentId, created.runId, testBaseDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe(created.runId);
      expect(loaded!.state).toBe('pending');
    });
  });

  describe('updateRunState', () => {
    it('updates run state', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      const experimentId = path.basename(dirs.root);
      const run = initializeRun({
        experimentId,
        conditionName: 'no-gate',
        taskId: 'task-1',
        baseDir: testBaseDir,
      });

      const updated = updateRunState(experimentId, run.runId, {
        state: 'running',
        startedAt: Date.now(),
      }, testBaseDir);

      expect(updated.state).toBe('running');
      expect(updated.startedAt).toBeDefined();

      // Verify persisted
      const loaded = loadRun(experimentId, run.runId, testBaseDir);
      expect(loaded!.state).toBe('running');
    });

    it('throws for non-existent run', () => {
      const dirs = createExperimentScaffold({
        baseDir: testBaseDir,
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
      });

      expect(() => updateRunState(
        path.basename(dirs.root),
        'non-existent',
        { state: 'running' },
        testBaseDir
      )).toThrow('Run not found');
    });
  });
});
