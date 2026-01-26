#!/usr/bin/env npx tsx
/**
 * Real LLM Experiment v2 - Better patch generation
 * ================================================
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { loadTasks } from '../src/experiments/swebench/loader.js';
import { evaluatePatch, getDockerInfo, ensureImage } from '../src/experiments/docker/evaluator.js';
import type { SWEBenchTask } from '../src/experiments/swebench/types.js';

const apiKey = fs.readFileSync(process.env.HOME + '/.openai-at', 'utf-8').trim();

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',  // Use more capable model
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

  return data.output?.find(o => o.type === 'message')
    ?.content?.find(c => c.type === 'output_text')?.text || '';
}

function getFileFromDocker(instanceId: string, filePath: string): string | null {
  try {
    const imageName = `ghcr.io/epoch-research/swe-bench.eval.arm64.${instanceId}:latest`;
    return execSync(
      `docker run --rm ${imageName} cat /testbed/${filePath}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are an expert software engineer fixing bugs.

When asked to generate a patch, output EXACTLY this format with no other text:

diff --git a/path/to/file.py b/path/to/file.py
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -START,COUNT +START,COUNT @@
 context line (unchanged, starts with space)
-removed line (starts with -)
+added line (starts with +)
 context line

RULES:
1. Start immediately with "diff --git" - no explanation before
2. Include 3 context lines before and after changes
3. Line numbers in @@ must be exact
4. Every line in the hunk must start with space, -, or +
5. Do NOT wrap in markdown code blocks
6. Do NOT include any text after the patch`;

interface PatchResult {
  success: boolean;
  patch?: string;
  error?: string;
}

async function generatePatch(task: SWEBenchTask): Promise<PatchResult> {
  // Get target file from gold patch
  const patchMatch = task.goldPatch?.match(/diff --git a\/([^\s]+)/);
  if (!patchMatch) {
    return { success: false, error: 'Could not determine target file' };
  }
  const targetFile = patchMatch[1];

  // Get source from Docker
  const sourceContent = getFileFromDocker(task.instanceId, targetFile);
  if (!sourceContent) {
    return { success: false, error: `Could not fetch ${targetFile}` };
  }

  // Provide substantial context
  const lines = sourceContent.split('\n');
  const numberedContent = lines.slice(0, 2000).map((l, i) => `${i + 1}| ${l}`).join('\n');

  const prompt = `Fix this bug in ${targetFile}:

## Problem
${task.problemStatement.slice(0, 2000)}

## Tests that must pass
${task.testSpec.failToPass.join('\n')}

## Source code (with line numbers)
${numberedContent}

Generate a unified diff patch to fix this bug. Start your response with "diff --git":`;

  const response = await callLLM(prompt, SYSTEM_PROMPT);

  // Clean response
  let patch = response.trim();

  // Remove markdown code blocks if present
  if (patch.startsWith('```')) {
    const lines = patch.split('\n');
    patch = lines.slice(1, lines.findIndex((l, i) => i > 0 && l.startsWith('```'))).join('\n');
  }

  // Validate
  if (!patch.startsWith('diff --git')) {
    // Try to find it
    const diffStart = patch.indexOf('diff --git');
    if (diffStart >= 0) {
      patch = patch.slice(diffStart);
    } else {
      return { success: false, error: 'No valid patch in response' };
    }
  }

  if (!patch.includes('@@')) {
    return { success: false, error: 'Invalid patch format' };
  }

  return { success: true, patch };
}

async function main() {
  const numTasks = parseInt(process.argv[2] || '3', 10);

  console.log('=== Real LLM SWE-bench Experiment v2 ===\n');
  console.log(`Model: gpt-4o`);

  const dockerInfo = getDockerInfo();
  console.log(`Docker: ${dockerInfo.version}`);

  // Load Django tasks with non-parametrized tests
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  const tasks = result.tasks.filter(t =>
    t.instanceId.startsWith('django__django') &&
    t.goldPatch &&
    t.testPatch &&
    t.testSpec.failToPass.every(test => !test.includes('['))
  ).slice(0, numTasks);

  console.log(`\nSelected ${tasks.length} tasks\n`);

  const results: Array<{ id: string; resolved: boolean; error?: string }> = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Task ${i + 1}/${tasks.length}: ${task.instanceId}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`Tests: ${task.testSpec.failToPass.slice(0, 2).join(', ')}`);

    // Ensure image
    const { available } = await ensureImage(task.instanceId, { verbose: false });
    if (!available) {
      console.log(`❌ Image not available`);
      results.push({ id: task.instanceId, resolved: false, error: 'No image' });
      continue;
    }

    // Generate patch
    console.log(`Generating patch...`);
    const patchResult = await generatePatch(task);

    if (!patchResult.success) {
      console.log(`❌ ${patchResult.error}`);
      results.push({ id: task.instanceId, resolved: false, error: patchResult.error });
      continue;
    }

    console.log(`✓ Patch generated`);
    console.log(`\nGenerated patch:\n${patchResult.patch?.slice(0, 500)}...\n`);

    // Evaluate
    console.log(`Evaluating in Docker...`);
    const evalResult = await evaluatePatch({
      instanceId: task.instanceId,
      patch: patchResult.patch!,
      testPatch: task.testPatch,
      failToPass: task.testSpec.failToPass,
      passToPass: [],
    }, { timeout: 300000 });

    if (evalResult.resolved) {
      console.log(`✓ RESOLVED!`);
      results.push({ id: task.instanceId, resolved: true });
    } else {
      console.log(`○ Not resolved: ${evalResult.error || `${evalResult.testsFixed}/${evalResult.totalTestsToFix} tests`}`);
      results.push({ id: task.instanceId, resolved: false, error: evalResult.error });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log(`${'='.repeat(60)}`);
  const resolved = results.filter(r => r.resolved).length;
  console.log(`Resolved: ${resolved}/${results.length} (${(resolved/results.length*100).toFixed(0)}%)`);

  for (const r of results) {
    console.log(`  ${r.resolved ? '✓' : '○'} ${r.id}`);
  }
}

main().catch(console.error);
