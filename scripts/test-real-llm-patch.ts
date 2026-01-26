#!/usr/bin/env npx tsx
/**
 * Test Real LLM Patch Generation + Docker Evaluation
 * ===================================================
 * End-to-end test: LLM generates patch → Docker evaluates it
 */

import * as fs from 'fs';
import { loadTasks } from '../src/experiments/swebench/loader.js';
import { createLLMExecutor } from '../src/experiments/llm-executor.js';
import { evaluatePatch, isDockerAvailable, getDockerInfo } from '../src/experiments/docker/evaluator.js';
import type { ExperimentTask } from '../src/experiments/runner.js';
import type { FixContext } from '../src/experiments/harness.js';
import type { ExperimentConfig } from '../src/experiments/types.js';

// Load API key
const apiKey = fs.readFileSync(process.env.HOME + '/.openai-at', 'utf-8').trim();

async function main() {
  console.log('=== Real LLM Patch Generation Test ===\n');

  // Check Docker
  const dockerInfo = getDockerInfo();
  if (!dockerInfo.available) {
    console.error('Docker not available');
    process.exit(1);
  }
  console.log(`Docker: ${dockerInfo.version}`);

  // Load a simple SWE-bench task
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  console.log(`Loaded ${result.tasks.length} tasks`);

  // Pick a task (using astropy which we know has a working image)
  const task = result.tasks.find(t => t.instanceId === 'astropy__astropy-12907');
  if (!task) {
    console.error('Task not found');
    process.exit(1);
  }

  console.log(`\nTask: ${task.instanceId}`);
  console.log(`Problem: ${task.problemStatement.slice(0, 200)}...`);
  console.log(`Tests to fix: ${task.testSpec.failToPass.length}`);
  console.log(`Tests to keep: ${task.testSpec.passToPass.length}`);

  // Create LLM executor
  const executor = createLLMExecutor({
    projectRoot: '/tmp/swebench-test',  // Not used for Docker eval
    applyChanges: false,  // Don't apply locally, just generate patch
    apiKey,
    model: 'gpt-4o-mini',  // Use a real model that exists
    timeout: 120000,
  });

  // Build experiment task
  const experimentTask: ExperimentTask = {
    id: task.instanceId,
    description: task.problemStatement,
  };

  // Build fix context
  const config: ExperimentConfig = {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 5,
    prioritization: 'adjusted',
    callGraphWeighting: false,
    fixabilityEstimation: false,
  };

  const context: FixContext = {
    iteration: 1,
    currentScore: 0,
    targetScore: 100,
    metrics: {
      scripts: {},
      custom: { testsFixed: 0, totalTests: task.testSpec.failToPass.length },
    },
    feedbackEnabled: true,
    config,
  };

  // Generate patch with LLM
  console.log('\n--- Calling LLM to generate patch ---');
  const startTime = Date.now();

  let llmResult;
  try {
    llmResult = await executor.attemptFix(experimentTask, null, context);
  } catch (error) {
    console.error('LLM call failed:', error);
    process.exit(1);
  }

  const llmTime = Date.now() - startTime;
  console.log(`LLM response in ${llmTime}ms`);
  console.log(`  Attempted: ${llmResult.attempted}`);
  console.log(`  Modified: ${llmResult.modified}`);
  console.log(`  Error: ${llmResult.error || 'none'}`);
  console.log(`  Changes: ${llmResult.changes?.length || 0} files`);
  console.log(`  Patch: ${llmResult.patch ? `${llmResult.patch.split('\n').length} lines` : 'none'}`);

  if (!llmResult.patch) {
    console.log('\nNo patch generated. LLM response:');
    console.log(JSON.stringify(llmResult, null, 2));
    process.exit(1);
  }

  console.log('\n--- Generated Patch ---');
  console.log(llmResult.patch);

  // Evaluate in Docker
  console.log('\n--- Evaluating patch in Docker ---');
  console.log('(This will pull the image if needed, may take a while...)\n');

  const evalResult = await evaluatePatch({
    instanceId: task.instanceId,
    patch: llmResult.patch,
    failToPass: task.testSpec.failToPass.slice(0, 2),  // Just test first 2
    passToPass: [],  // Skip regression tests for speed
  }, {
    verbose: true,
    timeout: 600000,  // 10 minutes
  });

  console.log('\n=== EVALUATION RESULT ===');
  console.log(JSON.stringify(evalResult, null, 2));

  if (evalResult.resolved) {
    console.log('\n🎉 SUCCESS! The LLM-generated patch fixed the issue!');
  } else if (evalResult.error) {
    console.log(`\n❌ Evaluation failed: ${evalResult.error}`);
  } else {
    console.log(`\n⚠️ Patch applied but tests not passing: ${evalResult.testsFixed}/${evalResult.totalTestsToFix}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
