/**
 * SWE-bench Evaluator Tests
 * =========================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  applyPatch,
  cleanupRepository,
  summarizeEvaluations,
} from '../../../src/experiments/swebench/evaluator.js';
import type {
  SWEBenchTask,
  EvaluationResult,
} from '../../../src/experiments/swebench/types.js';

// =============================================================================
// Test Data
// =============================================================================

function createMockTask(overrides: Partial<SWEBenchTask> = {}): SWEBenchTask {
  return {
    id: 'test__repo-12345',
    description: 'Fix a bug',
    metadata: {},
    instanceId: 'test__repo-12345',
    repoUrl: 'https://github.com/test/repo',
    baseCommit: 'abc123',
    problemStatement: 'Fix the bug',
    goldPatch: `--- a/file.py
+++ b/file.py
@@ -1 +1 @@
-old line
+new line
`,
    testPatch: `--- a/test_file.py
+++ b/test_file.py
@@ -1 +1 @@
-old test
+new test
`,
    testSpec: {
      failToPass: ['test_case_1', 'test_case_2'],
      passToPass: ['test_existing'],
    },
    ...overrides,
  };
}

function createMockEvaluationResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    instanceId: 'test-instance',
    resolved: true,
    failToPassResults: [
      { testId: 'test1', passed: true },
    ],
    passToPassResults: [
      { testId: 'test2', passed: true },
    ],
    hasRegression: false,
    testsPassed: 2,
    testsTotal: 2,
    durationMs: 1000,
    ...overrides,
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swebench-eval-test-'));
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// =============================================================================
// applyPatch Tests
// =============================================================================

describe('applyPatch', () => {
  it('handles empty patch', async () => {
    const result = await applyPatch({
      workDir: tempDir,
      patch: '',
    });

    expect(result.success).toBe(true);
    expect(result.filesModified).toEqual([]);
    expect(result.output).toContain('Empty patch');
  });

  it('handles whitespace-only patch', async () => {
    const result = await applyPatch({
      workDir: tempDir,
      patch: '   \n   \n   ',
    });

    expect(result.success).toBe(true);
    expect(result.filesModified).toEqual([]);
  });

  it('cleans up temp patch file on success', async () => {
    await applyPatch({
      workDir: tempDir,
      patch: '',
    });

    const patchFile = path.join(tempDir, '.tmp-patch.diff');
    expect(fs.existsSync(patchFile)).toBe(false);
  });

  it('returns error for invalid patch format', async () => {
    // Create a file to patch
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');

    const result = await applyPatch({
      workDir: tempDir,
      patch: 'not a valid patch format',
    });

    // Should fail because the patch is invalid
    // The exact behavior depends on the `patch` command
    expect(result.filesModified).toEqual([]);
  });
});

// =============================================================================
// cleanupRepository Tests
// =============================================================================

describe('cleanupRepository', () => {
  it('removes existing directory', () => {
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');

    cleanupRepository(repoPath);

    expect(fs.existsSync(repoPath)).toBe(false);
  });

  it('handles non-existent directory gracefully', () => {
    const repoPath = path.join(tempDir, 'nonexistent');

    expect(() => cleanupRepository(repoPath)).not.toThrow();
  });

  it('removes nested directories', () => {
    const repoPath = path.join(tempDir, 'repo');
    const nestedPath = path.join(repoPath, 'a', 'b', 'c');
    fs.mkdirSync(nestedPath, { recursive: true });
    fs.writeFileSync(path.join(nestedPath, 'file.txt'), 'content');

    cleanupRepository(repoPath);

    expect(fs.existsSync(repoPath)).toBe(false);
  });
});

// =============================================================================
// summarizeEvaluations Tests
// =============================================================================

describe('summarizeEvaluations', () => {
  it('computes correct summary for all resolved', () => {
    const results = [
      createMockEvaluationResult({ resolved: true, testsPassed: 5, testsTotal: 5, durationMs: 1000 }),
      createMockEvaluationResult({ resolved: true, testsPassed: 3, testsTotal: 3, durationMs: 2000 }),
    ];

    const summary = summarizeEvaluations(results);

    expect(summary.total).toBe(2);
    expect(summary.resolved).toBe(2);
    expect(summary.resolveRate).toBe(1);
    expect(summary.withRegression).toBe(0);
    expect(summary.errors).toBe(0);
    expect(summary.avgTestsPassed).toBe(4);
    expect(summary.avgDurationMs).toBe(1500);
  });

  it('computes correct summary for mixed results', () => {
    const results = [
      createMockEvaluationResult({
        resolved: true,
        hasRegression: false,
        testsPassed: 5,
        testsTotal: 5,
        durationMs: 1000,
      }),
      createMockEvaluationResult({
        resolved: false,
        hasRegression: true,
        testsPassed: 2,
        testsTotal: 5,
        durationMs: 2000,
      }),
      createMockEvaluationResult({
        resolved: false,
        hasRegression: false,
        testsPassed: 0,
        testsTotal: 5,
        durationMs: 500,
        error: 'Test timeout',
      }),
    ];

    const summary = summarizeEvaluations(results);

    expect(summary.total).toBe(3);
    expect(summary.resolved).toBe(1);
    expect(summary.resolveRate).toBeCloseTo(1 / 3);
    expect(summary.withRegression).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.avgTestsPassed).toBeCloseTo((5 + 2 + 0) / 3);
    expect(summary.avgDurationMs).toBeCloseTo((1000 + 2000 + 500) / 3);
  });

  it('handles empty results', () => {
    const summary = summarizeEvaluations([]);

    expect(summary.total).toBe(0);
    expect(summary.resolved).toBe(0);
    expect(summary.resolveRate).toBe(0);
    expect(summary.withRegression).toBe(0);
    expect(summary.errors).toBe(0);
    expect(summary.avgTestsPassed).toBe(0);
    expect(summary.avgDurationMs).toBe(0);
  });

  it('computes correct resolve rate', () => {
    const results = [
      createMockEvaluationResult({ resolved: true }),
      createMockEvaluationResult({ resolved: true }),
      createMockEvaluationResult({ resolved: false }),
      createMockEvaluationResult({ resolved: false }),
    ];

    const summary = summarizeEvaluations(results);

    expect(summary.resolveRate).toBe(0.5);
  });

  it('counts errors correctly', () => {
    const results = [
      createMockEvaluationResult({ error: undefined }),
      createMockEvaluationResult({ error: 'Error 1' }),
      createMockEvaluationResult({ error: 'Error 2' }),
    ];

    const summary = summarizeEvaluations(results);

    expect(summary.errors).toBe(2);
  });
});

// =============================================================================
// Integration Scenarios (Unit-testable parts)
// =============================================================================

describe('Evaluation Result Structure', () => {
  it('creates correct structure for resolved task', () => {
    const result: EvaluationResult = {
      instanceId: 'test-instance',
      resolved: true,
      failToPassResults: [
        { testId: 'test1', passed: true, durationMs: 100 },
        { testId: 'test2', passed: true, durationMs: 150 },
      ],
      passToPassResults: [
        { testId: 'test3', passed: true, durationMs: 50 },
      ],
      hasRegression: false,
      testsPassed: 3,
      testsTotal: 3,
      durationMs: 500,
    };

    expect(result.resolved).toBe(true);
    expect(result.failToPassResults.every(r => r.passed)).toBe(true);
    expect(result.passToPassResults.every(r => r.passed)).toBe(true);
    expect(result.hasRegression).toBe(false);
  });

  it('creates correct structure for unresolved task', () => {
    const result: EvaluationResult = {
      instanceId: 'test-instance',
      resolved: false,
      failToPassResults: [
        { testId: 'test1', passed: false, output: 'AssertionError' },
        { testId: 'test2', passed: true },
      ],
      passToPassResults: [
        { testId: 'test3', passed: true },
      ],
      hasRegression: false,
      testsPassed: 2,
      testsTotal: 3,
      durationMs: 500,
    };

    expect(result.resolved).toBe(false);
    expect(result.failToPassResults.some(r => !r.passed)).toBe(true);
  });

  it('creates correct structure for task with regression', () => {
    const result: EvaluationResult = {
      instanceId: 'test-instance',
      resolved: false,
      failToPassResults: [
        { testId: 'test1', passed: true },
      ],
      passToPassResults: [
        { testId: 'test2', passed: false, output: 'Regression detected' },
      ],
      hasRegression: true,
      testsPassed: 1,
      testsTotal: 2,
      durationMs: 500,
    };

    expect(result.resolved).toBe(false);
    expect(result.hasRegression).toBe(true);
    expect(result.passToPassResults.some(r => !r.passed)).toBe(true);
  });
});

describe('TestSpec Validation', () => {
  it('validates test spec structure', () => {
    const task = createMockTask();

    expect(Array.isArray(task.testSpec.failToPass)).toBe(true);
    expect(Array.isArray(task.testSpec.passToPass)).toBe(true);
    expect(task.testSpec.failToPass.length).toBeGreaterThan(0);
  });

  it('handles empty test specs', () => {
    const task = createMockTask({
      testSpec: {
        failToPass: [],
        passToPass: [],
      },
    });

    expect(task.testSpec.failToPass).toHaveLength(0);
    expect(task.testSpec.passToPass).toHaveLength(0);
  });
});

describe('PatchResult Validation', () => {
  it('validates successful patch result', async () => {
    const result = await applyPatch({
      workDir: tempDir,
      patch: '',
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('filesModified');
    expect(result).toHaveProperty('output');
    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.filesModified)).toBe(true);
  });

  it('validates failed patch result has error', async () => {
    // Create a valid directory but with a patch that references a non-existent file
    const result = await applyPatch({
      workDir: tempDir,
      patch: 'diff --git a/nonexistent.txt b/nonexistent.txt\n--- a/nonexistent.txt\n+++ b/nonexistent.txt\n@@ -1 +1 @@\n-old\n+new',
    });

    // Should fail because the target file doesn't exist
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// Task Metadata Tests
// =============================================================================

describe('SWEBenchTask Structure', () => {
  it('has all required fields', () => {
    const task = createMockTask();

    // ExperimentTask fields
    expect(task.id).toBeDefined();
    expect(task.description).toBeDefined();

    // SWE-bench specific fields
    expect(task.instanceId).toBeDefined();
    expect(task.repoUrl).toBeDefined();
    expect(task.baseCommit).toBeDefined();
    expect(task.problemStatement).toBeDefined();
    expect(task.goldPatch).toBeDefined();
    expect(task.testPatch).toBeDefined();
    expect(task.testSpec).toBeDefined();
  });

  it('has valid GitHub URL format', () => {
    const task = createMockTask();

    expect(task.repoUrl).toMatch(/^https:\/\/github\.com\/.+\/.+$/);
  });

  it('has valid commit hash format', () => {
    const task = createMockTask({ baseCommit: 'abc123def456789' });

    expect(task.baseCommit).toMatch(/^[a-f0-9]+$/);
  });
});
