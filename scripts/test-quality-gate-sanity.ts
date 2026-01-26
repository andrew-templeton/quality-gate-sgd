#!/usr/bin/env tsx
/**
 * Quality Gate Sanity Check
 * =========================
 * Quick test of one task through the quality-gated pipeline.
 * Validates that all components work together before running full pilot.
 */

import { loadSWEBenchTasks } from '../src/experiments/index.js';
import { createQualityGatedAgent } from '../src/experiments/docker/quality-gated-agent.js';
import type { SWEBenchTask } from '../src/experiments/swebench/types.js';
import * as path from 'path';

const PROJECT_ROOT = '/tmp/swebench-sanity';
const MODEL = 'gpt-4o';

async function main() {
  console.log('Quality Gate Sanity Check\n');
  console.log('='.repeat(80));

  // Load one simple Django task
  console.log('\n1. Loading SWE-bench tasks...');
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  const djangoTasks = allTasks.filter(task =>
    task.instanceId.startsWith('django__django') &&
    task.testSpec.failToPass &&
    task.testSpec.failToPass.length > 0 &&
    task.testSpec.failToPass.length <= 2 &&
    !task.testSpec.failToPass.some(test => test.includes('['))
  );

  if (djangoTasks.length === 0) {
    console.error('No suitable Django tasks found');
    process.exit(1);
  }

  const task = djangoTasks[0];
  console.log(`   Selected: ${task.instanceId}`);
  console.log(`   Tests: ${task.testSpec.failToPass?.length || 0}`);

  // Create quality-gated agent
  console.log('\n2. Creating quality-gated agent...');
  const agent = createQualityGatedAgent(task, {
    llm: {
      model: MODEL,
      projectRoot: PROJECT_ROOT,
      applyChanges: false,
    },
    maxReasoningIterations: 2,
    verbose: true,
  });
  console.log('   Agent created');

  // Initialize
  console.log('\n3. Initializing agent...');
  await agent.initialize(task, {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 1,
  });
  console.log('   Agent initialized');

  // Execute one iteration
  console.log('\n4. Executing iteration (reasoning + quality gate + patch + Docker eval)...');
  console.log('   This may take 2-5 minutes...\n');

  const startTime = Date.now();
  const outcome = await agent.executeIteration(1, null, {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 1,
  });
  const durationSec = (Date.now() - startTime) / 1000;

  console.log('\n5. Getting final evaluation...');
  const evaluation = await agent.evaluate({
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 1,
  });

  console.log('\n6. Cleaning up...');
  await agent.cleanup();

  // Results
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log(`Task: ${task.instanceId}`);
  console.log(`Success: ${outcome.success ? '✓' : '✗'}`);
  console.log(`ΔQ: ${outcome.actualDeltaQ.toFixed(1)}`);
  console.log(`Tests Fixed: ${evaluation.metrics.testsFixed}/${evaluation.metrics.totalTests}`);
  console.log(`Quality Score: ${evaluation.qualityScore.toFixed(1)}`);
  console.log(`Duration: ${durationSec.toFixed(1)}s`);

  if (evaluation.metrics.qualityScore !== undefined) {
    console.log(`\nReasoning Quality: ${(evaluation.metrics.qualityScore as number).toFixed(1)}`);
    console.log(`  Prior Clarity: ${(evaluation.metrics.priorClarity as number).toFixed(1)}`);
    console.log(`  Hypothesis Coherence: ${(evaluation.metrics.hypothesisCoherence as number).toFixed(1)}`);
    console.log(`  Evidence Alignment: ${(evaluation.metrics.evidenceAlignment as number).toFixed(1)}`);
    console.log(`  Solution Consistency: ${(evaluation.metrics.solutionConsistency as number).toFixed(1)}`);
    console.log(`  Outcome Observability: ${(evaluation.metrics.outcomeObservability as number).toFixed(1)}`);
  }

  if (outcome.error) {
    console.log(`\nError: ${outcome.error}`);
  }

  console.log('\n✓ Sanity check complete! All components working.');
  console.log('\nReady to run full pilot with:');
  console.log('  npx tsx scripts/run-quality-gate-pilot.ts\n');
}

main().catch(error => {
  console.error('\n✗ Sanity check failed:', error);
  process.exit(1);
});
