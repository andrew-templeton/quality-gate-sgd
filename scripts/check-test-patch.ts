#!/usr/bin/env npx tsx
import { loadTasks } from '../src/experiments/swebench/loader.js';

const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
const task = result.tasks.find(t => t.instanceId === 'django__django-11049');

console.log('Has test patch:', task?.testPatch ? 'yes' : 'no');
console.log('Test patch length:', task?.testPatch?.length ?? 0);

if (task?.testPatch) {
  console.log('\nTest Patch:\n', task.testPatch.slice(0, 1500));
}
