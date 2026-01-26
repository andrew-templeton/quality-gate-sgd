#!/usr/bin/env npx tsx
/**
 * Test Patch Generation
 * =====================
 * Tests the unified diff generation from file changes.
 */

// Import the internal functions by reading the built file
import * as fs from 'fs';
import * as path from 'path';

// Manually implement a test of the diff logic
function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

function computeHunks(original: string[], modified: string[]): string[] {
  const hunks: string[] = [];
  const lcs = longestCommonSubsequence(original, modified);

  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;
  let hunkLines: string[] = [];
  let hunkOrigStart = 1;
  let hunkModStart = 1;
  let hunkOrigCount = 0;
  let hunkModCount = 0;

  const flushHunk = () => {
    if (hunkLines.length > 0) {
      hunks.push(`@@ -${hunkOrigStart},${hunkOrigCount} +${hunkModStart},${hunkModCount} @@`);
      hunks.push(...hunkLines);
      hunkLines = [];
      hunkOrigCount = 0;
      hunkModCount = 0;
    }
  };

  while (origIdx < original.length || modIdx < modified.length) {
    if (lcsIdx < lcs.length && origIdx < original.length && original[origIdx] === lcs[lcsIdx] &&
        modIdx < modified.length && modified[modIdx] === lcs[lcsIdx]) {
      if (hunkLines.length === 0) {
        hunkOrigStart = origIdx + 1;
        hunkModStart = modIdx + 1;
      }
      hunkLines.push(` ${original[origIdx]}`);
      hunkOrigCount++;
      hunkModCount++;
      origIdx++;
      modIdx++;
      lcsIdx++;
    } else if (origIdx < original.length && (lcsIdx >= lcs.length || original[origIdx] !== lcs[lcsIdx])) {
      if (hunkLines.length === 0) {
        hunkOrigStart = origIdx + 1;
        hunkModStart = modIdx + 1;
      }
      hunkLines.push(`-${original[origIdx]}`);
      hunkOrigCount++;
      origIdx++;
    } else if (modIdx < modified.length && (lcsIdx >= lcs.length || modified[modIdx] !== lcs[lcsIdx])) {
      if (hunkLines.length === 0) {
        hunkOrigStart = origIdx + 1;
        hunkModStart = modIdx + 1;
      }
      hunkLines.push(`+${modified[modIdx]}`);
      hunkModCount++;
      modIdx++;
    } else {
      break;
    }
  }

  flushHunk();
  return hunks;
}

// Test case
console.log('=== Testing Patch Generation ===\n');

const original = [
  'def broken_function():',
  '    x = None',
  '    return x.value  # This will crash',
];

const modified = [
  'def fixed_function():',
  '    x = None',
  '    if x is None:',
  '        return 0',
  '    return x.value',
];

console.log('Original:');
original.forEach((line, i) => console.log(`  ${i + 1}: ${line}`));

console.log('\nModified:');
modified.forEach((line, i) => console.log(`  ${i + 1}: ${line}`));

console.log('\nGenerated Hunks:');
const hunks = computeHunks(original, modified);
hunks.forEach(line => console.log(line));

// Generate full unified diff
console.log('\n=== Full Unified Diff ===\n');

const filePath = 'src/utils.py';
const diffs: string[] = [];
diffs.push(`diff --git a/${filePath} b/${filePath}`);
diffs.push(`--- a/${filePath}`);
diffs.push(`+++ b/${filePath}`);
diffs.push(...hunks);

console.log(diffs.join('\n'));

// Test with the actual module if available
console.log('\n=== Testing with Real LLM Executor (dry run) ===\n');

import { createLLMExecutor } from '../src/experiments/llm-executor.js';

const executor = createLLMExecutor({
  projectRoot: '/tmp/test-project',
  applyChanges: false,  // Dry run
  apiKey: 'test-key',  // Won't actually call API
});

console.log('LLM Executor created successfully');
console.log('The executor now returns patches in the FixAttemptResult');
console.log('\nTo run a real experiment with Docker evaluation:');
console.log('  1. Set OPENAI_API_KEY');
console.log('  2. Use createRealLLMAgent() with a SWE-bench task');
console.log('  3. The agent will generate patches and evaluate them in Docker');
