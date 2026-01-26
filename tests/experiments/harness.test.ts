import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAgentHarness,
  createMockMetricsProvider,
  createMockExecutor,
  type MetricsProvider,
  type LLMExecutor,
  type FixContext,
  type FixAttemptResult,
} from '../../src/experiments/harness.js';
import type { ExperimentConfig, TargetSuggestion } from '../../src/experiments/types.js';
import type { ExperimentTask } from '../../src/experiments/runner.js';
import type { Metrics } from '../../src/types.js';

describe('agent harness', () => {
  describe('createMockMetricsProvider', () => {
    it('creates provider with default metrics', () => {
      const provider = createMockMetricsProvider();
      expect(provider.getProjectRoot()).toBe(process.cwd());
    });

    it('creates provider with custom initial metrics', async () => {
      const provider = createMockMetricsProvider({
        initialMetrics: {
          coverage: {
            unit: {
              lines: 75,
              branches: 80,
              functions: 85,
              statements: 70,
            },
          },
        },
        projectRoot: '/test/project',
      });

      const metrics = await provider.extractMetrics();
      expect(metrics.coverage?.unit?.branches).toBe(80);
      expect(provider.getProjectRoot()).toBe('/test/project');
    });

    it('returns empty source files', async () => {
      const provider = createMockMetricsProvider();
      const files = await provider.getSourceFiles!();
      expect(files).toEqual([]);
    });
  });

  describe('createMockExecutor', () => {
    it('creates executor with default options', async () => {
      const executor = createMockExecutor();
      const result = await executor.attemptFix(
        { id: 'test' },
        null,
        {} as FixContext
      );
      expect(result.attempted).toBe(true);
    });

    it('respects seed for reproducibility', async () => {
      const executor1 = createMockExecutor({ seed: 42 });
      const executor2 = createMockExecutor({ seed: 42 });

      const results1: boolean[] = [];
      const results2: boolean[] = [];

      for (let i = 0; i < 10; i++) {
        const r1 = await executor1.attemptFix({ id: 'test' }, null, {} as FixContext);
        const r2 = await executor2.attemptFix({ id: 'test' }, null, {} as FixContext);
        results1.push(r1.modified);
        results2.push(r2.modified);
      }

      expect(results1).toEqual(results2);
    });

    it('respects improvement probability', async () => {
      // Always succeed
      const alwaysExecutor = createMockExecutor({ improvementProbability: 1.0, seed: 1 });
      const result1 = await alwaysExecutor.attemptFix({ id: 'test' }, null, {} as FixContext);
      expect(result1.modified).toBe(true);

      // Never succeed
      const neverExecutor = createMockExecutor({ improvementProbability: 0.0, seed: 1 });
      const result2 = await neverExecutor.attemptFix({ id: 'test' }, null, {} as FixContext);
      expect(result2.modified).toBe(false);
    });
  });

  describe('createAgentHarness', () => {
    let metricsProvider: MetricsProvider;
    let executor: LLMExecutor;

    beforeEach(() => {
      metricsProvider = createMockMetricsProvider({
        initialMetrics: {
          coverage: {
            unit: {
              lines: 50,
              branches: 50,
              functions: 50,
              statements: 50,
            },
          },
        },
      });
      executor = createMockExecutor({ improvementProbability: 1.0, seed: 42 });
    });

    it('creates agent with required interface methods', () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      expect(agent.initialize).toBeDefined();
      expect(agent.getSuggestion).toBeDefined();
      expect(agent.executeIteration).toBeDefined();
      expect(agent.evaluate).toBeDefined();
      expect(agent.cleanup).toBeDefined();
    });

    it('initializes with task and config', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
        targetScore: 90,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);

      const result = await agent.evaluate(config);
      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.passed).toBe(false); // 50% coverage won't pass 90 threshold
    });

    it('returns null suggestion when gate disabled', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: false,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const suggestion = await agent.getSuggestion!(config);

      expect(suggestion).toBeNull();
    });

    it('returns dimension suggestions when gate enabled', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const suggestion = await agent.getSuggestion!(config);

      expect(suggestion).not.toBeNull();
      expect(suggestion!.type).toBe('dimension');
      expect(suggestion!.id).toBeDefined();
      expect(suggestion!.expectedDeltaQ).toBeDefined();
    });

    it('evaluates and returns metrics', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
        targetScore: 90,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const result = await agent.evaluate(config);

      expect(result.metrics).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(0);
      expect(typeof result.passed).toBe('boolean');
    });

    it('passes when score meets target', async () => {
      // Create provider with high coverage
      const highCoverageProvider = createMockMetricsProvider({
        initialMetrics: {
          coverage: {
            unit: {
              lines: 95,
              branches: 95,
              functions: 95,
              statements: 95,
            },
          },
        },
      });

      const agent = createAgentHarness({
        metricsProvider: highCoverageProvider,
        executor,
        targetScore: 90,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const result = await agent.evaluate(config);

      expect(result.passed).toBe(true);
    });

    it('executes iteration and tracks outcome', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const suggestion = await agent.getSuggestion!(config);
      const outcome = await agent.executeIteration(1, suggestion, config);

      expect(outcome.success).toBeDefined();
      expect(outcome.actualDeltaQ).toBeDefined();
      expect(outcome.targetMatched).toBeDefined();
    });

    it('handles iteration without initialization', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      const outcome = await agent.executeIteration(1, null, config);

      expect(outcome.success).toBe(false);
      expect(outcome.error).toBe('Agent not initialized');
    });

    it('handles executor errors gracefully', async () => {
      const errorExecutor: LLMExecutor = {
        async attemptFix() {
          throw new Error('Simulated executor failure');
        },
      };

      const agent = createAgentHarness({
        metricsProvider,
        executor: errorExecutor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const outcome = await agent.executeIteration(1, null, config);

      expect(outcome.success).toBe(false);
      expect(outcome.error).toBe('Simulated executor failure');
    });

    it('cleanup resets state', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      await agent.cleanup();

      // After cleanup, evaluate should return empty metrics
      const result = await agent.evaluate(config);
      expect(result.qualityScore).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('limits number of top targets', async () => {
      const agent = createAgentHarness({
        metricsProvider,
        executor,
        topTargets: 3,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);

      // The agent should have computed targets, limited to 3
      // We can't directly access availableTargets, but we can verify
      // a suggestion is returned
      const suggestion = await agent.getSuggestion!(config);
      expect(suggestion).not.toBeNull();
    });

    it('handles non-modifying fix attempts', async () => {
      const noModifyExecutor: LLMExecutor = {
        async attemptFix() {
          return {
            attempted: true,
            modified: false,
            error: 'Could not find fix',
          };
        },
      };

      const agent = createAgentHarness({
        metricsProvider,
        executor: noModifyExecutor,
      });

      const task: ExperimentTask = { id: 'test-task' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      const outcome = await agent.executeIteration(1, null, config);

      expect(outcome.success).toBe(false);
      expect(outcome.actualDeltaQ).toBe(0);
      expect(outcome.error).toBe('Could not find fix');
    });
  });

  describe('fix context', () => {
    it('provides complete context to executor', async () => {
      let capturedContext: FixContext | null = null;

      const capturingExecutor: LLMExecutor = {
        async attemptFix(task, suggestion, context) {
          capturedContext = context;
          return { attempted: true, modified: true };
        },
      };

      const metricsProvider = createMockMetricsProvider({
        initialMetrics: {
          coverage: {
            unit: { lines: 60, branches: 60, functions: 60, statements: 60 },
          },
        },
      });

      const agent = createAgentHarness({
        metricsProvider,
        executor: capturingExecutor,
        targetScore: 90,
      });

      const task: ExperimentTask = { id: 'context-test' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: true,
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      await agent.executeIteration(5, null, config);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.iteration).toBe(5);
      expect(capturedContext!.currentScore).toBeGreaterThan(0);
      expect(capturedContext!.targetScore).toBe(90);
      expect(capturedContext!.feedbackEnabled).toBe(true);
      expect(capturedContext!.config).toBe(config);
      expect(capturedContext!.metrics).toBeDefined();
      expect(capturedContext!.availableTargets).toBeDefined();
    });

    it('excludes targets when gate disabled', async () => {
      let capturedContext: FixContext | null = null;

      const capturingExecutor: LLMExecutor = {
        async attemptFix(task, suggestion, context) {
          capturedContext = context;
          return { attempted: true, modified: true };
        },
      };

      const metricsProvider = createMockMetricsProvider();

      const agent = createAgentHarness({
        metricsProvider,
        executor: capturingExecutor,
      });

      const task: ExperimentTask = { id: 'context-test' };
      const config: ExperimentConfig = {
        maxIterations: 10,
        gateEnabled: false, // Gate disabled
        granularity: 'dimension',
      };

      await agent.initialize(task, config);
      await agent.executeIteration(1, null, config);

      expect(capturedContext!.feedbackEnabled).toBe(false);
      expect(capturedContext!.availableTargets).toBeUndefined();
    });
  });
});
