/**
 * SWE-bench Task Loader
 * =====================
 * Utilities for loading and processing SWE-bench dataset tasks.
 *
 * Supports:
 * - Loading from local JSONL files
 * - Filtering by repo, difficulty, instance ID
 * - Converting to ExperimentTask format
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
// =============================================================================
// Constants
// =============================================================================
/**
 * GitHub base URL for repository cloning.
 */
const GITHUB_BASE_URL = 'https://github.com';
/**
 * Known repository frameworks for test command inference.
 */
const REPO_FRAMEWORKS = {
    'django/django': 'django',
    'pallets/flask': 'pytest',
    'psf/requests': 'pytest',
    'scikit-learn/scikit-learn': 'pytest',
    'matplotlib/matplotlib': 'pytest',
    'sympy/sympy': 'pytest',
    'pytest-dev/pytest': 'pytest',
    'astropy/astropy': 'pytest',
    'sphinx-doc/sphinx': 'pytest',
    'pydata/xarray': 'pytest',
};
// =============================================================================
// Dataset Loading
// =============================================================================
/**
 * Load SWE-bench tasks from a local file.
 */
export function loadFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Dataset file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jsonl') {
        return parseJsonl(content);
    }
    else if (ext === '.json') {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [parsed];
    }
    else {
        throw new Error(`Unsupported file format: ${ext}`);
    }
}
/**
 * Parse JSONL content into instances.
 */
function parseJsonl(content) {
    const instances = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            instances.push(JSON.parse(trimmed));
        }
        catch {
            // Skip invalid lines
        }
    }
    return instances;
}
/**
 * Load tasks with filtering and processing.
 */
export function loadTasks(options = {}) {
    const { split = 'lite', localPath, repos, instanceIds, limit, shuffle = false, seed, difficulty, } = options;
    // Load raw instances
    let instances;
    let datasetPath;
    if (localPath) {
        instances = loadFromFile(localPath);
        datasetPath = localPath;
    }
    else {
        // Look for dataset in standard locations
        datasetPath = findDatasetPath(split);
        instances = loadFromFile(datasetPath);
    }
    const totalTasks = instances.length;
    // Apply filters
    let filtered = instances;
    if (repos && repos.length > 0) {
        const repoSet = new Set(repos.map(r => r.toLowerCase()));
        filtered = filtered.filter(i => repoSet.has(i.repo.toLowerCase()));
    }
    if (instanceIds && instanceIds.length > 0) {
        const idSet = new Set(instanceIds);
        filtered = filtered.filter(i => idSet.has(i.instance_id));
    }
    // Shuffle if requested
    if (shuffle) {
        filtered = shuffleArray(filtered, seed);
    }
    // Apply limit
    if (limit && limit > 0) {
        filtered = filtered.slice(0, limit);
    }
    // Convert to tasks
    const tasks = filtered.map(instance => instanceToTask(instance, difficulty));
    // Compute metadata
    const uniqueRepos = [...new Set(tasks.map(t => t.repoUrl))];
    const metadata = {
        name: `swe-bench-${split}`,
        split,
        totalTasks,
        loadedTasks: tasks.length,
        repositories: uniqueRepos,
        loadedAt: Date.now(),
    };
    return { tasks, metadata };
}
/**
 * Find dataset file in standard locations.
 */
function findDatasetPath(split) {
    const possiblePaths = [
        // Project-local
        `data/swe-bench-${split}.jsonl`,
        `data/swe-bench/${split}.jsonl`,
        // Home directory
        `${process.env.HOME}/.swe-bench/${split}.jsonl`,
        // Current working directory
        `swe-bench-${split}.jsonl`,
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    throw new Error(`SWE-bench dataset not found for split "${split}". ` +
        `Please download the dataset and place it in one of: ${possiblePaths.join(', ')}`);
}
// =============================================================================
// Instance Processing
// =============================================================================
/**
 * Convert a raw SWE-bench instance to an ExperimentTask.
 */
export function instanceToTask(instance, difficulty) {
    const testSpec = parseTestSpec(instance);
    const framework = inferFramework(instance.repo);
    return {
        // ExperimentTask fields
        id: instance.instance_id,
        description: truncateDescription(instance.problem_statement),
        metadata: {
            repo: instance.repo,
            baseCommit: instance.base_commit,
            version: instance.version,
            createdAt: instance.created_at,
        },
        // SWEBenchTask-specific fields
        instanceId: instance.instance_id,
        repoUrl: `${GITHUB_BASE_URL}/${instance.repo}`,
        baseCommit: instance.base_commit,
        problemStatement: instance.problem_statement,
        hints: instance.hints_text,
        goldPatch: instance.patch,
        testPatch: instance.test_patch,
        testSpec,
        framework,
        difficulty,
    };
}
/**
 * Parse test specification from instance.
 */
function parseTestSpec(instance) {
    // Test specs are stored as JSON strings in the dataset
    let failToPass = [];
    let passToPass = [];
    try {
        if (instance.FAIL_TO_PASS) {
            const parsed = JSON.parse(instance.FAIL_TO_PASS);
            failToPass = Array.isArray(parsed) ? parsed : [parsed];
        }
    }
    catch {
        // If not valid JSON, treat as single test
        if (instance.FAIL_TO_PASS) {
            failToPass = [instance.FAIL_TO_PASS];
        }
    }
    try {
        if (instance.PASS_TO_PASS) {
            const parsed = JSON.parse(instance.PASS_TO_PASS);
            passToPass = Array.isArray(parsed) ? parsed : [parsed];
        }
    }
    catch {
        if (instance.PASS_TO_PASS) {
            passToPass = [instance.PASS_TO_PASS];
        }
    }
    return { failToPass, passToPass };
}
/**
 * Infer test framework from repository name.
 */
function inferFramework(repo) {
    return REPO_FRAMEWORKS[repo.toLowerCase()];
}
/**
 * Truncate description to reasonable length.
 */
function truncateDescription(text, maxLength = 200) {
    if (text.length <= maxLength) {
        return text;
    }
    // Find a good break point
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
        return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
}
// =============================================================================
// Filtering Utilities
// =============================================================================
/**
 * Filter tasks by repository.
 */
export function filterByRepo(tasks, repos) {
    const repoSet = new Set(repos.map(r => r.toLowerCase()));
    return tasks.filter(t => {
        const taskRepo = t.repoUrl.replace(`${GITHUB_BASE_URL}/`, '').toLowerCase();
        return repoSet.has(taskRepo);
    });
}
/**
 * Filter tasks by minimum test count.
 */
export function filterByTestCount(tasks, minTests) {
    return tasks.filter(t => t.testSpec.failToPass.length >= minTests);
}
/**
 * Stratified sample by repository.
 */
export function stratifiedSample(tasks, tasksPerRepo, seed) {
    // Group by repo
    const byRepo = new Map();
    for (const task of tasks) {
        const repo = task.repoUrl;
        const existing = byRepo.get(repo) ?? [];
        existing.push(task);
        byRepo.set(repo, existing);
    }
    // Sample from each repo
    const sampled = [];
    for (const [repo, repoTasks] of byRepo) {
        const shuffled = shuffleArray(repoTasks, seed);
        sampled.push(...shuffled.slice(0, tasksPerRepo));
    }
    return sampled;
}
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Shuffle array with optional seed.
 */
function shuffleArray(array, seed) {
    const result = [...array];
    const rng = seed !== undefined ? seededRandom(seed) : Math.random;
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
/**
 * Seeded random number generator.
 */
function seededRandom(seed) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}
/**
 * Get unique repositories from tasks.
 */
export function getUniqueRepos(tasks) {
    return [...new Set(tasks.map(t => t.repoUrl))];
}
/**
 * Group tasks by repository.
 */
export function groupByRepo(tasks) {
    const groups = new Map();
    for (const task of tasks) {
        const existing = groups.get(task.repoUrl) ?? [];
        existing.push(task);
        groups.set(task.repoUrl, existing);
    }
    return groups;
}
/**
 * Compute dataset statistics.
 */
export function computeDatasetStats(tasks) {
    const repoGroups = groupByRepo(tasks);
    const totalTests = tasks.reduce((sum, t) => sum + t.testSpec.failToPass.length + t.testSpec.passToPass.length, 0);
    const tasksPerRepo = {};
    for (const [repo, repoTasks] of repoGroups) {
        tasksPerRepo[repo] = repoTasks.length;
    }
    return {
        totalTasks: tasks.length,
        totalRepos: repoGroups.size,
        avgTestsPerTask: tasks.length > 0 ? totalTests / tasks.length : 0,
        tasksPerRepo,
    };
}
//# sourceMappingURL=loader.js.map