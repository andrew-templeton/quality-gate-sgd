/**
 * Analyzer Integration Tests
 * ==========================
 * Tests the full analysis pipeline from batch data to hypothesis results.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeBatch,
  generateAnalysisReport,
  computeWastedIterationRate,
  computeWastedIterationBreakdown,
  type ExperimentBatch,
  type ExperimentRun,
  type ExperimentCondition,
} from '../../src/experiments/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockCondition(
  name: string,
  overrides: Partial<ExperimentCondition['config']> = {}
): ExperimentCondition {
  return {
    name,
    design: 'A',
    config: {
      gateEnabled: true,
      topology: 'full',
      callGraphWeighting: false,
      prioritization: 'raw',
      fixabilityThreshold: 0.5,
      ...overrides,
    },
  };
}

function createMockRun(
  taskId: string,
  condition: ExperimentCondition,
  outcome: {
    passed: boolean;
    iterationsToPass?: number;
    monotonicRate: number;
    wastedIterations: number;
  },
  iterations: ExperimentRun['iterations'] = []
): ExperimentRun {
  const runId = `run-${taskId}-${condition.name}`;
  return {
    runId,
    taskId,
    condition,
    startTime: Date.now(),
    endTime: Date.now() + 1000,
    iterations: iterations.length > 0 ? iterations : [
      {
        iteration: 1,
        timestamp: Date.now(),
        metrics: { coverage: 50 },
        score: 50,
        passed: false,
        delta: 0,
      },
    ],
    outcome: {
      passed: outcome.passed,
      iterationsToPass: outcome.iterationsToPass,
      finalScore: outcome.passed ? 100 : 70,
      monotonicRate: outcome.monotonicRate,
      wastedIterations: outcome.wastedIterations,
    },
    metadata: {
      mappingCoverage: 0.8,
      callGraphResolution: 0.7,
      p90AddressSloc: 30,
    },
  };
}

function createMockBatch(
  design: 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
  runs: ExperimentRun[]
): ExperimentBatch {
  const hypothesesMap: Record<string, string[]> = {
    A: ['H1', 'H2'],
    B: ['H3'],
    C: ['H4', 'H5', 'H6'],
    D: ['H7', 'H8'],
    E: ['H9', 'H10'],
    F: ['H11', 'H12'],
  };

  return {
    batchId: `batch-${design}-test`,
    design,
    hypotheses: hypothesesMap[design] as ExperimentBatch['hypotheses'],
    runs,
    startTime: Date.now(),
    endTime: Date.now() + 10000,
    metadata: {},
  };
}

// =============================================================================
// Design A Tests (H1, H2)
// =============================================================================

describe('Design A: Gate vs No-Gate', () => {
  it('H1: detects faster convergence with gate enabled', () => {
    const baselineCondition = createMockCondition('no-gate', { gateEnabled: false });
    const treatmentCondition = createMockCondition('gate', { gateEnabled: true });

    // Baseline: slower convergence (8-10 iterations)
    const baselineRuns = [
      createMockRun('task-1', baselineCondition, { passed: true, iterationsToPass: 10, monotonicRate: 0.6, wastedIterations: 2 }),
      createMockRun('task-2', baselineCondition, { passed: true, iterationsToPass: 9, monotonicRate: 0.5, wastedIterations: 3 }),
      createMockRun('task-3', baselineCondition, { passed: true, iterationsToPass: 8, monotonicRate: 0.7, wastedIterations: 1 }),
      createMockRun('task-4', baselineCondition, { passed: true, iterationsToPass: 10, monotonicRate: 0.5, wastedIterations: 2 }),
      createMockRun('task-5', baselineCondition, { passed: true, iterationsToPass: 9, monotonicRate: 0.6, wastedIterations: 2 }),
    ];

    // Treatment: faster convergence (3-5 iterations)
    const treatmentRuns = [
      createMockRun('task-1', treatmentCondition, { passed: true, iterationsToPass: 4, monotonicRate: 0.9, wastedIterations: 0 }),
      createMockRun('task-2', treatmentCondition, { passed: true, iterationsToPass: 3, monotonicRate: 0.8, wastedIterations: 1 }),
      createMockRun('task-3', treatmentCondition, { passed: true, iterationsToPass: 5, monotonicRate: 0.85, wastedIterations: 0 }),
      createMockRun('task-4', treatmentCondition, { passed: true, iterationsToPass: 4, monotonicRate: 0.9, wastedIterations: 0 }),
      createMockRun('task-5', treatmentCondition, { passed: true, iterationsToPass: 3, monotonicRate: 0.95, wastedIterations: 0 }),
    ];

    const batch = createMockBatch('A', [...baselineRuns, ...treatmentRuns]);
    const results = analyzeBatch(batch);

    const h1 = results.find(r => r.hypothesis === 'H1');
    expect(h1).toBeDefined();
    expect(h1!.test.pValue).toBeLessThan(0.05);
    expect(h1!.supported).toBe(true);
    expect(h1!.interpretation).toContain('reduced iterations');
  });

  it('H2: detects higher pass rate with gate enabled', () => {
    const baselineCondition = createMockCondition('no-gate', { gateEnabled: false });
    const treatmentCondition = createMockCondition('gate', { gateEnabled: true });

    // Baseline: 40% pass rate
    const baselineRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, baselineCondition, {
        passed: i < 4,
        iterationsToPass: i < 4 ? 8 : undefined,
        monotonicRate: 0.5,
        wastedIterations: 2,
      })
    );

    // Treatment: 90% pass rate
    const treatmentRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, treatmentCondition, {
        passed: i < 9,
        iterationsToPass: i < 9 ? 4 : undefined,
        monotonicRate: 0.8,
        wastedIterations: 0,
      })
    );

    const batch = createMockBatch('A', [...baselineRuns, ...treatmentRuns]);
    const results = analyzeBatch(batch);

    const h2 = results.find(r => r.hypothesis === 'H2');
    expect(h2).toBeDefined();
    expect(h2!.test.pValue).toBeLessThan(0.05);
    expect(h2!.supported).toBe(true);
  });
});

// =============================================================================
// Design B Tests (H3) - ANOVA
// =============================================================================

describe('Design B: Topology Sensitivity', () => {
  it('H3: uses ANOVA to compare multiple topologies', () => {
    const coverageOnlyCondition = createMockCondition('coverage-only', { topology: 'coverage-only' });
    const ceilingsCondition = createMockCondition('coverage-ceilings', { topology: 'coverage-ceilings' });
    const fullCondition = createMockCondition('full', { topology: 'full' });

    // Coverage-only: low monotonic rate (0.3-0.5)
    const coverageRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, coverageOnlyCondition, {
        passed: true,
        iterationsToPass: 8,
        monotonicRate: 0.3 + Math.random() * 0.2,
        wastedIterations: 3,
      })
    );

    // Coverage-ceilings: medium monotonic rate (0.5-0.7)
    const ceilingsRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, ceilingsCondition, {
        passed: true,
        iterationsToPass: 6,
        monotonicRate: 0.5 + Math.random() * 0.2,
        wastedIterations: 2,
      })
    );

    // Full: high monotonic rate (0.8-0.95)
    const fullRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, fullCondition, {
        passed: true,
        iterationsToPass: 4,
        monotonicRate: 0.8 + Math.random() * 0.15,
        wastedIterations: 1,
      })
    );

    const batch = createMockBatch('B', [...coverageRuns, ...ceilingsRuns, ...fullRuns]);
    const results = analyzeBatch(batch);

    const h3 = results.find(r => r.hypothesis === 'H3');
    expect(h3).toBeDefined();
    expect(h3!.test.test).toBe('one-way-anova');
    expect(h3!.test.pValue).toBeLessThan(0.05);
  });
});

// =============================================================================
// Design E Tests (H9, H10) - ROC-AUC
// =============================================================================

describe('Design E: Fixability Estimation', () => {
  it('H9: uses ROC-AUC for fixability validation', () => {
    const condition = createMockCondition('fixability-test');

    // Create runs with fixability scores and outcomes
    const runs = Array.from({ length: 5 }, (_, i) =>
      createMockRun(`task-${i}`, condition, {
        passed: true,
        iterationsToPass: 5,
        monotonicRate: 0.7,
        wastedIterations: 1,
      }, [
        // High fixability -> success
        {
          iteration: 1,
          timestamp: Date.now(),
          metrics: { coverage: 60 },
          score: 60,
          passed: false,
          delta: 10,
          target: { symbolId: 'sym-1', expectedDeltaQ: 5, fixabilityScore: 0.8 },
          outcome: { success: true, actualDeltaQ: 4 },
        },
        {
          iteration: 2,
          timestamp: Date.now(),
          metrics: { coverage: 70 },
          score: 70,
          passed: false,
          delta: 10,
          target: { symbolId: 'sym-2', expectedDeltaQ: 3, fixabilityScore: 0.9 },
          outcome: { success: true, actualDeltaQ: 3 },
        },
        // Low fixability -> failure
        {
          iteration: 3,
          timestamp: Date.now(),
          metrics: { coverage: 75 },
          score: 75,
          passed: false,
          delta: 5,
          target: { symbolId: 'sym-3', expectedDeltaQ: 4, fixabilityScore: 0.2 },
          outcome: { success: false, actualDeltaQ: -1 },
        },
        {
          iteration: 4,
          timestamp: Date.now(),
          metrics: { coverage: 80 },
          score: 80,
          passed: false,
          delta: 5,
          target: { symbolId: 'sym-4', expectedDeltaQ: 2, fixabilityScore: 0.15 },
          outcome: { success: false, actualDeltaQ: 0 },
        },
        // Mixed
        {
          iteration: 5,
          timestamp: Date.now(),
          metrics: { coverage: 100 },
          score: 100,
          passed: true,
          delta: 20,
          target: { symbolId: 'sym-5', expectedDeltaQ: 10, fixabilityScore: 0.7 },
          outcome: { success: true, actualDeltaQ: 8 },
        },
      ])
    );

    const batch = createMockBatch('E', runs);
    const results = analyzeBatch(batch);

    const h9 = results.find(r => r.hypothesis === 'H9');
    expect(h9).toBeDefined();
    expect(h9!.interpretation).toContain('AUC');
  });
});

// =============================================================================
// Design F Tests (H11, H12) - Wasted Iteration Rate
// =============================================================================

describe('Design F: Adjusted Prioritization', () => {
  it('H12: computes wasted iteration rate correctly', () => {
    const rawCondition = createMockCondition('raw', { prioritization: 'raw' });
    const adjustedCondition = createMockCondition('adjusted', { prioritization: 'adjusted' });

    // Raw: high wasted iteration rate
    const rawRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, rawCondition, {
        passed: true,
        iterationsToPass: 8,
        monotonicRate: 0.5,
        wastedIterations: 4, // 50% wasted
      }, Array.from({ length: 8 }, (_, j) => ({
        iteration: j + 1,
        timestamp: Date.now(),
        metrics: { coverage: 50 + j * 5 },
        score: 50 + j * 5,
        passed: j === 7,
        delta: 5,
      })))
    );

    // Adjusted: low wasted iteration rate
    const adjustedRuns = Array.from({ length: 10 }, (_, i) =>
      createMockRun(`task-${i}`, adjustedCondition, {
        passed: true,
        iterationsToPass: 4,
        monotonicRate: 0.9,
        wastedIterations: 0, // 0% wasted
      }, Array.from({ length: 4 }, (_, j) => ({
        iteration: j + 1,
        timestamp: Date.now(),
        metrics: { coverage: 50 + j * 12 },
        score: 50 + j * 12,
        passed: j === 3,
        delta: 12,
      })))
    );

    const batch = createMockBatch('F', [...rawRuns, ...adjustedRuns]);
    const results = analyzeBatch(batch);

    const h12 = results.find(r => r.hypothesis === 'H12');
    expect(h12).toBeDefined();
    expect(h12!.test.pValue).toBeLessThan(0.05);
    expect(h12!.supported).toBe(true);
  });
});

// =============================================================================
// Report Generation Tests
// =============================================================================

describe('Report Generation', () => {
  it('generates markdown report with all sections', () => {
    const condition = createMockCondition('test');
    const runs = [
      createMockRun('task-1', condition, { passed: true, iterationsToPass: 5, monotonicRate: 0.8, wastedIterations: 1 }),
    ];

    const batch = createMockBatch('A', runs);
    const results = analyzeBatch(batch);
    const report = generateAnalysisReport(batch, results);

    expect(report).toContain('# Experiment Analysis Report');
    expect(report).toContain('**Batch ID:**');
    expect(report).toContain('**Design:**');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Results');
    expect(report).toContain('**Statistics:**');
    expect(report).toContain('**Interpretation:**');
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Utility Functions', () => {
  it('computes wasted iteration rate from run outcome', () => {
    const condition = createMockCondition('test');
    const run = createMockRun('task-1', condition, {
      passed: true,
      iterationsToPass: 10,
      monotonicRate: 0.7,
      wastedIterations: 3,
    }, Array.from({ length: 10 }, (_, j) => ({
      iteration: j + 1,
      timestamp: Date.now(),
      metrics: { coverage: 50 + j * 5 },
      score: 50 + j * 5,
      passed: j === 9,
      delta: 5,
    })));

    const rate = computeWastedIterationRate(run);
    expect(rate).toBeCloseTo(0.3, 1); // 3/10 = 0.3
  });

  it('computes wasted iteration breakdown', () => {
    const condition = createMockCondition('test');
    const run = createMockRun('task-1', condition, {
      passed: true,
      iterationsToPass: 5,
      monotonicRate: 0.6,
      wastedIterations: 2,
    }, [
      {
        iteration: 1,
        timestamp: Date.now(),
        metrics: { coverage: 50 },
        score: 50,
        passed: false,
        delta: 10,
        target: { symbolId: 'sym-1', expectedDeltaQ: 5, fixabilityScore: 0.1 }, // Low fixability, will be wasted
        outcome: { success: false, actualDeltaQ: -2 },
      },
      {
        iteration: 2,
        timestamp: Date.now(),
        metrics: { coverage: 60 },
        score: 60,
        passed: false,
        delta: 10,
        target: { symbolId: 'sym-2', expectedDeltaQ: 4, fixabilityScore: 0.8 },
        outcome: { success: true, actualDeltaQ: 5 },
      },
      {
        iteration: 3,
        timestamp: Date.now(),
        metrics: { coverage: 65 },
        score: 65,
        passed: false,
        delta: 5,
        target: { symbolId: 'sym-3', expectedDeltaQ: 3, fixabilityScore: 0.2 }, // Low fixability, will be wasted
        outcome: { success: false, actualDeltaQ: 0 },
      },
      {
        iteration: 4,
        timestamp: Date.now(),
        metrics: { coverage: 80 },
        score: 80,
        passed: false,
        delta: 15,
        target: { symbolId: 'sym-4', expectedDeltaQ: 8, fixabilityScore: 0.9 },
        outcome: { success: true, actualDeltaQ: 10 },
      },
      {
        iteration: 5,
        timestamp: Date.now(),
        metrics: { coverage: 100 },
        score: 100,
        passed: true,
        delta: 20,
        target: { symbolId: 'sym-5', expectedDeltaQ: 10, fixabilityScore: 0.85 },
        outcome: { success: true, actualDeltaQ: 12 },
      },
    ]);

    const breakdown = computeWastedIterationBreakdown(run);
    expect(breakdown.total).toBe(5);
    expect(breakdown.failed).toBe(2); // Iterations 1 and 3 failed
    expect(breakdown.wasted).toBe(2); // Both failed iterations had low fixability
    expect(breakdown.rate).toBeCloseTo(0.4, 1); // 2/5 = 0.4
  });
});
