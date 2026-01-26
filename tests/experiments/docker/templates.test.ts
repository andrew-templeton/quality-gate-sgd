import { describe, it, expect } from 'vitest';
import {
  generateDockerCompose,
  generateGateConfig,
  generateAgentConfig,
  generateExperimentDefinition,
  generateExperimentReadme,
  AGENT_DEFAULTS,
} from '../../../src/experiments/docker/templates.js';
import type { ExperimentCondition } from '../../../src/experiments/types.js';

describe('docker experiment templates', () => {
  describe('generateDockerCompose', () => {
    it('generates valid docker-compose YAML', () => {
      const compose = generateDockerCompose({
        agent: {
          type: 'swe-agent',
          image: 'sweagent/swe-agent:latest',
          workdir: '/workspace',
          env: {
            MODEL: 'gpt-5',
          },
        },
        gate: {
          port: 3000,
          condition: {
            name: 'baseline',
            design: 'A',
            config: {
              maxIterations: 10,
              gateEnabled: false,
            },
          },
        },
        runDirs: {
          root: '/runs/run-1',
          workspace: '/runs/run-1/workspace',
          logs: '/runs/run-1/logs',
          trajectory: '/runs/run-1/logs/trajectory.jsonl',
          result: '/runs/run-1/result.json',
          compose: '/runs/run-1/docker-compose.yml',
          gateConfig: '/runs/run-1/gate-config.json',
        },
      });

      expect(compose).toContain('version: "3.8"');
      expect(compose).toContain('services:');
      expect(compose).toContain('agent:');
      expect(compose).toContain('gate:');
      expect(compose).toContain('sweagent/swe-agent:latest');
      expect(compose).toContain('MODEL: "gpt-5"');
      expect(compose).toContain('GATE_URL: http://gate:3000');
      expect(compose).toContain('/runs/run-1/workspace:/workspace');
    });

    it('includes resource limits when specified', () => {
      const compose = generateDockerCompose({
        agent: {
          type: 'custom',
          image: 'myagent:latest',
          resources: {
            memory: '16g',
            cpus: '8',
          },
        },
        gate: {
          port: 3000,
          condition: {
            name: 'test',
            design: 'A',
            config: { maxIterations: 10, gateEnabled: true },
          },
        },
        runDirs: {
          root: '/runs/run-1',
          workspace: '/runs/run-1/workspace',
          logs: '/runs/run-1/logs',
          trajectory: '/runs/run-1/logs/trajectory.jsonl',
          result: '/runs/run-1/result.json',
          compose: '/runs/run-1/docker-compose.yml',
          gateConfig: '/runs/run-1/gate-config.json',
        },
      });

      expect(compose).toContain('memory: 16g');
      expect(compose).toContain('cpus: "8"');
    });
  });

  describe('generateGateConfig', () => {
    it('generates valid JSON config', () => {
      const condition: ExperimentCondition = {
        name: 'treatment',
        design: 'A',
        config: {
          maxIterations: 10,
          gateEnabled: true,
          granularity: 'symbol',
          callGraphWeighting: true,
        },
      };

      const configJson = generateGateConfig({
        condition,
        trajectoryPath: '/logs/trajectory.jsonl',
      });

      const config = JSON.parse(configJson);

      expect(config.condition.name).toBe('treatment');
      expect(config.gateEnabled).toBe(true);
      expect(config.granularity).toBe('symbol');
      expect(config.callGraphWeighting).toBe(true);
      expect(config.trajectoryPath).toBe('/logs/trajectory.jsonl');
    });

    it('uses default metrics paths', () => {
      const configJson = generateGateConfig({
        condition: {
          name: 'test',
          design: 'A',
          config: { maxIterations: 10, gateEnabled: true },
        },
        trajectoryPath: '/logs/trajectory.jsonl',
      });

      const config = JSON.parse(configJson);

      expect(config.metrics.coveragePath).toBe('coverage/coverage-final.json');
      expect(config.metrics.tsconfigPath).toBe('tsconfig.json');
    });

    it('uses custom metrics paths when provided', () => {
      const configJson = generateGateConfig({
        condition: {
          name: 'test',
          design: 'A',
          config: { maxIterations: 10, gateEnabled: true },
        },
        metrics: {
          coveragePath: 'custom/coverage.json',
          tsconfigPath: 'custom/tsconfig.json',
        },
        trajectoryPath: '/logs/trajectory.jsonl',
      });

      const config = JSON.parse(configJson);

      expect(config.metrics.coveragePath).toBe('custom/coverage.json');
      expect(config.metrics.tsconfigPath).toBe('custom/tsconfig.json');
    });
  });

  describe('generateAgentConfig', () => {
    it('generates swe-agent config with defaults', () => {
      const config = generateAgentConfig('swe-agent');

      expect(config.type).toBe('swe-agent');
      expect(config.image).toBe('sweagent/swe-agent:latest');
      expect(config.workdir).toBe('/workspace');
      expect(config.env?.MODEL).toBe('gpt-5');
    });

    it('generates aider config with defaults', () => {
      const config = generateAgentConfig('aider');

      expect(config.type).toBe('aider');
      expect(config.image).toBe('paulgauthier/aider:latest');
      expect(config.env?.AIDER_MODEL).toBe('gpt-5');
    });

    it('generates custom config with fallback defaults', () => {
      const config = generateAgentConfig('my-custom-agent');

      expect(config.type).toBe('my-custom-agent');
      expect(config.image).toBe('node:20-slim');
    });

    it('applies overrides', () => {
      const config = generateAgentConfig('swe-agent', {
        image: 'custom-swe:v2',
        env: {
          CUSTOM_VAR: 'value',
        },
        resources: {
          memory: '32g',
        },
      });

      expect(config.image).toBe('custom-swe:v2');
      expect(config.env?.CUSTOM_VAR).toBe('value');
      expect(config.env?.MODEL).toBe('gpt-5'); // Still has defaults
      expect(config.resources?.memory).toBe('32g');
    });
  });

  describe('AGENT_DEFAULTS', () => {
    it('has swe-agent defaults', () => {
      expect(AGENT_DEFAULTS['swe-agent']).toBeDefined();
      expect(AGENT_DEFAULTS['swe-agent'].image).toBe('sweagent/swe-agent:latest');
    });

    it('has aider defaults', () => {
      expect(AGENT_DEFAULTS['aider']).toBeDefined();
      expect(AGENT_DEFAULTS['aider'].image).toBe('paulgauthier/aider:latest');
    });

    it('has custom defaults', () => {
      expect(AGENT_DEFAULTS['custom']).toBeDefined();
      expect(AGENT_DEFAULTS['custom'].image).toBe('node:20-slim');
    });
  });

  describe('generateExperimentDefinition', () => {
    it('generates complete experiment definition', () => {
      const definition = generateExperimentDefinition({
        id: 'exp-123',
        name: 'Test Experiment',
        description: 'A test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
        taskId: 'task-1',
        gatePort: 4000,
      });

      expect(definition.id).toBe('exp-123');
      expect(definition.name).toBe('Test Experiment');
      expect(definition.description).toBe('A test');
      expect(definition.design).toBe('A');
      expect(definition.agent.type).toBe('swe-agent');
      expect(definition.task.source).toBe('swe-bench');
      expect(definition.task.taskId).toBe('task-1');
      expect(definition.gate.port).toBe(4000);
      expect(definition.createdAt).toBeGreaterThan(0);
    });

    it('uses default gate port', () => {
      const definition = generateExperimentDefinition({
        id: 'exp-123',
        name: 'Test',
        design: 'B',
        agentType: 'aider',
        taskSource: 'custom',
        taskId: 'task-1',
      });

      expect(definition.gate.port).toBe(3000);
    });
  });

  describe('generateExperimentReadme', () => {
    it('generates README with experiment details', () => {
      const definition = generateExperimentDefinition({
        id: 'exp-123',
        name: 'Gate Validation',
        description: 'Testing H1/H2',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
        taskId: 'test',
      });

      const readme = generateExperimentReadme(definition);

      expect(readme).toContain('# Gate Validation');
      expect(readme).toContain('Testing H1/H2');
      expect(readme).toContain('Design**: A');
      expect(readme).toContain('Agent**: swe-agent');
      expect(readme).toContain('Directory Structure');
      expect(readme).toContain('Usage');
      expect(readme).toContain('init-run');
    });

    it('includes condition descriptions for Design A', () => {
      const definition = generateExperimentDefinition({
        id: 'exp-123',
        name: 'Test',
        design: 'A',
        agentType: 'swe-agent',
        taskSource: 'swe-bench',
        taskId: 'test',
      });

      const readme = generateExperimentReadme(definition);

      expect(readme).toContain('baseline');
      expect(readme).toContain('treatment');
      expect(readme).toContain('Gate disabled');
      expect(readme).toContain('Gate enabled');
    });
  });
});
