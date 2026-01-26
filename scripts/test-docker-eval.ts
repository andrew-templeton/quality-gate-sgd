#!/usr/bin/env npx tsx
/**
 * Test Docker Evaluation
 * ======================
 * Tests the Docker-based SWE-bench evaluation with a gold patch.
 */

import { loadTasks } from '../src/experiments/swebench/loader.js';
import { evaluatePatch } from '../src/experiments/docker/evaluator.js';

async function main() {
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  const task = result.tasks.find(t => t.instanceId === 'astropy__astropy-12907');

  if (!task) {
    console.log('Task not found');
    process.exit(1);
  }

  console.log('Evaluating gold patch for:', task.instanceId);
  console.log('FAIL_TO_PASS tests:', task.testSpec.failToPass);
  console.log('');

  const evalResult = await evaluatePatch({
    instanceId: task.instanceId,
    patch: task.goldPatch!,
    failToPass: task.testSpec.failToPass,
    passToPass: task.testSpec.passToPass.slice(0, 2), // Just test a few
  }, {
    verbose: true,
    timeout: 600000, // 10 minutes
  });

  console.log('\n=== EVALUATION RESULT ===');
  console.log(JSON.stringify(evalResult, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
