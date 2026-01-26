/**
 * LLM Executor - OpenAI Responses API Integration
 * ================================================
 * Production LLM executor that integrates with OpenAI-compatible APIs
 * for experiment execution. Uses the Responses API per user preferences.
 *
 * Supports:
 * - GPT-5.2, GPT-5-mini, GPT-5-nano families (preferred)
 * - Any OpenAI-compatible API endpoint
 * - Structured output for code changes
 */

import type { LLMExecutor, FixContext, FixAttemptResult, FileChange } from './harness.js';
import type { ExperimentTask, IterationEvaluationResult } from './runner.js';
import type { TargetSuggestion } from './types.js';
import type { PatchProposalReasoning, PatchQualityMetrics } from './swebench/quality-gate.js';
import type { SWEBenchTask } from './swebench/types.js';
import { retrieveCodeContext, formatCodeContext, type CodeRetrievalConfig } from './swebench/code-retrieval.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the LLM executor.
 */
export interface LLMExecutorConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** API base URL (for compatible endpoints) */
  baseUrl?: string;
  /** Model to use (default: gpt-5-mini) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Project root for file operations */
  projectRoot: string;
  /** Whether to actually apply changes (false = dry run) */
  applyChanges?: boolean;
  /** Timeout in ms for API calls */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
  /** Code retrieval configuration (for SWE-bench tasks) */
  codeRetrieval?: CodeRetrievalConfig;
}

/**
 * Structured response from the LLM for a fix attempt.
 * Note: FileChange type is imported from harness.ts
 */
interface FixResponse {
  /** Whether the LLM believes the fix is possible */
  canFix: boolean;
  /** Explanation of the approach */
  reasoning: string;
  /** File changes to apply */
  changes?: Array<FileChange & { diff?: string }>;
  /** Error or reason if cannot fix */
  error?: string;
}

// =============================================================================
// Prompt Templates
// =============================================================================

const SYSTEM_PROMPT = `You are an expert software engineer tasked with improving code quality.
You will be given a quality metric target and information about what to fix.
Your goal is to make minimal, focused changes that improve the metric without breaking functionality.

Rules:
1. Make the SMALLEST change that addresses the issue
2. Do not refactor unrelated code
3. Preserve existing behavior unless explicitly fixing a bug
4. Do not add comments explaining your changes
5. Return structured JSON with your proposed changes

Respond with valid JSON matching this schema:
{
  "canFix": boolean,
  "reasoning": "Brief explanation of your approach",
  "changes": [
    {
      "filePath": "relative/path/to/file",
      "changeType": "modify" | "create" | "delete",
      "newContent": "full file content after change"
    }
  ],
  "error": "reason if canFix is false"
}`;

/**
 * System prompt for reasoning extraction (quality-gated mode).
 * Requests structured reasoning before patch generation.
 */
const REASONING_SYSTEM_PROMPT = `You are an expert software engineer analyzing a bug report.
Your task is to provide detailed reasoning about the bug and how to fix it, using a structured format.

DO NOT generate a patch yet. Focus on deep understanding and clear reasoning.

Analyze the bug using this framework:

1. PRIOR: What is currently broken?
   - Describe the bug clearly
   - What behavior do we observe?
   - What behavior do we expect?
   - How confident are you in understanding the issue? (0-1)

2. HYPOTHESIS: What is the root cause and how can it be fixed?
   - What is the root cause of the bug?
   - What is the causal chain from cause → effect → fix?
   - Why should your proposed fix work?

3. EVIDENCE: What code analysis supports your hypothesis?
   - Which files and line numbers are relevant?
   - What do you observe in the code?
   - How do these observations support your hypothesis?

4. SOLUTION: What change do you propose?
   - Describe the change at a high level
   - How does it address the root cause?
   - Why is this the minimal necessary change?

5. PREDICTION: What will happen after the fix?
   - Which tests should pass?
   - What observable effects will occur?
   - How can we verify the fix worked?

Respond with valid JSON matching this schema:
{
  "prior": {
    "bugDescription": "string",
    "currentBehavior": "string",
    "expectedBehavior": "string",
    "confidence": number (0-1)
  },
  "hypothesis": {
    "rootCause": "string",
    "causalChain": ["string", "string", ...],
    "rationale": "string"
  },
  "evidence": {
    "codeReferences": [{"file": "string", "lines": "string", "observation": "string"}],
    "observations": ["string", ...],
    "supportingLogic": "string"
  },
  "solution": {
    "changeDescription": "string",
    "addressesCause": "string",
    "minimality": "string"
  },
  "prediction": {
    "testOutcomes": ["string", ...],
    "effects": ["string", ...],
    "verificationPlan": "string"
  }
}`;

/**
 * Build user prompt for SWE-bench reasoning extraction.
 */
function buildReasoningPrompt(
  task: SWEBenchTask,
  projectRoot: string,
  retrievalConfig?: CodeRetrievalConfig
): string {
  const parts: string[] = [];

  // Task information
  parts.push(`## Bug Report\n`);
  parts.push(`**Instance ID**: ${task.instanceId}\n`);
  parts.push(`**Problem Statement**:\n${task.problemStatement}\n`);

  if (task.hints) {
    parts.push(`**Hints**:\n${task.hints}\n`);
  }

  // Test information
  parts.push(`## Test Information\n`);
  parts.push(`**Tests that should pass after fix**:`);
  for (const test of task.testSpec.failToPass || []) {
    parts.push(`- ${test}`);
  }
  parts.push('');

  // Retrieve and format code context
  const codeContext = retrieveCodeContext(task, projectRoot, retrievalConfig);

  if (codeContext.files.length > 0 || codeContext.fileTree) {
    parts.push(formatCodeContext(codeContext));
  } else {
    parts.push(`## Available Context\n`);
    parts.push(`Note: No source files were automatically retrieved. Use the problem statement and test names to infer the code structure.\n`);
  }

  return parts.join('\n');
}

/**
 * Build the user prompt for a fix attempt.
 */
function buildUserPrompt(
  task: ExperimentTask,
  suggestion: TargetSuggestion | null,
  context: FixContext
): string {
  const parts: string[] = [];

  // Task description
  parts.push(`## Task\n${task.description || task.id}\n`);

  // Current state
  parts.push(`## Current State`);
  parts.push(`- Quality Score: ${context.currentScore.toFixed(2)} / ${context.targetScore}`);
  parts.push(`- Iteration: ${context.iteration}`);
  parts.push(`- Feedback Enabled: ${context.feedbackEnabled}\n`);

  // Target suggestion (if gate enabled)
  if (suggestion && context.feedbackEnabled) {
    parts.push(`## Suggested Target`);
    parts.push(`- Type: ${suggestion.type}`);
    parts.push(`- ID: ${suggestion.id}`);
    parts.push(`- Expected ΔQ: ${suggestion.expectedDeltaQ?.toFixed(3) || 'unknown'}`);

    if (suggestion.fixabilityScore !== undefined) {
      parts.push(`- Fixability Score: ${suggestion.fixabilityScore.toFixed(3)}`);
    }
    if (suggestion.adjustedDeltaQ !== undefined) {
      parts.push(`- Adjusted ΔQ: ${suggestion.adjustedDeltaQ.toFixed(3)}`);
    }
    parts.push('');
  }

  // Available targets (for context)
  if (context.availableTargets && context.availableTargets.length > 0) {
    parts.push(`## Top Improvement Targets`);
    const topTargets = context.availableTargets.slice(0, 5);
    for (const target of topTargets) {
      const line = `- [${target.type}] ${target.id}: ΔQ=${target.expectedDeltaQ?.toFixed(3) || '?'}`;
      parts.push(line);
    }
    parts.push('');
  }

  // Metrics breakdown
  parts.push(`## Current Metrics`);
  for (const [key, value] of Object.entries(context.metrics)) {
    if (typeof value === 'number') {
      parts.push(`- ${key}: ${value}`);
    }
  }
  parts.push('');

  // Configuration hints
  parts.push(`## Configuration`);
  parts.push(`- Topology: ${context.config.topology || 'full'}`);
  parts.push(`- Granularity: ${context.config.granularity}`);
  parts.push(`- Max Iterations: ${context.config.maxIterations}`);

  return parts.join('\n');
}

// =============================================================================
// HTTP Client (minimal, no dependencies)
// =============================================================================

interface ResponsesAPIRequest {
  model: string;
  input: string;
  instructions?: string;
  max_output_tokens?: number;
}

interface ResponsesAPIResponse {
  id: string;
  output: Array<{
    type: 'message';
    content: Array<{
      type: 'output_text';
      text: string;
    }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call OpenAI Responses API.
 * Note: Uses native fetch (Node 18+).
 */
async function callResponsesAPI(
  request: ResponsesAPIRequest,
  config: LLMExecutorConfig
): Promise<string> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const url = `${baseUrl}/responses`;

  const body = {
    model: request.model,
    input: request.input,
    instructions: request.instructions,
    max_output_tokens: request.max_output_tokens || config.maxTokens || 4096,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeout || 60000
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as ResponsesAPIResponse;

    // Extract text from response
    const textContent = data.output
      ?.find(o => o.type === 'message')
      ?.content
      ?.find(c => c.type === 'output_text');

    if (!textContent) {
      throw new Error('No text content in response');
    }

    return textContent.text;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call with retry logic.
 */
async function callWithRetry(
  request: ResponsesAPIRequest,
  config: LLMExecutorConfig
): Promise<string> {
  const retry = config.retry || {};
  const maxRetries = retry.maxRetries ?? 3;
  const initialDelay = retry.initialDelayMs ?? 1000;
  const maxDelay = retry.maxDelayMs ?? 30000;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callResponsesAPI(request, config);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on auth errors or validation errors
      if (lastError.message.includes('401') || lastError.message.includes('400')) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 0.3 * delay;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay = Math.min(delay * 2, maxDelay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Apply file changes to disk.
 */
function applyFileChanges(
  changes: FileChange[],
  projectRoot: string
): { applied: number; errors: string[] } {
  let applied = 0;
  const errors: string[] = [];

  for (const change of changes) {
    const fullPath = path.resolve(projectRoot, change.filePath);

    // Security: ensure path is within project root
    if (!fullPath.startsWith(path.resolve(projectRoot))) {
      errors.push(`Path escape attempt: ${change.filePath}`);
      continue;
    }

    try {
      switch (change.changeType) {
        case 'create':
        case 'modify':
          if (change.newContent === undefined) {
            errors.push(`No content for ${change.filePath}`);
            continue;
          }
          // Ensure directory exists
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, change.newContent, 'utf-8');
          applied++;
          break;

        case 'delete':
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            applied++;
          }
          break;
      }
    } catch (error) {
      errors.push(`Failed to ${change.changeType} ${change.filePath}: ${error}`);
    }
  }

  return { applied, errors };
}

/**
 * Read file content for context.
 */
function readFileForContext(filePath: string, projectRoot: string): string | null {
  const fullPath = path.resolve(projectRoot, filePath);

  // Security check
  if (!fullPath.startsWith(path.resolve(projectRoot))) {
    return null;
  }

  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Convert file changes to unified diff format.
 * This generates a git-compatible patch that can be applied with `git apply`.
 */
function convertToUnifiedDiff(
  changes: FileChange[],
  projectRoot: string
): string {
  const diffs: string[] = [];

  for (const change of changes) {
    const filePath = change.filePath;

    if (change.changeType === 'create') {
      // New file
      diffs.push(`diff --git a/${filePath} b/${filePath}`);
      diffs.push(`new file mode 100644`);
      diffs.push(`--- /dev/null`);
      diffs.push(`+++ b/${filePath}`);
      if (change.newContent) {
        const lines = change.newContent.split('\n');
        diffs.push(`@@ -0,0 +1,${lines.length} @@`);
        for (const line of lines) {
          diffs.push(`+${line}`);
        }
      }
    } else if (change.changeType === 'delete') {
      // Deleted file
      diffs.push(`diff --git a/${filePath} b/${filePath}`);
      diffs.push(`deleted file mode 100644`);
      diffs.push(`--- a/${filePath}`);
      diffs.push(`+++ /dev/null`);
      const originalContent = change.originalContent ?? readFileForContext(filePath, projectRoot) ?? '';
      if (originalContent) {
        const lines = originalContent.split('\n');
        diffs.push(`@@ -1,${lines.length} +0,0 @@`);
        for (const line of lines) {
          diffs.push(`-${line}`);
        }
      }
    } else if (change.changeType === 'modify') {
      // Modified file - compute line-by-line diff
      const originalContent = change.originalContent ?? readFileForContext(filePath, projectRoot) ?? '';
      const newContent = change.newContent ?? '';

      diffs.push(`diff --git a/${filePath} b/${filePath}`);
      diffs.push(`--- a/${filePath}`);
      diffs.push(`+++ b/${filePath}`);

      // Simple diff: find contiguous changes
      const originalLines = originalContent.split('\n');
      const newLines = newContent.split('\n');
      const hunks = computeHunks(originalLines, newLines);

      for (const hunk of hunks) {
        diffs.push(hunk);
      }
    }
  }

  return diffs.join('\n');
}

/**
 * Compute diff hunks between two line arrays.
 * Uses a simple LCS-based approach for generating minimal hunks.
 */
function computeHunks(original: string[], modified: string[]): string[] {
  const hunks: string[] = [];

  // Find longest common subsequence to identify unchanged regions
  const lcs = longestCommonSubsequence(original, modified);

  // Generate hunks from the diff
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
      // Context line (unchanged)
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
      // Deleted line
      if (hunkLines.length === 0) {
        hunkOrigStart = origIdx + 1;
        hunkModStart = modIdx + 1;
      }
      hunkLines.push(`-${original[origIdx]}`);
      hunkOrigCount++;
      origIdx++;
    } else if (modIdx < modified.length && (lcsIdx >= lcs.length || modified[modIdx] !== lcs[lcsIdx])) {
      // Added line
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

/**
 * Compute longest common subsequence of two string arrays.
 */
function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // DP table
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

  // Backtrack to find LCS
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

// =============================================================================
// Reasoning Extraction (Quality-Gated Mode)
// =============================================================================

/**
 * Extract structured reasoning from the LLM for a SWE-bench task.
 * This is the first step in quality-gated patch generation.
 */
export async function extractReasoning(
  task: SWEBenchTask,
  config: LLMExecutorConfig
): Promise<{ reasoning: PatchProposalReasoning | null; error?: string }> {
  const userPrompt = buildReasoningPrompt(task, config.projectRoot, config.codeRetrieval);

  // Call the API
  let responseText: string;
  try {
    responseText = await callWithRetry(
      {
        model: config.model || 'gpt-5-mini',
        input: userPrompt,
        instructions: REASONING_SYSTEM_PROMPT,
        max_output_tokens: config.maxTokens || 4096,
      },
      config
    );
  } catch (error) {
    return {
      reasoning: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Parse the response
  try {
    // Handle markdown code blocks
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n');
      const startIdx = lines.findIndex(l => l.startsWith('```json') || l === '```') + 1;
      const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('```'));
      jsonText = lines.slice(startIdx, endIdx === -1 ? undefined : endIdx).join('\n');
    }

    const reasoning = JSON.parse(jsonText) as PatchProposalReasoning;

    // Basic validation
    if (!reasoning.prior || !reasoning.hypothesis || !reasoning.evidence ||
        !reasoning.solution || !reasoning.prediction) {
      return {
        reasoning: null,
        error: 'Incomplete reasoning structure',
      };
    }

    return { reasoning };
  } catch (parseError) {
    return {
      reasoning: null,
      error: `Failed to parse reasoning: ${responseText.slice(0, 200)}`,
    };
  }
}

/**
 * Convert reasoning to a patch by generating code changes.
 * This is the second step after reasoning passes the quality gate.
 */
export async function reasoningToPatch(
  task: SWEBenchTask,
  reasoning: PatchProposalReasoning,
  config: LLMExecutorConfig
): Promise<{ patch: string | null; changes: FileChange[] | null; error?: string }> {
  // Build prompt that includes the reasoning and asks for code
  const parts: string[] = [];

  parts.push(`## Your Previous Analysis\n`);
  parts.push(`You previously analyzed this bug and determined:`);
  parts.push(`- **Root Cause**: ${reasoning.hypothesis.rootCause}`);
  parts.push(`- **Proposed Change**: ${reasoning.solution.changeDescription}`);
  parts.push(`- **Why it works**: ${reasoning.solution.addressesCause}\n`);

  parts.push(`## Task\n`);
  parts.push(`Now generate the actual code changes to implement your proposed fix.`);
  parts.push(`Follow your analysis exactly. Make the minimal change you described.\n`);

  parts.push(`## Files to Modify\n`);
  for (const ref of reasoning.evidence.codeReferences) {
    parts.push(`- ${ref.file} (lines ${ref.lines})`);
  }
  parts.push('');

  const userPrompt = parts.join('\n');

  // Call the API with the original SYSTEM_PROMPT (for code generation)
  let responseText: string;
  try {
    responseText = await callWithRetry(
      {
        model: config.model || 'gpt-5-mini',
        input: userPrompt,
        instructions: SYSTEM_PROMPT,
        max_output_tokens: config.maxTokens || 4096,
      },
      config
    );
  } catch (error) {
    return {
      patch: null,
      changes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Parse the response (same as attemptFix)
  try {
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n');
      const startIdx = lines[0].includes('json') ? 1 : 0;
      const endIdx = lines.findIndex((l, i) => i > 0 && l.startsWith('```'));
      jsonText = lines.slice(startIdx, endIdx === -1 ? undefined : endIdx).join('\n');
    }

    const fixResponse = JSON.parse(jsonText) as FixResponse;

    if (!fixResponse.canFix || !fixResponse.changes || fixResponse.changes.length === 0) {
      return {
        patch: null,
        changes: null,
        error: fixResponse.error || 'LLM declined to generate patch',
      };
    }

    // Convert to FileChange format and generate patch
    const changes: FileChange[] = fixResponse.changes.map(change => {
      const originalContent = change.originalContent ?? readFileForContext(change.filePath, config.projectRoot) ?? undefined;
      return {
        filePath: change.filePath,
        changeType: change.changeType,
        originalContent,
        newContent: change.newContent,
      };
    });

    const patch = convertToUnifiedDiff(changes, config.projectRoot);

    return { patch, changes };
  } catch (parseError) {
    return {
      patch: null,
      changes: null,
      error: `Failed to parse patch response: ${responseText.slice(0, 200)}`,
    };
  }
}

// =============================================================================
// LLM Executor Implementation
// =============================================================================

/**
 * Create an LLM executor that uses OpenAI's Responses API.
 */
export function createLLMExecutor(config: LLMExecutorConfig): LLMExecutor {
  const {
    model = 'gpt-5-mini',
    projectRoot,
    applyChanges = true,
  } = config;

  return {
    async attemptFix(
      task: ExperimentTask,
      suggestion: TargetSuggestion | null,
      context: FixContext
    ): Promise<FixAttemptResult> {
      // Build the prompt
      const userPrompt = buildUserPrompt(task, suggestion, context);

      // Include file context if we have a symbol-level suggestion
      let contextFiles = '';
      if (suggestion?.type === 'symbol' || suggestion?.type === 'file') {
        // Try to get the target file
        const targetPath = suggestion.type === 'file'
          ? suggestion.id
          : suggestion.id.split('::')[0]; // symbol format: file::symbol

        const content = readFileForContext(targetPath, projectRoot);
        if (content) {
          contextFiles = `\n## File Context\n### ${targetPath}\n\`\`\`\n${content}\n\`\`\`\n`;
        }
      }

      const fullPrompt = userPrompt + contextFiles;

      // Call the API
      let responseText: string;
      try {
        responseText = await callWithRetry(
          {
            model,
            input: fullPrompt,
            instructions: SYSTEM_PROMPT,
          },
          config
        );
      } catch (error) {
        return {
          attempted: true,
          modified: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Parse the response
      let fixResponse: FixResponse;
      try {
        // Handle markdown code blocks
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```')) {
          const lines = jsonText.split('\n');
          const startIdx = lines[0].includes('json') ? 1 : 0;
          const endIdx = lines.findIndex((l, i) => i > 0 && l.startsWith('```'));
          jsonText = lines.slice(startIdx, endIdx === -1 ? undefined : endIdx).join('\n');
        }
        fixResponse = JSON.parse(jsonText) as FixResponse;
      } catch {
        return {
          attempted: true,
          modified: false,
          error: `Failed to parse LLM response: ${responseText.slice(0, 200)}`,
        };
      }

      // Check if fix is possible
      if (!fixResponse.canFix || !fixResponse.changes || fixResponse.changes.length === 0) {
        return {
          attempted: true,
          modified: false,
          error: fixResponse.error || 'LLM declined to fix',
        };
      }

      // Convert to FileChange format and capture original content for diff generation
      const changes: FileChange[] = fixResponse.changes.map(change => {
        const originalContent = change.originalContent ?? readFileForContext(change.filePath, projectRoot) ?? undefined;
        return {
          filePath: change.filePath,
          changeType: change.changeType,
          originalContent,
          newContent: change.newContent,
        };
      });

      // Generate unified diff patch
      const patch = convertToUnifiedDiff(changes, projectRoot);

      // Apply changes if enabled
      if (applyChanges) {
        const result = applyFileChanges(fixResponse.changes, projectRoot);
        if (result.errors.length > 0) {
          return {
            attempted: true,
            modified: result.applied > 0,
            error: result.errors.join('; '),
            changes,
            patch,
          };
        }
        return {
          attempted: true,
          modified: result.applied > 0,
          changes,
          patch,
        };
      }

      // Dry run mode - still return the changes and patch
      return {
        attempted: true,
        modified: false,
        error: 'Dry run mode - changes not applied',
        changes,
        patch,
      };
    },
  };
}

// =============================================================================
// Factory Functions for Common Configurations
// =============================================================================

/**
 * Create an executor configured for GPT-5-mini (recommended default).
 */
export function createGPT5MiniExecutor(
  projectRoot: string,
  options: Partial<LLMExecutorConfig> = {}
): LLMExecutor {
  return createLLMExecutor({
    ...options,
    projectRoot,
    model: 'gpt-5-mini',
  });
}

/**
 * Create an executor configured for GPT-5-nano (fastest, cheapest).
 */
export function createGPT5NanoExecutor(
  projectRoot: string,
  options: Partial<LLMExecutorConfig> = {}
): LLMExecutor {
  return createLLMExecutor({
    ...options,
    projectRoot,
    model: 'gpt-5-nano',
  });
}

/**
 * Create an executor configured for GPT-5.2 (highest capability).
 */
export function createGPT52Executor(
  projectRoot: string,
  options: Partial<LLMExecutorConfig> = {}
): LLMExecutor {
  return createLLMExecutor({
    ...options,
    projectRoot,
    model: 'gpt-5.2',
  });
}

/**
 * Create an executor for a custom/local endpoint.
 */
export function createCustomEndpointExecutor(
  projectRoot: string,
  baseUrl: string,
  model: string,
  options: Partial<LLMExecutorConfig> = {}
): LLMExecutor {
  return createLLMExecutor({
    ...options,
    projectRoot,
    baseUrl,
    model,
  });
}
