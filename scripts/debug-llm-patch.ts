#!/usr/bin/env npx tsx
/**
 * Debug LLM Patch Generation
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { loadTasks } from '../src/experiments/swebench/loader.js';

const apiKey = fs.readFileSync(process.env.HOME + '/.openai-at', 'utf-8').trim();

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
    throw new Error(`API error: ${response.status}`);
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

async function main() {
  const result = loadTasks({ split: 'lite', localPath: 'data/swe-bench/lite.jsonl' });
  const task = result.tasks.find(t => t.instanceId === 'django__django-11049')!;

  console.log('Task:', task.instanceId);
  console.log('Problem:', task.problemStatement.slice(0, 200));
  console.log('\n--- Gold Patch ---');
  console.log(task.goldPatch);

  // Get target file
  const patchMatch = task.goldPatch?.match(/diff --git a\/([^\s]+)/);
  const targetFile = patchMatch?.[1] || '';
  console.log('\nTarget file:', targetFile);

  const sourceContent = getFileFromDocker(task.instanceId, targetFile);
  if (!sourceContent) {
    console.log('Could not fetch source');
    return;
  }

  // Find the specific lines around the change
  const lines = sourceContent.split('\n');
  const searchStr = "[DD] [HH:[MM:]]ss[.uuuuuu]";
  const lineNum = lines.findIndex(l => l.includes(searchStr));
  console.log(`\nFound target line at: ${lineNum + 1}`);
  console.log('Context:');
  for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 4); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }

  // Try LLM
  const SYSTEM_PROMPT = `You are fixing a bug in Django. Output ONLY a unified diff patch.
The patch must include correct line numbers and context lines.
Do not include any text before or after the patch.`;

  const prompt = `Fix this bug in ${targetFile}:

${task.problemStatement.slice(0, 1000)}

Here are lines ${lineNum - 5} to ${lineNum + 5} of the file:
\`\`\`
${lines.slice(Math.max(0, lineNum - 5), lineNum + 5).map((l, i) => `${lineNum - 5 + i + 1}: ${l}`).join('\n')}
\`\`\`

Generate a unified diff patch:`;

  console.log('\n--- Calling LLM ---');
  const response = await callLLM(prompt, SYSTEM_PROMPT);
  console.log('\nLLM Response:');
  console.log(response);
}

main().catch(console.error);
