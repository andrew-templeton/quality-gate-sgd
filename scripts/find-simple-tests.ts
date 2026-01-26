#!/usr/bin/env npx tsx
import { loadTasks } from '../src/experiments/swebench/loader.js';

const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });

// Find tasks with simple test names (not parametrized)
const good = result.tasks.filter(t =>
  t.testSpec.failToPass.every(test => !test.includes('[')) &&
  t.testSpec.failToPass.length > 0 &&
  t.goldPatch
).slice(0, 10);

console.log(`Found ${good.length} tasks with non-parametrized tests:\n`);

good.forEach(t => {
  console.log('---');
  console.log('ID:', t.instanceId);
  console.log('Tests:', t.testSpec.failToPass.slice(0, 2).join(', '));
});
