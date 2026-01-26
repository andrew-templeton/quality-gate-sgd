#!/usr/bin/env tsx

import { loadSWEBenchTasks } from '../src/experiments/index.js';
import { extractCodeFromDocker } from '../src/experiments/docker/code-extractor.js';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const { tasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  const task = tasks.find(t => t.instanceId === 'astropy__astropy-12907');
  if (!task) {
    console.error('Task not found');
    process.exit(1);
  }

  console.log('Task:', task.instanceId);
  console.log('Problem statement snippet:', task.problemStatement.slice(0, 200), '...');

  console.log('\nExtracting code from Docker...');
  const extraction = await extractCodeFromDocker(task, { verbose: true, maxFiles: 5 });

  console.log('\nExtracted:', extraction.filesExtracted, 'files');
  for (const p of extraction.extractedPaths) {
    const fullPath = path.join(extraction.projectRoot, p);
    const size = fs.statSync(fullPath).size;
    console.log(`  - ${p} (${size} bytes)`);
  }

  extraction.cleanup();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
