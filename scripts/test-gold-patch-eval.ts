#!/usr/bin/env npx tsx
/**
 * Test Gold Patch Evaluation
 * ==========================
 * Verify that the Docker evaluation works by testing with the known-good gold patch.
 */

import { loadTasks } from '../src/experiments/swebench/loader.js';
import { evaluatePatch, getDockerInfo } from '../src/experiments/docker/evaluator.js';

async function main() {
  console.log('=== Gold Patch Evaluation Test ===\n');

  // Check Docker
  const dockerInfo = getDockerInfo();
  if (!dockerInfo.available) {
    console.error('Docker not available');
    process.exit(1);
  }
  console.log(`Docker: ${dockerInfo.version}`);

  // Load tasks
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  console.log(`Loaded ${result.tasks.length} tasks`);

  // Pick a task
  const task = result.tasks.find(t => t.instanceId === 'astropy__astropy-12907');
  if (!task) {
    console.error('Task not found');
    process.exit(1);
  }

  console.log(`\nTask: ${task.instanceId}`);
  console.log(`Tests to fix: ${task.testSpec.failToPass.length}`);

  console.log('\n--- Gold Patch ---');
  console.log(task.goldPatch!.slice(0, 500) + '...\n');

  // Evaluate the GOLD patch (this should pass!)
  console.log('--- Evaluating GOLD patch in Docker ---');
  console.log('(Using the known-good patch from SWE-bench)\n');

  const evalResult = await evaluatePatch({
    instanceId: task.instanceId,
    patch: task.goldPatch!,
    failToPass: task.testSpec.failToPass,
    passToPass: task.testSpec.passToPass.slice(0, 2),  // Just 2 regression tests
  }, {
    verbose: true,
    timeout: 600000,
  });

  console.log('\n=== EVALUATION RESULT ===');
  console.log(JSON.stringify(evalResult, null, 2));

  if (evalResult.resolved) {
    console.log('\n🎉 Gold patch passed as expected!');
  } else {
    console.log('\n❌ Gold patch failed - there may be an issue with the test harness');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
