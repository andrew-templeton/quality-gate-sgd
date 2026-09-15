import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { analyzePlan, renderPlan, validatePlan } from '../scripts/work-graph.mjs';

function fixture() {
  const task = (id, status, dependsOn, track = 'stable-api') => ({
    id, title: id, owner: 'core', track, status, dependsOn,
    acceptance: ['A reviewable result is recorded.'],
    evidence: status === 'done' ? [{ label: 'Reviewed change', url: 'https://github.com/example/core/commit/abc123' }] : [],
    links: [],
  });
  return {
    schemaVersion: 1, apiVersion: '2.0.0-dev.1', title: 'Example work graph', description: 'Dependency semantics fixture.',
    updatedAt: '2026-09-14', stableMilestone: 'release',
    repositories: [{ id: 'core', name: 'Example core', url: 'https://github.com/example/core', scope: 'Generic engine.' }],
    tasks: [task('prepare', 'done', [], 'foundation'), task('validate', 'active', ['prepare']), task('release', 'planned', ['validate']), task('later-study', 'planned', [], 'later')],
  };
}

test('frontier and stable blockers follow dependencies, not array ordering or unrelated studies', () => {
  const plan = fixture();
  plan.tasks.reverse();
  const analysis = analyzePlan(plan);
  assert.deepEqual(new Set(analysis.ready.map(task => task.id)), new Set(['validate', 'later-study']));
  assert.deepEqual(analysis.stableBlockers.map(task => task.id), ['validate']);
  assert.deepEqual(analysis.stablePath, new Set(['release', 'validate', 'prepare']));
  assert.equal(analysis.stablePath.has('later-study'), false);
});

test('active work with unfinished prerequisites is visible but not ready', () => {
  const plan = fixture();
  plan.tasks[2].status = 'active';
  const analysis = analyzePlan(plan);
  assert.deepEqual(analysis.activeBlocked.map(task => task.id), ['release']);
  assert.equal(analysis.ready.some(task => task.id === 'release'), false);
});

test('marking a prerequisite done moves the milestone into the ready frontier', () => {
  const plan = fixture();
  plan.tasks[1].status = 'done';
  plan.tasks[1].evidence = [{ label: 'Passing validation', url: '../v2/VALIDATION.md' }];
  const analysis = analyzePlan(plan);
  assert.equal(analysis.stableBlockers.length, 0);
  assert.equal(analysis.ready.some(task => task.id === 'release'), true);
  assert.match(renderPlan(plan), /is \*\*ready for review\*\*/);
  assert.equal(plan.tasks[2].status, 'planned');
});

test('rejects duplicate task and repository IDs', () => {
  const plan = fixture();
  plan.tasks.push(structuredClone(plan.tasks[0]));
  assert.throws(() => validatePlan(plan), /Duplicate task ID/);
  const repositories = fixture();
  repositories.repositories.push(structuredClone(repositories.repositories[0]));
  assert.throws(() => validatePlan(repositories), /Duplicate repository ID/);
});

test('rejects dangling, self and duplicate dependency references', () => {
  for (const dependencies of [['missing'], ['validate'], ['prepare', 'prepare']]) {
    const plan = fixture();
    plan.tasks[1].dependsOn = dependencies;
    assert.throws(() => validatePlan(plan), /dangling dependency|depends on itself|duplicates/);
  }
});

test('rejects cycles even when every involved task is unfinished', () => {
  const plan = fixture();
  plan.tasks[1].dependsOn = ['release'];
  assert.throws(() => validatePlan(plan), /Dependency cycle/);
});

test('rejects completion without evidence or with unfinished prerequisites', () => {
  const noEvidence = fixture();
  noEvidence.tasks[0].evidence = [];
  assert.throws(() => validatePlan(noEvidence), /prepare.evidence/);
  const unfinished = fixture();
  unfinished.tasks[2].status = 'done';
  unfinished.tasks[2].evidence = [{ label: 'Premature assertion', url: 'https://github.com/example/core/pull/1' }];
  assert.throws(() => validatePlan(unfinished), /Done task release has unfinished prerequisite validate/);
});

test('rejects malformed ownership, statuses, records, acceptance criteria and dates', () => {
  const mutations = [
    plan => { plan.tasks[0].owner = 'unknown'; },
    plan => { plan.tasks[0].status = 'complete'; },
    plan => { plan.tasks[0].track = 'unrecognized'; },
    plan => { plan.tasks[0].acceptance = []; },
    plan => { plan.tasks[0].extraField = true; },
    plan => { delete plan.tasks[0].dependsOn; },
    plan => { plan.tasks[0].title = 'Multiline\nlabel'; },
    plan => { plan.tasks[0].id = 'unsafe id'; },
    plan => { plan.updatedAt = '2026-02-30'; },
    plan => { plan.schemaVersion = 2; },
    plan => { plan.apiVersion = 'latest'; },
    plan => { plan.stableMilestone = 'missing'; },
    plan => { plan.stableMilestone = 'later-study'; },
  ];
  for (const mutate of mutations) {
    const plan = fixture();
    mutate(plan);
    assert.throws(() => validatePlan(plan));
  }
});

test('rejects unsafe links and non-public repository address formats', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/evidence', 'https://user:secret@example.com/evidence', 'https://example.com/a)']) {
    const plan = fixture();
    plan.tasks[0].evidence[0].url = url;
    assert.throws(() => validatePlan(plan));
  }
  const plan = fixture();
  plan.repositories[0].url = 'git@github.com:example/core.git';
  assert.throws(() => validatePlan(plan), /public GitHub URL/);
});

test('generated graph uses prerequisite-to-dependent edges and deterministic output', () => {
  const plan = fixture();
  const before = structuredClone(plan);
  const rendered = renderPlan(plan);
  assert.match(rendered, /task_prepare --> task_validate/);
  assert.match(rendered, /task_validate --> task_release/);
  assert.doesNotMatch(rendered, /task_release --> task_validate/);
  assert.match(rendered, /is \*\*blocked\*\*/);
  assert.equal(renderPlan(plan), rendered);
  assert.deepEqual(plan, before);
});

test('checked-in graph validates and its generated document is synchronized', async () => {
  const plan = JSON.parse(await readFile(new URL('../docs/work/graph.json', import.meta.url), 'utf8'));
  assert.deepEqual(new Set(plan.repositories.map(repository => repository.id)), new Set(['core', 'software', 'sonarqube', 'isogloss']));
  assert.equal(await readFile(new URL('../docs/work/README.md', import.meta.url), 'utf8'), renderPlan(plan));
});

test('CLI check detects stale generated docs without rewriting them', async context => {
  const root = await mkdtemp(join(tmpdir(), 'quality-sgd-work-graph-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'docs/work'), { recursive: true });
  const script = join(root, 'scripts/work-graph.mjs');
  await copyFile(new URL('../scripts/work-graph.mjs', import.meta.url), script);
  await writeFile(join(root, 'docs/work/graph.json'), JSON.stringify(fixture()));
  const run = command => spawnSync(process.execPath, [script, command], { encoding: 'utf8' });
  assert.equal(run('write').status, 0);
  assert.equal(run('check').status, 0);
  const document = join(root, 'docs/work/README.md');
  await writeFile(document, 'manual stale edit\n');
  const checked = run('check');
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /out of sync/);
  assert.equal(await readFile(document, 'utf8'), 'manual stale edit\n');
  assert.equal(run('unknown').status, 1);
});
