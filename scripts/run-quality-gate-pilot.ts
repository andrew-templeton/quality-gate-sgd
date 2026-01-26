#!/usr/bin/env tsx
/**
 * Quality Gate Pilot Experiment
 * ==============================
 * A/B test comparing baseline vs quality-gated reasoning on 10 SWE-bench tasks.
 *
 * Design:
 * - 5 tasks with baseline (direct patch generation)
 * - 5 tasks with quality-gated reasoning
 * - Same model (gpt-4o) for fair comparison
 * - Real Docker evaluation for both conditions
 *
 * Metrics:
 * - Pass rate (primary outcome)
 * - Reasoning iterations (for gated condition)
 * - LLM cost (number of API calls)
 * - Time to completion
 *
 * Usage:
 *   npx tsx scripts/run-quality-gate-pilot.ts
 */

import { loadSWEBenchTasks, stratifiedSWEBenchSample } from '../src/experiments/index.js';
import { createRealLLMAgent } from '../src/experiments/docker/real-agent.js';
import { createQualityGatedAgent } from '../src/experiments/docker/quality-gated-agent.js';
import type { SWEBenchTask } from '../src/experiments/swebench/types.js';
import type { ExperimentAgent } from '../src/experiments/runner.js';
import { evaluatePatch } from '../src/experiments/docker/evaluator.js';
import * as path from 'path';
import * as fs from 'fs';

// =============================================================================
// Configuration
// =============================================================================

const PILOT_SIZE = 10; // Total tasks (5 baseline, 5 gated)
const MODEL = 'gpt-4o'; // Same model for both conditions
const PROJECT_ROOT = '/tmp/swebench-pilot'; // Temporary workspace
const RESULTS_DIR = path.join(process.cwd(), 'data/pilot-results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// =============================================================================
// Task Selection
// =============================================================================

function selectPilotTasks(): SWEBenchTask[] {
  console.log('Loading SWE-bench tasks...');

  // Load Django tasks (we have good test runner support)
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  // Filter to Django tasks with simple (non-parametrized) tests
  const djangoTasks = allTasks.filter(task =>
    task.instanceId.startsWith('django__django') &&
    task.testSpec.failToPass &&
    task.testSpec.failToPass.length > 0 &&
    task.testSpec.failToPass.length <= 3 && // Keep it simple
    !task.testSpec.failToPass.some(test => test.includes('[')) // No parametrized tests
  );

  console.log(`  Found ${djangoTasks.length} eligible Django tasks`);

  // Stratified sample by repo version
  const sample = stratifiedSWEBenchSample(
    djangoTasks,
    PILOT_SIZE,
    task => task.instanceId.split('-')[1] // Group by version
  );

  console.log(`  Selected ${sample.length} tasks for pilot\n`);

  return sample;
}

// =============================================================================
// Experiment Execution
// =============================================================================

interface TaskResult {
  taskId: string;
  condition: 'baseline' | 'gated';
  success: boolean;
  testsFixed: number;
  totalTests: number;
  reasoningIterations?: number;
  apiCalls: number;
  durationMs: number;
  error?: string;
}

async function runTask(
  task: SWEBenchTask,
  condition: 'baseline' | 'gated'
): Promise<TaskResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Task: ${task.instanceId}`);
  console.log(`Condition: ${condition}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();
  let apiCalls = 0;

  try {
    // Create appropriate agent based on condition
    let agent: ExperimentAgent;

    if (condition === 'baseline') {
      agent = createRealLLMAgent(task, false, {
        llm: {
          model: MODEL,
          projectRoot: PROJECT_ROOT,
          applyChanges: false, // Dry run - we only evaluate patches
        },
        verbose: true,
      });
      apiCalls = 1; // One API call for direct patch generation
    } else {
      agent = createQualityGatedAgent(task, {
        llm: {
          model: MODEL,
          projectRoot: PROJECT_ROOT,
          applyChanges: false,
        },
        maxReasoningIterations: 3,
        verbose: true,
      });
      // Quality-gated makes 2 calls per reasoning attempt (reasoning + patch)
      // Plus up to 3 refinement iterations
      apiCalls = 2; // Will be updated if we track actual iterations
    }

    // Initialize agent
    await agent.initialize(task, {
      gateEnabled: condition === 'gated',
      topology: 'full',
      granularity: 'symbol',
      maxIterations: 1, // Single iteration for pilot
    });

    // Execute one iteration
    const suggestion = condition === 'gated' ? await agent.getSuggestion?.({
      gateEnabled: true,
      topology: 'full',
      granularity: 'symbol',
      maxIterations: 1,
    }) : null;

    const outcome = await agent.executeIteration(1, suggestion ?? null, {
      gateEnabled: condition === 'gated',
      topology: 'full',
      granularity: 'symbol',
      maxIterations: 1,
    });

    // Get final evaluation
    const evaluation = await agent.evaluate({
      gateEnabled: condition === 'gated',
      topology: 'full',
      granularity: 'symbol',
      maxIterations: 1,
    });

    // Cleanup
    await agent.cleanup();

    const durationMs = Date.now() - startTime;

    return {
      taskId: task.instanceId,
      condition,
      success: evaluation.passed,
      testsFixed: evaluation.metrics.testsFixed as number || 0,
      totalTests: evaluation.metrics.totalTests as number || 0,
      reasoningIterations: condition === 'gated' ? (evaluation.metrics.reasoningIterations as number || 1) : undefined,
      apiCalls,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${errorMsg}\n`);

    return {
      taskId: task.instanceId,
      condition,
      success: false,
      testsFixed: 0,
      totalTests: 0,
      apiCalls,
      durationMs,
      error: errorMsg,
    };
  }
}

// =============================================================================
// Results Analysis
// =============================================================================

function analyzeResults(results: TaskResult[]): void {
  const baseline = results.filter(r => r.condition === 'baseline');
  const gated = results.filter(r => r.condition === 'gated');

  const baselinePassRate = baseline.filter(r => r.success).length / baseline.length;
  const gatedPassRate = gated.filter(r => r.success).length / gated.length;

  const baselineAvgCalls = baseline.reduce((sum, r) => sum + r.apiCalls, 0) / baseline.length;
  const gatedAvgCalls = gated.reduce((sum, r) => sum + r.apiCalls, 0) / gated.length;

  const baselineAvgTime = baseline.reduce((sum, r) => sum + r.durationMs, 0) / baseline.length;
  const gatedAvgTime = gated.reduce((sum, r) => sum + r.durationMs, 0) / gated.length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`PILOT RESULTS (N=${PILOT_SIZE})`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`BASELINE (Direct Patch Generation)`);
  console.log(`  Pass Rate: ${(baselinePassRate * 100).toFixed(1)}% (${baseline.filter(r => r.success).length}/${baseline.length})`);
  console.log(`  Avg API Calls: ${baselineAvgCalls.toFixed(1)}`);
  console.log(`  Avg Time: ${(baselineAvgTime / 1000).toFixed(1)}s\n`);

  console.log(`GATED (Quality-Gated Reasoning)`);
  console.log(`  Pass Rate: ${(gatedPassRate * 100).toFixed(1)}% (${gated.filter(r => r.success).length}/${gated.length})`);
  console.log(`  Avg API Calls: ${gatedAvgCalls.toFixed(1)}`);
  console.log(`  Avg Time: ${(gatedAvgTime / 1000).toFixed(1)}s\n`);

  const improvement = (gatedPassRate - baselinePassRate) * 100;
  const costMultiplier = gatedAvgCalls / baselineAvgCalls;

  console.log(`COMPARISON`);
  console.log(`  Pass Rate Δ: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}pp`);
  console.log(`  Cost Multiplier: ${costMultiplier.toFixed(1)}x`);
  console.log(`  Time Multiplier: ${(gatedAvgTime / baselineAvgTime).toFixed(1)}x\n`);

  if (improvement >= 5) {
    console.log(`✓ Quality gate shows promising improvement (≥5pp)`);
  } else if (improvement >= 0) {
    console.log(`⚠ Quality gate shows marginal improvement (<5pp)`);
  } else {
    console.log(`✗ Quality gate underperforms baseline`);
  }

  console.log('');
}

function saveResults(results: TaskResult[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `pilot-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: MODEL,
      pilotSize: PILOT_SIZE,
    },
    results,
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${filepath}\n`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Quality Gate Pilot Experiment');
  console.log(`Model: ${MODEL}`);
  console.log(`Tasks: ${PILOT_SIZE} (${PILOT_SIZE/2} baseline, ${PILOT_SIZE/2} gated)\n`);

  // Select tasks
  const tasks = await selectPilotTasks();

  // Assign conditions (alternate for balance)
  const results: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const condition: 'baseline' | 'gated' = i % 2 === 0 ? 'baseline' : 'gated';

    const result = await runTask(task, condition);
    results.push(result);

    // Show progress
    console.log(`\nCompleted ${i + 1}/${tasks.length} tasks`);
    console.log(`  Baseline: ${results.filter(r => r.condition === 'baseline' && r.success).length}/${results.filter(r => r.condition === 'baseline').length}`);
    console.log(`  Gated: ${results.filter(r => r.condition === 'gated' && r.success).length}/${results.filter(r => r.condition === 'gated').length}`);
  }

  // Analyze and save
  analyzeResults(results);
  saveResults(results);

  console.log('Pilot complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
