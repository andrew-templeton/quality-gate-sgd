#!/usr/bin/env npx tsx
/**
 * Run Experiment Design A: Gate vs No-Gate
 * =========================================
 * Tests H1 (fewer iterations with gate) and H2 (higher pass rate with gate).
 *
 * This script simulates an experiment using mock agents with different
 * improvement probabilities to test the hypothesis that quality gate
 * feedback improves convergence.
 *
 * Usage:
 *   npx tsx scripts/run-experiment-a.ts [--tasks=N] [--seed=S]
 */

import {
  executeBatch,
  createMockAgent,
  type ExperimentTask,
} from '../src/experiments/runner.js';
import {
  analyzeBatch,
  generateAnalysisReport,
} from '../src/experiments/analyzer.js';
import { visualizeBatch, visualizeResults } from '../src/experiments/visualize.js';
import type { ExperimentDesign } from '../src/experiments/types.js';
import * as path from 'path';
import * as fs from 'fs';

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const NUM_TASKS = parseInt(getArg('tasks', '30'), 10);
const SEED = parseInt(getArg('seed', String(Date.now())), 10);
const LOG_DIR = path.join(process.cwd(), '.experiments');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// =============================================================================
// Mock Task Generator
// =============================================================================

function generateMockTasks(count: number, seed: number): ExperimentTask[] {
  const tasks: ExperimentTask[] = [];
  let rng = seededRandom(seed);

  // Simulate different difficulty levels
  const difficulties = ['easy', 'medium', 'hard'];

  for (let i = 0; i < count; i++) {
    const difficulty = difficulties[Math.floor(rng() * difficulties.length)];
    tasks.push({
      id: `mock-task-${i + 1}`,
      description: `Mock ${difficulty} task #${i + 1}`,
      metadata: {
        difficulty,
        complexity: Math.floor(rng() * 100),
        expectedIterations: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : 15,
      },
    });
  }

  return tasks;
}

// =============================================================================
// Seeded RNG
// =============================================================================

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// =============================================================================
// Main Experiment
// =============================================================================

async function main(): Promise<void> {
  console.log('=' .repeat(60));
  console.log('EXPERIMENT DESIGN A: Gate vs No-Gate');
  console.log('=' .repeat(60));
  console.log('');
  console.log(`Tasks: ${NUM_TASKS}`);
  console.log(`Seed: ${SEED}`);
  console.log(`Log directory: ${LOG_DIR}`);
  console.log('');

  // Generate mock tasks
  console.log('Generating mock tasks...');
  const tasks = generateMockTasks(NUM_TASKS, SEED);
  console.log(`  Created ${tasks.length} tasks`);
  console.log('');

  // Create mock agent
  // The mock agent simulates an LLM with different behavior based on gate feedback:
  // - With gate feedback: 70% improvement probability (guided suggestions help)
  // - Without gate feedback: 50% improvement probability (random exploration)
  console.log('Creating mock agent...');
  console.log('  Baseline (no gate): 50% improvement probability');
  console.log('  Treatment (with gate): 70% improvement probability');
  console.log('');

  // The mock agent's behavior is controlled by the condition config
  // We need to create a dynamic agent that changes behavior based on gateEnabled
  const createDynamicAgent = () => {
    let gateEnabled = false;
    let seed = SEED;

    return {
      async initialize(task: ExperimentTask, config: { gateEnabled: boolean; maxIterations: number }) {
        gateEnabled = config.gateEnabled;
        // Different seed per task for variability, but reproducible
        seed = SEED + parseInt(task.id.split('-').pop() || '0', 10);
      },

      async getSuggestion() {
        return {
          type: 'symbol' as const,
          id: `mock-symbol`,
          expectedDeltaQ: 5,
        };
      },

      async executeIteration() {
        const rng = seededRandom(seed++);
        // Key difference: gate-enabled agents get better suggestions
        const improvementProb = gateEnabled ? 0.70 : 0.50;
        const improved = rng() < improvementProb;
        const delta = improved ? 3 + rng() * 7 : -(rng() * 2);

        return {
          success: improved,
          actualDeltaQ: delta,
          targetMatched: true,
        };
      },

      async evaluate(config: { gateEnabled: boolean }) {
        // Track cumulative progress
        const baseScore = gateEnabled ? 55 : 50; // Slight advantage from guidance
        return {
          metrics: { quality: baseScore },
          qualityScore: baseScore,
          passed: baseScore >= 90,
        };
      },

      async cleanup() {},
    };
  };

  // Actually, we need a stateful agent that tracks progress across iterations
  // Let me create a proper simulation
  const createStatefulAgent = () => {
    let currentScore = 50;
    let gateEnabled = false;
    let taskSeed = SEED;
    let rng = seededRandom(SEED);

    return {
      async initialize(task: ExperimentTask, config: { gateEnabled: boolean; maxIterations: number }) {
        currentScore = 50; // Reset for each task
        gateEnabled = config.gateEnabled;
        taskSeed = SEED + parseInt(task.id.split('-').pop() || '0', 10) * 1000;
        // Add condition-specific offset to ensure different trajectories
        if (gateEnabled) taskSeed += 500000;
        rng = seededRandom(taskSeed);
      },

      async getSuggestion() {
        if (!gateEnabled) return null;
        return {
          type: 'symbol' as const,
          id: `mock-symbol-${Math.floor(rng() * 100)}`,
          expectedDeltaQ: 5 + rng() * 5,
        };
      },

      async executeIteration() {
        // Key difference: gate-enabled agents have higher success rate
        // This simulates the value of targeted guidance vs random exploration
        const improvementProb = gateEnabled ? 0.72 : 0.52;
        const improved = rng() < improvementProb;

        // Improvement magnitude
        const delta = improved
          ? 2 + rng() * 6  // +2 to +8 points
          : -(rng() * 2);  // -0 to -2 points

        currentScore = Math.max(0, Math.min(100, currentScore + delta));

        return {
          success: improved,
          actualDeltaQ: delta,
          targetMatched: gateEnabled,
        };
      },

      async evaluate() {
        return {
          metrics: {
            quality: currentScore,
            coverage: currentScore,
          },
          qualityScore: currentScore,
          passed: currentScore >= 90,
        };
      },

      async cleanup() {
        currentScore = 50;
      },
    };
  };

  const agent = createStatefulAgent();

  // Run the experiment
  console.log('Running experiment...');
  console.log('  This will run each task under both conditions (baseline + treatment)');
  console.log('');

  const startTime = Date.now();

  const batch = await executeBatch(
    'A' as ExperimentDesign,
    tasks,
    agent,
    {
      logDir: LOG_DIR,
      onRunComplete: (run, index, total) => {
        const status = run.outcome.passed ? '✓' : '✗';
        const iters = run.outcome.iterationsToPass ?? run.iterations.length;
        const condition = run.condition.config.gateEnabled ? 'gate' : 'no-gate';
        process.stdout.write(`\r  [${index + 1}/${total}] ${status} ${run.taskId} (${condition}): ${iters} iterations`);
      },
    }
  );

  const elapsed = Date.now() - startTime;
  console.log('\n');
  console.log(`Experiment completed in ${(elapsed / 1000).toFixed(1)}s`);
  console.log('');

  // Visualize results
  console.log('=' .repeat(60));
  console.log('BATCH VISUALIZATION');
  console.log('=' .repeat(60));
  console.log('');
  console.log(visualizeBatch(batch));

  // Analyze results
  console.log('');
  console.log('=' .repeat(60));
  console.log('HYPOTHESIS ANALYSIS');
  console.log('=' .repeat(60));
  console.log('');

  const results = analyzeBatch(batch);

  console.log(visualizeResults(results));
  console.log('');

  // Generate full report
  const report = generateAnalysisReport(batch, results);
  const reportPath = path.join(LOG_DIR, `report-${batch.batchId}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`Full report saved to: ${reportPath}`);
  console.log('');

  // Summary
  console.log('=' .repeat(60));
  console.log('SUMMARY');
  console.log('=' .repeat(60));
  console.log('');

  for (const result of results) {
    const icon = result.supported ? '✓' : '✗';
    console.log(`${icon} ${result.hypothesis}: ${result.interpretation}`);
  }

  console.log('');

  // Exit with appropriate code
  const allSupported = results.every(r => r.supported);
  process.exit(allSupported ? 0 : 1);
}

main().catch(error => {
  console.error('Experiment failed:', error);
  process.exit(1);
});
