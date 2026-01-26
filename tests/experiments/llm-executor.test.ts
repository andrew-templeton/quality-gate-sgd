/**
 * LLM Executor Tests
 * ==================
 * Tests for the OpenAI Responses API executor.
 * Uses mocking since we can't make real API calls in tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createLLMExecutor,
  createGPT5MiniExecutor,
  createGPT5NanoExecutor,
  createGPT52Executor,
  createCustomEndpointExecutor,
} from '../../src/experiments/llm-executor.js';
import type { FixContext } from '../../src/experiments/harness.js';
import type { ExperimentTask } from '../../src/experiments/runner.js';
import type { TargetSuggestion, ExperimentConfig } from '../../src/experiments/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock fs operations
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('LLM Executor', () => {
  const projectRoot = '/test/project';
  const mockApiKey = 'test-api-key';

  const mockTask: ExperimentTask = {
    id: 'test-task-1',
    description: 'Fix failing test in utils.ts',
  };

  const mockSuggestion: TargetSuggestion = {
    type: 'symbol',
    id: 'src/utils.ts::calculateTotal',
    expectedDeltaQ: 0.05,
    fixabilityScore: 0.8,
  };

  const mockConfig: ExperimentConfig = {
    gateEnabled: true,
    topology: 'full',
    granularity: 'symbol',
    maxIterations: 10,
    prioritization: 'adjusted',
    callGraphWeighting: true,
    fixabilityEstimation: true,
  };

  const mockContext: FixContext = {
    iteration: 1,
    currentScore: 75.5,
    targetScore: 90,
    metrics: {
      'coverage.lines': 75,
      'eslint.errors': 2,
    },
    feedbackEnabled: true,
    config: mockConfig,
    availableTargets: [mockSuggestion],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = mockApiKey;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('createLLMExecutor', () => {
    it('should create executor with default config', () => {
      const executor = createLLMExecutor({ projectRoot });
      expect(executor).toBeDefined();
      expect(executor.attemptFix).toBeDefined();
    });

    it('should throw if no API key is available', async () => {
      delete process.env.OPENAI_API_KEY;

      const executor = createLLMExecutor({
        projectRoot,
        retry: { maxRetries: 0 }, // No retries for this test
      });

      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('OPENAI_API_KEY');
    });

    it('should handle successful fix response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Added missing null check',
                changes: [{
                  filePath: 'src/utils.ts',
                  changeType: 'modify',
                  newContent: 'export function calculateTotal(items) { return items?.reduce((a, b) => a + b, 0) ?? 0; }',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify file was written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.resolve(projectRoot, 'src/utils.ts'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should handle LLM declining to fix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: false,
                reasoning: 'Issue requires architectural changes',
                error: 'Cannot fix without breaking API contract',
              }),
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('API contract');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const executor = createLLMExecutor({
        projectRoot,
        retry: { maxRetries: 0 },
      });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('API error 500');
    });

    it('should handle malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: 'This is not valid JSON',
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    it('should handle JSON in markdown code blocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: '```json\n{"canFix": true, "reasoning": "test", "changes": []}\n```',
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      // No changes array = declined
      expect(result.error).toContain('declined');
    });

    it('should respect dry run mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Simple fix',
                changes: [{
                  filePath: 'src/utils.ts',
                  changeType: 'modify',
                  newContent: 'fixed content',
                }],
              }),
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({
        projectRoot,
        applyChanges: false,
      });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('Dry run');

      // Verify no files were written
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should prevent path traversal attacks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Malicious fix',
                changes: [{
                  filePath: '../../../etc/passwd',
                  changeType: 'modify',
                  newContent: 'hacked',
                }],
              }),
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.error).toContain('Path escape');

      // Verify dangerous path was not written
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle null suggestion (no-gate condition)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'General improvement',
                changes: [{
                  filePath: 'src/index.ts',
                  changeType: 'modify',
                  newContent: 'improved code',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const noGateContext = { ...mockContext, feedbackEnabled: false };
      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, null, noGateContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
    });

    it('should handle file-type suggestions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'File-level fix',
                changes: [{
                  filePath: 'src/helpers.ts',
                  changeType: 'modify',
                  newContent: 'fixed helpers',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('original content');

      const fileSuggestion: TargetSuggestion = {
        type: 'file',
        id: 'src/helpers.ts',
        expectedDeltaQ: 0.1,
      };

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, fileSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);

      // Verify file context was read
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should retry on transient errors', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'resp-123',
            output: [{
              type: 'message',
              content: [{
                type: 'output_text',
                text: JSON.stringify({
                  canFix: true,
                  reasoning: 'Retry succeeded',
                  changes: [{
                    filePath: 'src/utils.ts',
                    changeType: 'modify',
                    newContent: 'fixed',
                  }],
                }),
              }],
            }],
          }),
        });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const executor = createLLMExecutor({
        projectRoot,
        retry: { maxRetries: 1, initialDelayMs: 1 },
      });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on auth errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const executor = createLLMExecutor({
        projectRoot,
        retry: { maxRetries: 3 },
      });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('401');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('factory functions', () => {
    it('createGPT5MiniExecutor uses correct model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({ canFix: false, error: 'test' }),
            }],
          }],
        }),
      });

      const executor = createGPT5MiniExecutor(projectRoot);
      await executor.attemptFix(mockTask, null, mockContext);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('gpt-5-mini');
    });

    it('createGPT5NanoExecutor uses correct model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({ canFix: false, error: 'test' }),
            }],
          }],
        }),
      });

      const executor = createGPT5NanoExecutor(projectRoot);
      await executor.attemptFix(mockTask, null, mockContext);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('gpt-5-nano');
    });

    it('createGPT52Executor uses correct model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({ canFix: false, error: 'test' }),
            }],
          }],
        }),
      });

      const executor = createGPT52Executor(projectRoot);
      await executor.attemptFix(mockTask, null, mockContext);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('gpt-5.2');
    });

    it('createCustomEndpointExecutor uses custom URL and model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({ canFix: false, error: 'test' }),
            }],
          }],
        }),
      });

      const customUrl = 'https://custom.endpoint.com/v1';
      const customModel = 'custom-model-v1';

      const executor = createCustomEndpointExecutor(
        projectRoot,
        customUrl,
        customModel
      );
      await executor.attemptFix(mockTask, null, mockContext);

      expect(mockFetch.mock.calls[0][0]).toBe(`${customUrl}/responses`);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe(customModel);
    });
  });

  describe('file operations', () => {
    it('should create directories if needed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Create new file',
                changes: [{
                  filePath: 'src/new/deep/file.ts',
                  changeType: 'create',
                  newContent: 'new file content',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('src/new/deep'),
        { recursive: true }
      );
    });

    it('should handle file deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Remove dead code',
                changes: [{
                  filePath: 'src/deprecated.ts',
                  changeType: 'delete',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.resolve(projectRoot, 'src/deprecated.ts')
      );
    });

    it('should handle missing content for modify', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Missing content bug',
                changes: [{
                  filePath: 'src/file.ts',
                  changeType: 'modify',
                  // newContent is missing
                }],
              }),
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.error).toContain('No content');
    });
  });

  describe('patch generation', () => {
    it('should return changes and patch in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Simple fix',
                changes: [{
                  filePath: 'src/utils.ts',
                  changeType: 'modify',
                  newContent: 'function fixed() { return true; }',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function broken() { return false; }');

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.attempted).toBe(true);
      expect(result.modified).toBe(true);
      expect(result.changes).toBeDefined();
      expect(result.changes).toHaveLength(1);
      expect(result.changes![0].filePath).toBe('src/utils.ts');
      expect(result.changes![0].changeType).toBe('modify');
      expect(result.patch).toBeDefined();
      expect(result.patch).toContain('diff --git');
      expect(result.patch).toContain('src/utils.ts');
    });

    it('should generate patch for file creation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Create new file',
                changes: [{
                  filePath: 'src/new-file.ts',
                  changeType: 'create',
                  newContent: 'export const newFeature = true;',
                }],
              }),
            }],
          }],
        }),
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const executor = createLLMExecutor({ projectRoot });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.patch).toBeDefined();
      expect(result.patch).toContain('new file mode');
      expect(result.patch).toContain('+export const newFeature = true;');
    });

    it('should return patch even in dry run mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'resp-123',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                canFix: true,
                reasoning: 'Dry run test',
                changes: [{
                  filePath: 'src/dry.ts',
                  changeType: 'create',
                  newContent: 'dry run content',
                }],
              }),
            }],
          }],
        }),
      });

      const executor = createLLMExecutor({
        projectRoot,
        applyChanges: false,
      });
      const result = await executor.attemptFix(mockTask, mockSuggestion, mockContext);

      expect(result.modified).toBe(false);
      expect(result.error).toContain('Dry run');
      // Even though not applied, patch should be generated
      expect(result.patch).toBeDefined();
      expect(result.changes).toBeDefined();
    });
  });
});
