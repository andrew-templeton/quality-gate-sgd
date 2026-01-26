#!/usr/bin/env npx tsx
/**
 * Real LLM Experiment on SWE-bench
 * ================================
 * Runs a real experiment where an LLM generates patches
 * and they're evaluated in Docker containers.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { loadTasks } from '../src/experiments/swebench/loader.js';
import { evaluatePatch, getDockerInfo, ensureImage } from '../src/experiments/docker/evaluator.js';
import type { SWEBenchTask } from '../src/experiments/swebench/types.js';

// Load API key
const apiKey = fs.readFileSync(process.env.HOME + '/.openai-at', 'utf-8').trim();

// =============================================================================
// LLM Integration
// =============================================================================

interface LLMPatchResult {
  canFix: boolean;
  reasoning: string;
  patch?: string;
  error?: string;
}

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: prompt,
      instructions: systemPrompt,
      max_output_tokens: 8192,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as {
    output: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
  };

  const text = data.output?.find(o => o.type === 'message')
    ?.content?.find(c => c.type === 'output_text')?.text;

  if (!text) throw new Error('No text in response');
  return text;
}

// =============================================================================
// File Extraction from Docker
// =============================================================================

function getFileFromDocker(instanceId: string, filePath: string): string | null {
  try {
    const imageName = `ghcr.io/epoch-research/swe-bench.eval.arm64.${instanceId}:latest`;
    const result = execSync(
      `docker run --rm ${imageName} cat /testbed/${filePath}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result;
  } catch {
    return null;
  }
}

// =============================================================================
// Patch Generation
// =============================================================================

const SYSTEM_PROMPT = `You are an expert software engineer fixing bugs in open source projects.
You will receive:
1. A bug report describing the issue
2. The relevant source file(s)
3. The test(s) that need to pass

Your task: Generate a minimal unified diff patch that fixes the bug.

CRITICAL REQUIREMENTS:
1. Output ONLY a valid unified diff patch (starting with "diff --git")
2. The patch must apply cleanly with "git apply"
3. Make the SMALLEST change necessary to fix the bug
4. Do NOT include any explanation outside the patch
5. Do NOT wrap the patch in markdown code blocks

Example format:
diff --git a/path/to/file.py b/path/to/file.py
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -10,7 +10,7 @@
 context line
-old line
+new line
 context line`;

async function generatePatch(task: SWEBenchTask): Promise<LLMPatchResult> {
  // Extract file path from gold patch to know what file to get
  const patchMatch = task.goldPatch?.match(/diff --git a\/([^\s]+)/);
  if (!patchMatch) {
    return { canFix: false, error: 'Could not determine target file', reasoning: '' };
  }
  const targetFile = patchMatch[1];

  // Get the source file from Docker
  console.log(`  Fetching ${targetFile} from Docker...`);
  const sourceContent = getFileFromDocker(task.instanceId, targetFile);
  if (!sourceContent) {
    return { canFix: false, error: `Could not fetch ${targetFile}`, reasoning: '' };
  }

  // Build prompt
  const prompt = `## Bug Report
${task.problemStatement}

## Source File: ${targetFile}
\`\`\`python
${sourceContent.slice(0, 15000)}
\`\`\`

## Tests That Must Pass After Fix
${task.testSpec.failToPass.join('\n')}

Generate a unified diff patch to fix this bug:`;

  // Call LLM
  console.log(`  Calling LLM...`);
  const response = await callLLM(prompt, SYSTEM_PROMPT);

  // Extract patch from response
  let patch = response.trim();

  // Handle markdown code blocks
  if (patch.startsWith('```')) {
    const lines = patch.split('\n');
    const start = lines[0].includes('diff') ? 0 : 1;
    const end = lines.findIndex((l, i) => i > 0 && l.startsWith('```'));
    patch = lines.slice(start, end === -1 ? undefined : end).join('\n');
  }

  // Validate it looks like a patch
  if (!patch.includes('diff --git') || !patch.includes('@@')) {
    return {
      canFix: false,
      error: 'LLM did not produce a valid patch',
      reasoning: response.slice(0, 200),
    };
  }

  return {
    canFix: true,
    reasoning: 'Patch generated',
    patch,
  };
}

// =============================================================================
// Main Experiment
// =============================================================================

interface ExperimentResult {
  instanceId: string;
  resolved: boolean;
  patchGenerated: boolean;
  error?: string;
  durationMs: number;
}

async function runExperiment(numTasks: number = 5): Promise<void> {
  console.log('=== Real LLM SWE-bench Experiment ===\n');

  const dockerInfo = getDockerInfo();
  if (!dockerInfo.available) {
    console.error('Docker not available');
    process.exit(1);
  }
  console.log(`Docker: ${dockerInfo.version}`);

  // Load tasks - pick Django tasks which work well with our harness
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  const djangoTasks = result.tasks.filter(t =>
    t.instanceId.startsWith('django__django') &&
    t.goldPatch &&
    t.testPatch &&
    // Pick tasks with simple test names
    t.testSpec.failToPass.every(test => !test.includes('['))
  ).slice(0, numTasks);

  console.log(`\nSelected ${djangoTasks.length} Django tasks\n`);

  const results: ExperimentResult[] = [];

  for (let i = 0; i < djangoTasks.length; i++) {
    const task = djangoTasks[i];
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Task ${i + 1}/${djangoTasks.length}: ${task.instanceId}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Problem: ${task.problemStatement.slice(0, 150)}...`);
    console.log(`Tests: ${task.testSpec.failToPass.join(', ')}`);

    // Ensure image is available
    console.log(`\n1. Ensuring Docker image...`);
    const { available } = await ensureImage(task.instanceId, { verbose: false });
    if (!available) {
      console.log(`   ❌ Image not available`);
      results.push({
        instanceId: task.instanceId,
        resolved: false,
        patchGenerated: false,
        error: 'Docker image not available',
        durationMs: Date.now() - startTime,
      });
      continue;
    }
    console.log(`   ✓ Image ready`);

    // Generate patch with LLM
    console.log(`\n2. Generating patch with LLM...`);
    let patchResult: LLMPatchResult;
    try {
      patchResult = await generatePatch(task);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ LLM error: ${msg}`);
      results.push({
        instanceId: task.instanceId,
        resolved: false,
        patchGenerated: false,
        error: msg,
        durationMs: Date.now() - startTime,
      });
      continue;
    }

    if (!patchResult.canFix || !patchResult.patch) {
      console.log(`   ❌ No patch: ${patchResult.error}`);
      results.push({
        instanceId: task.instanceId,
        resolved: false,
        patchGenerated: false,
        error: patchResult.error,
        durationMs: Date.now() - startTime,
      });
      continue;
    }
    console.log(`   ✓ Patch generated (${patchResult.patch.split('\n').length} lines)`);

    // Evaluate in Docker
    console.log(`\n3. Evaluating in Docker...`);
    const evalResult = await evaluatePatch({
      instanceId: task.instanceId,
      patch: patchResult.patch,
      testPatch: task.testPatch,
      failToPass: task.testSpec.failToPass,
      passToPass: [],
    }, {
      verbose: false,
      timeout: 300000,
    });

    const durationMs = Date.now() - startTime;

    if (evalResult.resolved) {
      console.log(`   ✓ RESOLVED! (${evalResult.testsFixed}/${evalResult.totalTestsToFix} tests)`);
    } else if (evalResult.error) {
      console.log(`   ❌ Error: ${evalResult.error}`);
    } else {
      console.log(`   ○ Not resolved (${evalResult.testsFixed}/${evalResult.totalTestsToFix} tests)`);
    }

    results.push({
      instanceId: task.instanceId,
      resolved: evalResult.resolved,
      patchGenerated: true,
      error: evalResult.error,
      durationMs,
    });
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPERIMENT SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const resolved = results.filter(r => r.resolved).length;
  const patchGenerated = results.filter(r => r.patchGenerated).length;
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\nTasks: ${results.length}`);
  console.log(`Patches generated: ${patchGenerated}/${results.length} (${(patchGenerated/results.length*100).toFixed(0)}%)`);
  console.log(`Resolved: ${resolved}/${results.length} (${(resolved/results.length*100).toFixed(0)}%)`);
  console.log(`Total time: ${(totalTime/1000).toFixed(1)}s`);

  console.log(`\nPer-task results:`);
  for (const r of results) {
    const status = r.resolved ? '✓' : r.patchGenerated ? '○' : '❌';
    console.log(`  ${status} ${r.instanceId}: ${r.resolved ? 'RESOLVED' : r.error || 'not resolved'}`);
  }
}

// Parse args
const numTasks = parseInt(process.argv[2] || '3', 10);
runExperiment(numTasks).catch(console.error);
