#!/usr/bin/env tsx
/**
 * Test Docker Code Extraction
 * ============================
 * Validates that we can extract files from actual Docker containers.
 */

import { loadSWEBenchTasks } from '../src/experiments/index.js';
import { extractCodeFromDocker } from '../src/experiments/docker/code-extractor.js';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  console.log('Docker Code Extraction Test\n');
  console.log('='.repeat(80));

  // Load a Django task
  console.log('\n1. Loading Django task...');
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  const djangoTasks = allTasks.filter(task => task.instanceId.startsWith('django__django'));
  const task = djangoTasks[0];

  console.log(`   Selected: ${task.instanceId}`);

  // Test extraction
  console.log('\n2. Extracting code from Docker...');
  console.log('   (This will pull Docker image if not present - may take a minute)');

  const extraction = await extractCodeFromDocker(task, {
    verbose: true,
    maxFiles: 5,
  });

  console.log(`\n   ✓ Extraction complete`);
  console.log(`   Files extracted: ${extraction.filesExtracted}`);
  console.log(`   Project root: ${extraction.projectRoot}`);

  if (extraction.extractedPaths.length > 0) {
    console.log('\n3. Extracted files:');
    for (const filePath of extraction.extractedPaths) {
      const fullPath = path.join(extraction.projectRoot, filePath);
      const stats = fs.statSync(fullPath);
      console.log(`   - ${filePath} (${stats.size} bytes)`);

      // Show first 5 lines
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').slice(0, 5);
      console.log(`     ${lines.join('\n     ')}`);
      console.log('     ...');
    }
  }

  // Cleanup
  console.log('\n4. Cleaning up...');
  extraction.cleanup();
  console.log('   ✓ Cleanup complete');

  console.log('\n' + '='.repeat(80));
  console.log('✓ Docker code extraction test passed!\n');
}

main().catch(error => {
  console.error('\n✗ Test failed:', error);
  process.exit(1);
});
