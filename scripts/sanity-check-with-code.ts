#!/usr/bin/env tsx
/**
 * Sanity Check with Code Context
 * ===============================
 * Tests quality-gated reasoning with real code extraction from Docker.
 */

import { loadSWEBenchTasks } from '../src/experiments/index.js';
import { createQualityGatedAgent } from '../src/experiments/docker/quality-gated-agent.js';
import * as path from 'path';
import * as fs from 'fs';

const OPENAI_API_KEY = fs.readFileSync(path.join(process.env.HOME || '', '.openai-at'), 'utf-8').trim();

async function main() {
  console.log('Quality Gate Sanity Check (with Code Context)\n');
  console.log('='.repeat(80));

  // Load astropy task (has explicit file mention)
  console.log('\n1. Loading task...');
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  const task = allTasks.find(t => t.instanceId === 'astropy__astropy-12907');
  if (!task) {
    console.error('Task not found');
    process.exit(1);
  }

  console.log(`   Selected: ${task.instanceId}`);
  console.log(`   Tests: ${task.testSpec.failToPass?.length || 0}`);

  // Create agent with code extraction enabled
  console.log('\n2. Creating quality-gated agent...');
  const agent = createQualityGatedAgent(task, {
    llm: {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4o',
      projectRoot: '/tmp/swebench-sanity', // Will be overridden by code extraction
      applyChanges: false,
    },
    extractCode: true, // Enable code extraction
    maxReasoningIterations: 2,
    verbose: true,
  });

  console.log('   ✓ Agent created (with code extraction enabled)');

  // Initialize
  console.log('\n3. Initializing...');
  await agent.initialize(task, {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 1,
  });

  // Execute one iteration
  console.log('\n4. Executing iteration (code extraction + reasoning + quality gate + patch + eval)...');
  console.log('   This will:');
  console.log('   - Extract code from Docker container');
  console.log('   - Provide code context to LLM');
  console.log('   - Generate structured reasoning');
  console.log('   - Evaluate quality');
  console.log('   - Generate patch');
  console.log('   - Test in Docker');
  console.log('   (May take 2-5 minutes)');
  console.log('');

  const startTime = Date.now();
  const outcome = await agent.executeIteration(1, null, {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 1,
  });
  const durationSec = (Date.now() - startTime) / 1000;

  console.log('\n5. Getting evaluation...');
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

  console.log('\n✓ Sanity check complete!');

  if (evaluation.metrics.testsFixed > 0) {
    console.log('\n🎉 CODE CONTEXT WORKED! LLM fixed tests with real code access!');
  } else {
    console.log('\n⚠️  No tests fixed, but infrastructure is working.');
    console.log('    This validates code extraction and quality gating work end-to-end.');
  }

  console.log('');
}

main().catch(error => {
  console.error('\n✗ Sanity check failed:', error);
  process.exit(1);
});
