import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createTrajectoryLogger,
  createNullLogger,
  withTrajectoryLogging,
  analyzeTrajectory,
  computeTrajectoryMetrics,
  type TrajectoryLogger,
} from '../../../src/experiments/docker/trajectory.js';
import type { TrajectoryEvent } from '../../../src/experiments/docker/types.js';

describe('docker experiment trajectory', () => {
  // Use unique directory per test run to avoid race conditions
  const baseDir = path.join(process.cwd(), '.test-trajectory');
  let testDir: string;
  let testPath: string;
  let testCounter = 0;

  beforeEach(() => {
    testCounter++;
    testDir = path.join(baseDir, `test-${testCounter}-${Date.now()}`);
    testPath = path.join(testDir, 'trajectory.jsonl');
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up individual test directory synchronously
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(() => {
    // Clean up base directory
    try {
      if (fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createTrajectoryLogger', () => {
    it('creates log file', () => {
      const logger = createTrajectoryLogger(testPath);
      logger.close();

      expect(fs.existsSync(testPath)).toBe(true);
    });

    it('logs gate query events', () => {
      const logger = createTrajectoryLogger(testPath);

      logger.logGateQuery({
        qualityScore: 75.5,
        passed: false,
        metrics: { coverage: 75, errors: 0 },
        condition: 'baseline',
      });

      logger.close();

      const content = fs.readFileSync(testPath, 'utf-8');
      const event = JSON.parse(content.trim());

      expect(event.type).toBe('gate_query');
      expect(event.data.qualityScore).toBe(75.5);
      expect(event.data.passed).toBe(false);
      expect(event.data.condition).toBe('baseline');
    });

    it('logs suggestion events', () => {
      const logger = createTrajectoryLogger(testPath);

      logger.logSuggestion({
        suggestions: [
          { type: 'file', id: 'src/test.ts', expectedDeltaQ: 5.0 },
          { type: 'symbol', id: 'MyClass.method', expectedDeltaQ: 3.0 },
        ],
        gateEnabled: true,
      });

      logger.close();

      const content = fs.readFileSync(testPath, 'utf-8');
      const event = JSON.parse(content.trim());

      expect(event.type).toBe('suggestion_received');
      expect(event.data.suggestions).toHaveLength(2);
      expect(event.data.gateEnabled).toBe(true);
    });

    it('logs generic events', () => {
      const logger = createTrajectoryLogger(testPath);

      logger.log('error', {
        message: 'Something went wrong',
        code: 'ERR_001',
      });

      logger.close();

      const content = fs.readFileSync(testPath, 'utf-8');
      const event = JSON.parse(content.trim());

      expect(event.type).toBe('error');
      expect(event.data.message).toBe('Something went wrong');
    });

    it('generates unique event IDs', () => {
      const logger = createTrajectoryLogger(testPath);

      logger.log('test', { n: 1 });
      logger.log('test', { n: 2 });

      logger.close();

      const lines = fs.readFileSync(testPath, 'utf-8').trim().split('\n');
      const event1 = JSON.parse(lines[0]);
      const event2 = JSON.parse(lines[1]);

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('returns all logged events', () => {
      const logger = createTrajectoryLogger(testPath);

      logger.log('test', { n: 1 });
      logger.log('test', { n: 2 });
      logger.log('test', { n: 3 });

      const events = logger.getEvents();
      expect(events).toHaveLength(3);

      logger.close();
    });

    it('appends to existing file', () => {
      fs.writeFileSync(testPath, '{"type":"existing"}\n');

      const logger = createTrajectoryLogger(testPath);
      logger.log('new', {});
      logger.close();

      const lines = fs.readFileSync(testPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('createNullLogger', () => {
    it('creates no-op logger', () => {
      const logger = createNullLogger();

      logger.logGateQuery({ qualityScore: 75, passed: false, metrics: {}, condition: 'test' });
      logger.logSuggestion({ suggestions: [], gateEnabled: true });
      logger.log('test', {});
      logger.flush();
      logger.close();

      expect(logger.getEvents()).toEqual([]);
    });
  });

  describe('withTrajectoryLogging', () => {
    it('wraps handler and logs gate query results', async () => {
      const logger = createTrajectoryLogger(testPath);

      const handler = async () => ({
        qualityScore: 80,
        passed: true,
        metrics: { coverage: 80 },
        condition: 'treatment',
      });

      const wrapped = withTrajectoryLogging(logger, 'check_gate', handler);
      await wrapped({});

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('gate_query');
      expect(events[0].data.qualityScore).toBe(80);

      logger.close();
    });

    it('wraps handler and logs suggestion results', async () => {
      const logger = createTrajectoryLogger(testPath);

      const handler = async () => [
        { type: 'file', id: 'test.ts', expectedDeltaQ: 5 },
      ];

      const wrapped = withTrajectoryLogging(logger, 'get_suggestions', handler);
      await wrapped({});

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('suggestion_received');

      logger.close();
    });

    it('logs errors', async () => {
      const logger = createTrajectoryLogger(testPath);

      const handler = async () => {
        throw new Error('Handler failed');
      };

      const wrapped = withTrajectoryLogging(logger, 'some_tool', handler);

      await expect(wrapped({})).rejects.toThrow('Handler failed');

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].data.error).toBe('Handler failed');

      logger.close();
    });

    it('logs generic tool calls', async () => {
      const logger = createTrajectoryLogger(testPath);

      const handler = async (params: { foo: string }) => ({ result: params.foo });

      const wrapped = withTrajectoryLogging(logger, 'custom_tool', handler);
      await wrapped({ foo: 'bar' });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].data.tool).toBe('custom_tool');
      expect(events[0].data.params).toEqual({ foo: 'bar' });

      logger.close();
    });
  });

  describe('analyzeTrajectory', () => {
    it('analyzes empty trajectory', () => {
      const summary = analyzeTrajectory([]);

      expect(summary.totalEvents).toBe(0);
      expect(summary.gateQueries).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.qualityTrajectory).toEqual([]);
    });

    it('extracts gate query trajectory', () => {
      const events: TrajectoryEvent[] = [
        { eventId: '1', timestamp: 1000, type: 'gate_query', data: { qualityScore: 50, passed: false } },
        { eventId: '2', timestamp: 2000, type: 'gate_query', data: { qualityScore: 60, passed: false } },
        { eventId: '3', timestamp: 3000, type: 'gate_query', data: { qualityScore: 75, passed: false } },
        { eventId: '4', timestamp: 4000, type: 'gate_query', data: { qualityScore: 90, passed: true } },
      ];

      const summary = analyzeTrajectory(events);

      expect(summary.gateQueries).toBe(4);
      expect(summary.qualityTrajectory).toEqual([50, 60, 75, 90]);
      expect(summary.passTrajectory).toEqual([false, false, false, true]);
    });

    it('computes query intervals', () => {
      const events: TrajectoryEvent[] = [
        { eventId: '1', timestamp: 1000, type: 'gate_query', data: { qualityScore: 50 } },
        { eventId: '2', timestamp: 3000, type: 'gate_query', data: { qualityScore: 60 } },
        { eventId: '3', timestamp: 6000, type: 'gate_query', data: { qualityScore: 70 } },
      ];

      const summary = analyzeTrajectory(events);

      expect(summary.queryIntervals).toEqual([2000, 3000]);
    });

    it('counts suggestions by type', () => {
      const events: TrajectoryEvent[] = [
        {
          eventId: '1',
          timestamp: 1000,
          type: 'suggestion_received',
          data: {
            suggestions: [
              { type: 'file' },
              { type: 'file' },
              { type: 'symbol' },
            ],
          },
        },
        {
          eventId: '2',
          timestamp: 2000,
          type: 'suggestion_received',
          data: {
            suggestions: [
              { type: 'symbol' },
            ],
          },
        },
      ];

      const summary = analyzeTrajectory(events);

      expect(summary.suggestionTypes).toEqual({ file: 2, symbol: 2 });
    });

    it('counts errors', () => {
      const events: TrajectoryEvent[] = [
        { eventId: '1', timestamp: 1000, type: 'gate_query', data: {} },
        { eventId: '2', timestamp: 2000, type: 'error', data: { message: 'Error 1' } },
        { eventId: '3', timestamp: 3000, type: 'error', data: { message: 'Error 2' } },
      ];

      const summary = analyzeTrajectory(events);

      expect(summary.errors).toBe(2);
    });

    it('computes duration', () => {
      const events: TrajectoryEvent[] = [
        { eventId: '1', timestamp: 1000, type: 'run_started', data: {} },
        { eventId: '2', timestamp: 2000, type: 'gate_query', data: {} },
        { eventId: '3', timestamp: 5000, type: 'run_ended', data: {} },
      ];

      const summary = analyzeTrajectory(events);

      expect(summary.durationMs).toBe(4000);
    });
  });

  describe('computeTrajectoryMetrics', () => {
    it('computes metrics for successful trajectory', () => {
      const summary = analyzeTrajectory([
        { eventId: '1', timestamp: 0, type: 'gate_query', data: { qualityScore: 50, passed: false } },
        { eventId: '2', timestamp: 1000, type: 'gate_query', data: { qualityScore: 60, passed: false } },
        { eventId: '3', timestamp: 2000, type: 'gate_query', data: { qualityScore: 75, passed: false } },
        { eventId: '4', timestamp: 3000, type: 'gate_query', data: { qualityScore: 90, passed: true } },
      ]);

      const metrics = computeTrajectoryMetrics(summary);

      expect(metrics.iterationsToPass).toBe(4);
      expect(metrics.finalScore).toBe(90);
      expect(metrics.maxScore).toBe(90);
      expect(metrics.avgImprovement).toBeCloseTo(13.33, 1);
      expect(metrics.monotonicRate).toBe(1); // All improvements
    });

    it('returns Infinity for trajectories that never pass', () => {
      const summary = analyzeTrajectory([
        { eventId: '1', timestamp: 0, type: 'gate_query', data: { qualityScore: 50, passed: false } },
        { eventId: '2', timestamp: 1000, type: 'gate_query', data: { qualityScore: 60, passed: false } },
      ]);

      const metrics = computeTrajectoryMetrics(summary);

      expect(metrics.iterationsToPass).toBe(Infinity);
    });

    it('computes monotonic rate with regressions', () => {
      const summary = analyzeTrajectory([
        { eventId: '1', timestamp: 0, type: 'gate_query', data: { qualityScore: 50, passed: false } },
        { eventId: '2', timestamp: 1000, type: 'gate_query', data: { qualityScore: 60, passed: false } },
        { eventId: '3', timestamp: 2000, type: 'gate_query', data: { qualityScore: 55, passed: false } }, // Regression
        { eventId: '4', timestamp: 3000, type: 'gate_query', data: { qualityScore: 70, passed: false } },
      ]);

      const metrics = computeTrajectoryMetrics(summary);

      // 2 improvements, 1 regression out of 3 transitions
      expect(metrics.monotonicRate).toBeCloseTo(0.67, 2);
    });

    it('computes average query interval', () => {
      const summary = analyzeTrajectory([
        { eventId: '1', timestamp: 0, type: 'gate_query', data: { qualityScore: 50 } },
        { eventId: '2', timestamp: 1000, type: 'gate_query', data: { qualityScore: 60 } },
        { eventId: '3', timestamp: 3000, type: 'gate_query', data: { qualityScore: 70 } },
      ]);

      const metrics = computeTrajectoryMetrics(summary);

      expect(metrics.avgQueryInterval).toBe(1500); // (1000 + 2000) / 2
    });

    it('handles empty trajectory', () => {
      const summary = analyzeTrajectory([]);
      const metrics = computeTrajectoryMetrics(summary);

      expect(metrics.iterationsToPass).toBe(Infinity);
      expect(metrics.finalScore).toBe(0);
      expect(metrics.maxScore).toBe(0);
      expect(metrics.avgImprovement).toBe(0);
      expect(metrics.monotonicRate).toBe(1);
    });
  });
});
