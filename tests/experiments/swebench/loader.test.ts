/**
 * SWE-bench Loader Tests
 * ======================
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadFromFile,
  loadTasks,
  instanceToTask,
  filterByRepo,
  filterByTestCount,
  stratifiedSample,
  getUniqueRepos,
  groupByRepo,
  computeDatasetStats,
} from '../../../src/experiments/swebench/loader.js';
import type { SWEBenchInstance, SWEBenchTask } from '../../../src/experiments/swebench/types.js';

// =============================================================================
// Test Data
// =============================================================================

function createMockInstance(overrides: Partial<SWEBenchInstance> = {}): SWEBenchInstance {
  return {
    instance_id: 'django__django-11099',
    repo: 'django/django',
    base_commit: 'abc123def456',
    problem_statement: 'Fix the bug in the template rendering system that causes...',
    hints_text: 'Check the render method',
    created_at: '2023-01-15T10:30:00Z',
    patch: 'diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n@@ -1,1 +1,1 @@\n-old\n+new',
    test_patch: 'diff --git a/test.py b/test.py\n--- a/test.py\n+++ b/test.py\n@@ -1,1 +1,1 @@\n-test_old\n+test_new',
    version: '3.2',
    FAIL_TO_PASS: '["test_render_template", "test_context_processing"]',
    PASS_TO_PASS: '["test_basic_render", "test_html_escape"]',
    ...overrides,
  };
}

function createMockTask(overrides: Partial<SWEBenchTask> = {}): SWEBenchTask {
  return {
    id: 'django__django-11099',
    description: 'Fix the bug in the template rendering system...',
    metadata: {
      repo: 'django/django',
      baseCommit: 'abc123def456',
    },
    instanceId: 'django__django-11099',
    repoUrl: 'https://github.com/django/django',
    baseCommit: 'abc123def456',
    problemStatement: 'Fix the bug in the template rendering system that causes...',
    hints: 'Check the render method',
    goldPatch: 'diff...',
    testPatch: 'diff...',
    testSpec: {
      failToPass: ['test_render_template', 'test_context_processing'],
      passToPass: ['test_basic_render', 'test_html_escape'],
    },
    framework: 'django',
    ...overrides,
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swebench-test-'));
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// =============================================================================
// loadFromFile Tests
// =============================================================================

describe('loadFromFile', () => {
  it('loads instances from JSONL file', () => {
    const instances = [
      createMockInstance({ instance_id: 'test-1' }),
      createMockInstance({ instance_id: 'test-2' }),
    ];

    const filePath = path.join(tempDir, 'dataset.jsonl');
    const content = instances.map(i => JSON.stringify(i)).join('\n');
    fs.writeFileSync(filePath, content);

    const loaded = loadFromFile(filePath);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].instance_id).toBe('test-1');
    expect(loaded[1].instance_id).toBe('test-2');
  });

  it('loads instances from JSON array file', () => {
    const instances = [
      createMockInstance({ instance_id: 'json-1' }),
      createMockInstance({ instance_id: 'json-2' }),
    ];

    const filePath = path.join(tempDir, 'dataset.json');
    fs.writeFileSync(filePath, JSON.stringify(instances));

    const loaded = loadFromFile(filePath);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].instance_id).toBe('json-1');
  });

  it('handles empty lines in JSONL', () => {
    const filePath = path.join(tempDir, 'with-empty.jsonl');
    const content = [
      JSON.stringify(createMockInstance({ instance_id: 'first' })),
      '',
      '   ',
      JSON.stringify(createMockInstance({ instance_id: 'second' })),
      '',
    ].join('\n');
    fs.writeFileSync(filePath, content);

    const loaded = loadFromFile(filePath);

    expect(loaded).toHaveLength(2);
  });

  it('throws for non-existent file', () => {
    expect(() => loadFromFile('/nonexistent/file.jsonl')).toThrow('not found');
  });

  it('throws for unsupported file format', () => {
    const filePath = path.join(tempDir, 'dataset.xml');
    fs.writeFileSync(filePath, '<data></data>');

    expect(() => loadFromFile(filePath)).toThrow('Unsupported file format');
  });

  it('skips invalid JSON lines gracefully', () => {
    const filePath = path.join(tempDir, 'with-invalid.jsonl');
    const content = [
      JSON.stringify(createMockInstance({ instance_id: 'valid' })),
      'not valid json {{{',
      JSON.stringify(createMockInstance({ instance_id: 'also-valid' })),
    ].join('\n');
    fs.writeFileSync(filePath, content);

    const loaded = loadFromFile(filePath);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].instance_id).toBe('valid');
    expect(loaded[1].instance_id).toBe('also-valid');
  });
});

// =============================================================================
// instanceToTask Tests
// =============================================================================

describe('instanceToTask', () => {
  it('converts instance to task with correct fields', () => {
    const instance = createMockInstance();
    const task = instanceToTask(instance);

    expect(task.id).toBe(instance.instance_id);
    expect(task.instanceId).toBe(instance.instance_id);
    expect(task.repoUrl).toBe('https://github.com/django/django');
    expect(task.baseCommit).toBe(instance.base_commit);
    expect(task.problemStatement).toBe(instance.problem_statement);
    expect(task.hints).toBe(instance.hints_text);
    expect(task.goldPatch).toBe(instance.patch);
    expect(task.testPatch).toBe(instance.test_patch);
  });

  it('parses test spec from JSON strings', () => {
    const instance = createMockInstance({
      FAIL_TO_PASS: '["test1", "test2"]',
      PASS_TO_PASS: '["test3"]',
    });

    const task = instanceToTask(instance);

    expect(task.testSpec.failToPass).toEqual(['test1', 'test2']);
    expect(task.testSpec.passToPass).toEqual(['test3']);
  });

  it('handles non-JSON test specs', () => {
    const instance = createMockInstance({
      FAIL_TO_PASS: 'test::single',
      PASS_TO_PASS: 'another::test',
    });

    const task = instanceToTask(instance);

    expect(task.testSpec.failToPass).toEqual(['test::single']);
    expect(task.testSpec.passToPass).toEqual(['another::test']);
  });

  it('infers framework from known repos', () => {
    const djangoTask = instanceToTask(createMockInstance({ repo: 'django/django' }));
    expect(djangoTask.framework).toBe('django');

    const pytestTask = instanceToTask(createMockInstance({ repo: 'pytest-dev/pytest' }));
    expect(pytestTask.framework).toBe('pytest');
  });

  it('truncates long descriptions', () => {
    const longDesc = 'A'.repeat(500);
    const instance = createMockInstance({ problem_statement: longDesc });

    const task = instanceToTask(instance);

    expect(task.description?.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(task.description).toContain('...');
  });

  it('preserves short descriptions without truncation', () => {
    const shortDesc = 'Fix a small bug';
    const instance = createMockInstance({ problem_statement: shortDesc });

    const task = instanceToTask(instance);

    expect(task.description).toBe(shortDesc);
  });

  it('includes difficulty when provided', () => {
    const instance = createMockInstance();
    const task = instanceToTask(instance, 'hard');

    expect(task.difficulty).toBe('hard');
  });

  it('includes metadata from instance', () => {
    const instance = createMockInstance({
      version: '4.0',
      created_at: '2024-01-01T00:00:00Z',
    });

    const task = instanceToTask(instance);

    expect(task.metadata?.version).toBe('4.0');
    expect(task.metadata?.createdAt).toBe('2024-01-01T00:00:00Z');
  });
});

// =============================================================================
// loadTasks Tests
// =============================================================================

describe('loadTasks', () => {
  it('loads and converts tasks from file', () => {
    const instances = [
      createMockInstance({ instance_id: 'task-1' }),
      createMockInstance({ instance_id: 'task-2' }),
    ];

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { tasks, metadata } = loadTasks({ localPath: filePath });

    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('task-1');
    expect(metadata.loadedTasks).toBe(2);
    expect(metadata.totalTasks).toBe(2);
  });

  it('filters by repository', () => {
    const instances = [
      createMockInstance({ instance_id: 'django-1', repo: 'django/django' }),
      createMockInstance({ instance_id: 'flask-1', repo: 'pallets/flask' }),
      createMockInstance({ instance_id: 'django-2', repo: 'django/django' }),
    ];

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { tasks } = loadTasks({
      localPath: filePath,
      repos: ['django/django'],
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.every(t => t.repoUrl.includes('django'))).toBe(true);
  });

  it('filters by instance IDs', () => {
    const instances = [
      createMockInstance({ instance_id: 'keep-1' }),
      createMockInstance({ instance_id: 'skip-1' }),
      createMockInstance({ instance_id: 'keep-2' }),
    ];

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { tasks } = loadTasks({
      localPath: filePath,
      instanceIds: ['keep-1', 'keep-2'],
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.map(t => t.id)).toEqual(['keep-1', 'keep-2']);
  });

  it('applies limit', () => {
    const instances = Array.from({ length: 10 }, (_, i) =>
      createMockInstance({ instance_id: `task-${i}` })
    );

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { tasks, metadata } = loadTasks({
      localPath: filePath,
      limit: 3,
    });

    expect(tasks).toHaveLength(3);
    expect(metadata.totalTasks).toBe(10);
    expect(metadata.loadedTasks).toBe(3);
  });

  it('shuffles tasks with seed', () => {
    const instances = Array.from({ length: 5 }, (_, i) =>
      createMockInstance({ instance_id: `task-${i}` })
    );

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { tasks: shuffled1 } = loadTasks({
      localPath: filePath,
      shuffle: true,
      seed: 12345,
    });

    const { tasks: shuffled2 } = loadTasks({
      localPath: filePath,
      shuffle: true,
      seed: 12345,
    });

    // Same seed should produce same order
    expect(shuffled1.map(t => t.id)).toEqual(shuffled2.map(t => t.id));

    // Should be different from original order (with high probability)
    const original = instances.map(i => i.instance_id);
    const shuffledIds = shuffled1.map(t => t.id);
    expect(shuffledIds).not.toEqual(original);
  });

  it('includes unique repositories in metadata', () => {
    const instances = [
      createMockInstance({ instance_id: '1', repo: 'a/a' }),
      createMockInstance({ instance_id: '2', repo: 'b/b' }),
      createMockInstance({ instance_id: '3', repo: 'a/a' }),
    ];

    const filePath = path.join(tempDir, 'dataset.jsonl');
    fs.writeFileSync(filePath, instances.map(i => JSON.stringify(i)).join('\n'));

    const { metadata } = loadTasks({ localPath: filePath });

    expect(metadata.repositories).toHaveLength(2);
  });
});

// =============================================================================
// Filter Utilities Tests
// =============================================================================

describe('filterByRepo', () => {
  it('filters tasks by repository name', () => {
    const tasks = [
      createMockTask({ id: '1', repoUrl: 'https://github.com/django/django' }),
      createMockTask({ id: '2', repoUrl: 'https://github.com/flask/flask' }),
      createMockTask({ id: '3', repoUrl: 'https://github.com/django/django' }),
    ];

    const filtered = filterByRepo(tasks, ['django/django']);

    expect(filtered).toHaveLength(2);
    expect(filtered.every(t => t.repoUrl.includes('django'))).toBe(true);
  });

  it('handles case-insensitive matching', () => {
    const tasks = [
      createMockTask({ id: '1', repoUrl: 'https://github.com/Django/Django' }),
    ];

    const filtered = filterByRepo(tasks, ['django/django']);

    expect(filtered).toHaveLength(1);
  });
});

describe('filterByTestCount', () => {
  it('filters tasks with minimum test count', () => {
    const tasks = [
      createMockTask({ id: '1', testSpec: { failToPass: ['t1'], passToPass: [] } }),
      createMockTask({ id: '2', testSpec: { failToPass: ['t1', 't2', 't3'], passToPass: [] } }),
      createMockTask({ id: '3', testSpec: { failToPass: ['t1', 't2'], passToPass: [] } }),
    ];

    const filtered = filterByTestCount(tasks, 2);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(t => t.id)).toEqual(['2', '3']);
  });
});

describe('stratifiedSample', () => {
  it('samples equally from each repository', () => {
    const tasks = [
      createMockTask({ id: '1', repoUrl: 'https://github.com/a/a' }),
      createMockTask({ id: '2', repoUrl: 'https://github.com/a/a' }),
      createMockTask({ id: '3', repoUrl: 'https://github.com/a/a' }),
      createMockTask({ id: '4', repoUrl: 'https://github.com/b/b' }),
      createMockTask({ id: '5', repoUrl: 'https://github.com/b/b' }),
    ];

    const sampled = stratifiedSample(tasks, 2, 42);

    expect(sampled.length).toBeLessThanOrEqual(4); // 2 per repo max

    const repoA = sampled.filter(t => t.repoUrl.includes('a/a'));
    const repoB = sampled.filter(t => t.repoUrl.includes('b/b'));

    expect(repoA.length).toBeLessThanOrEqual(2);
    expect(repoB.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// Grouping Utilities Tests
// =============================================================================

describe('getUniqueRepos', () => {
  it('returns unique repository URLs', () => {
    const tasks = [
      createMockTask({ repoUrl: 'https://github.com/a/a' }),
      createMockTask({ repoUrl: 'https://github.com/b/b' }),
      createMockTask({ repoUrl: 'https://github.com/a/a' }),
    ];

    const repos = getUniqueRepos(tasks);

    expect(repos).toHaveLength(2);
    expect(repos).toContain('https://github.com/a/a');
    expect(repos).toContain('https://github.com/b/b');
  });
});

describe('groupByRepo', () => {
  it('groups tasks by repository', () => {
    const tasks = [
      createMockTask({ id: '1', repoUrl: 'https://github.com/a/a' }),
      createMockTask({ id: '2', repoUrl: 'https://github.com/b/b' }),
      createMockTask({ id: '3', repoUrl: 'https://github.com/a/a' }),
    ];

    const groups = groupByRepo(tasks);

    expect(groups.size).toBe(2);
    expect(groups.get('https://github.com/a/a')).toHaveLength(2);
    expect(groups.get('https://github.com/b/b')).toHaveLength(1);
  });
});

describe('computeDatasetStats', () => {
  it('computes correct statistics', () => {
    const tasks = [
      createMockTask({
        id: '1',
        repoUrl: 'https://github.com/a/a',
        testSpec: { failToPass: ['t1', 't2'], passToPass: ['t3'] },
      }),
      createMockTask({
        id: '2',
        repoUrl: 'https://github.com/b/b',
        testSpec: { failToPass: ['t1'], passToPass: ['t2', 't3'] },
      }),
      createMockTask({
        id: '3',
        repoUrl: 'https://github.com/a/a',
        testSpec: { failToPass: ['t1'], passToPass: [] },
      }),
    ];

    const stats = computeDatasetStats(tasks);

    expect(stats.totalTasks).toBe(3);
    expect(stats.totalRepos).toBe(2);
    expect(stats.avgTestsPerTask).toBe((3 + 3 + 1) / 3);
    expect(stats.tasksPerRepo['https://github.com/a/a']).toBe(2);
    expect(stats.tasksPerRepo['https://github.com/b/b']).toBe(1);
  });

  it('handles empty task list', () => {
    const stats = computeDatasetStats([]);

    expect(stats.totalTasks).toBe(0);
    expect(stats.totalRepos).toBe(0);
    expect(stats.avgTestsPerTask).toBe(0);
  });
});
