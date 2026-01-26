#!/usr/bin/env tsx
/**
 * Test Code Retrieval
 * ====================
 * Validates that code retrieval extracts relevant files from problem statements.
 */

import { loadSWEBenchTasks } from '../src/experiments/index.js';
import { extractFilePaths, retrieveCodeContext, formatCodeContext } from '../src/experiments/index.js';
import * as path from 'path';

async function main() {
  console.log('Code Retrieval Test\n');
  console.log('='.repeat(80));

  // Load one task
  console.log('\n1. Loading sample task...');
  const { tasks: allTasks } = loadSWEBenchTasks({
    localPath: path.join(process.cwd(), 'data/swe-bench/lite.jsonl'),
  });

  const task = allTasks[0]; // First task
  console.log(`   Selected: ${task.instanceId}`);
  console.log(`   Repo: ${task.repo}`);

  // Test file path extraction
  console.log('\n2. Extracting file paths from problem statement...');
  const paths = extractFilePaths(task);
  console.log(`   Found ${paths.length} potential paths:`);
  for (const p of paths.slice(0, 10)) {
    console.log(`     - ${p}`);
  }

  // Test code retrieval (without actual project root, this will fail gracefully)
  console.log('\n3. Testing code context retrieval...');
  const mockProjectRoot = '/tmp/test-swebench';
  const context = retrieveCodeContext(task, mockProjectRoot, {
    maxFiles: 5,
    maxLinesPerFile: 200,
    includeTree: true,
  });

  console.log(`   Files retrieved: ${context.files.length}`);
  console.log(`   Total lines: ${context.totalLines}`);
  console.log(`   Truncated: ${context.truncated}`);

  if (context.files.length > 0) {
    console.log('\n   Retrieved files:');
    for (const file of context.files) {
      console.log(`     - ${file.path} (${file.lines} lines, ${file.relevance})`);
    }
  } else {
    console.log('   (No files found - expected without actual repo)');
  }

  // Test formatting
  console.log('\n4. Testing context formatting...');
  const formatted = formatCodeContext(context);
  console.log(`   Formatted context: ${formatted.length} characters`);

  if (formatted.includes('## Project Structure')) {
    console.log('   ✓ Project structure included');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✓ Code retrieval test complete!');
  console.log('\nNote: Actual file retrieval requires Docker containers with repo mounted.');
  console.log('Use quality-gated-agent with real Docker evaluation for full test.\n');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
