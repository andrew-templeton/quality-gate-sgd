#!/usr/bin/env npx tsx
/**
 * Test Django Gold Patch Evaluation
 */

import { loadTasks } from '../src/experiments/swebench/loader.js';
import { evaluatePatch, getDockerInfo } from '../src/experiments/docker/evaluator.js';

async function main() {
  console.log('=== Django Gold Patch Test ===\n');

  const dockerInfo = getDockerInfo();
  console.log(`Docker: ${dockerInfo.version}`);

  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });

  const task = result.tasks.find(t => t.instanceId === 'django__django-11049');
  if (!task) {
    console.error('Task not found');
    process.exit(1);
  }

  console.log(`\nTask: ${task.instanceId}`);
  console.log(`Tests to fix: ${task.testSpec.failToPass}`);
  console.log('\n--- Gold Patch (first 500 chars) ---');
  console.log(task.goldPatch!.slice(0, 500));

  console.log('\nTest patch present:', task.testPatch ? 'yes' : 'no');

  console.log('\n--- Evaluating in Docker ---');
  const evalResult = await evaluatePatch({
    instanceId: task.instanceId,
    patch: task.goldPatch!,
    testPatch: task.testPatch,  // Include test patch!
    failToPass: task.testSpec.failToPass,
    passToPass: [],
  }, {
    verbose: true,
    timeout: 600000,
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify({
    resolved: evalResult.resolved,
    testsFixed: evalResult.testsFixed,
    totalTestsToFix: evalResult.totalTestsToFix,
    error: evalResult.error,
  }, null, 2));
}

main().catch(console.error);
