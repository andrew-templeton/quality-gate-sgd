#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('../docs/work/graph.json', import.meta.url);
const outputUrl = new URL('../docs/work/README.md', import.meta.url);
const statuses = new Set(['planned', 'active', 'done']);
const tracks = new Set(['foundation', 'externalization', 'stable-api', 'later']);
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function record(value, label, fields) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  for (const key of Object.keys(value)) assert(fields.includes(key), `${label} has unknown field ${key}`);
  for (const key of fields) assert(Object.hasOwn(value, key), `${label} is missing ${key}`);
}
function text(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0 && !/[\r\n\x00-\x1f]/.test(value), `${label} must be nonempty single-line text`);
}
function list(value, label, minimum = 0) {
  assert(Array.isArray(value) && value.length >= minimum, `${label} must be an array with at least ${minimum} entries`);
}
function strings(value, label, minimum = 0) {
  list(value, label, minimum);
  value.forEach((entry, index) => text(entry, `${label}[${index}]`));
  assert(new Set(value).size === value.length, `${label} contains duplicates`);
}
function link(value, label) {
  record(value, label, ['label', 'url']);
  text(value.label, `${label}.label`);
  text(value.url, `${label}.url`);
  assert(!/[\s<>"()]/.test(value.url), `${label}.url contains unsafe link characters`);
  assert(/^https:\/\//.test(value.url) || /^(?:\.\.?\/)[A-Za-z0-9_./#-]+$/.test(value.url), `${label}.url must be HTTPS or a relative documentation link`);
  if (value.url.startsWith('https:')) {
    const parsed = new URL(value.url);
    assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password, `${label}.url must be an unauthenticated HTTPS URL`);
  }
}

/** Validate structural integrity and truthful completion ordering; evidence remains a review obligation. */
export function validatePlan(plan) {
  record(plan, 'plan', ['schemaVersion', 'apiVersion', 'title', 'description', 'updatedAt', 'stableMilestone', 'repositories', 'tasks']);
  assert(plan.schemaVersion === 1, 'Unsupported plan schemaVersion');
  for (const field of ['apiVersion', 'title', 'description', 'updatedAt', 'stableMilestone']) text(plan[field], `plan.${field}`);
  assert(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(plan.apiVersion), 'apiVersion must be a semantic version');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(plan.updatedAt) && new Date(`${plan.updatedAt}T00:00:00Z`).toISOString().slice(0, 10) === plan.updatedAt, 'updatedAt must be a valid YYYY-MM-DD date');
  list(plan.repositories, 'repositories', 1);
  const repositories = new Set();
  for (const repository of plan.repositories) {
    record(repository, 'repository', ['id', 'name', 'url', 'scope']);
    for (const field of ['id', 'name', 'url', 'scope']) text(repository[field], `repository.${field}`);
    assert(identifier.test(repository.id), `Invalid repository ID ${repository.id}`);
    assert(!repositories.has(repository.id), `Duplicate repository ID ${repository.id}`);
    assert(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.url), `Repository ${repository.id} must name a public GitHub URL`);
    repositories.add(repository.id);
  }
  list(plan.tasks, 'tasks', 1);
  const tasks = new Map();
  for (const task of plan.tasks) {
    record(task, 'task', ['id', 'title', 'owner', 'track', 'status', 'dependsOn', 'acceptance', 'evidence', 'links']);
    for (const field of ['id', 'title', 'owner', 'track', 'status']) text(task[field], `task.${field}`);
    assert(identifier.test(task.id), `Invalid task ID ${task.id}`);
    assert(!tasks.has(task.id), `Duplicate task ID ${task.id}`);
    assert(repositories.has(task.owner), `Task ${task.id} has unknown owner ${task.owner}`);
    assert(tracks.has(task.track), `Task ${task.id} has unknown track ${task.track}`);
    assert(statuses.has(task.status), `Task ${task.id} has invalid status ${task.status}`);
    strings(task.dependsOn, `${task.id}.dependsOn`);
    strings(task.acceptance, `${task.id}.acceptance`, 1);
    list(task.evidence, `${task.id}.evidence`, task.status === 'done' ? 1 : 0);
    task.evidence.forEach((entry, index) => link(entry, `${task.id}.evidence[${index}]`));
    list(task.links, `${task.id}.links`);
    task.links.forEach((entry, index) => link(entry, `${task.id}.links[${index}]`));
    tasks.set(task.id, task);
  }
  assert(tasks.has(plan.stableMilestone), 'stableMilestone must name a task');
  assert(tasks.get(plan.stableMilestone).track === 'stable-api', 'stableMilestone must be in the stable-api track');
  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      assert(tasks.has(dependency), `Task ${task.id} has dangling dependency ${dependency}`);
      assert(dependency !== task.id, `Task ${task.id} depends on itself`);
    }
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id, path = []) {
    assert(!visiting.has(id), `Dependency cycle: ${[...path, id].join(' -> ')}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id).dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of plan.tasks) visit(task.id);
  for (const task of plan.tasks) {
    if (task.status === 'done') {
      for (const dependency of task.dependsOn) assert(tasks.get(dependency).status === 'done', `Done task ${task.id} has unfinished prerequisite ${dependency}`);
    }
  }
  return plan;
}

export function analyzePlan(plan) {
  validatePlan(plan);
  const byId = new Map(plan.tasks.map(task => [task.id, task]));
  const stablePath = new Set();
  function include(id) {
    if (stablePath.has(id)) return;
    stablePath.add(id);
    byId.get(id).dependsOn.forEach(include);
  }
  include(plan.stableMilestone);
  const unfinished = plan.tasks.filter(task => task.status !== 'done');
  const ready = unfinished.filter(task => task.dependsOn.every(id => byId.get(id).status === 'done'));
  const stableBlockers = unfinished.filter(task => stablePath.has(task.id) && task.id !== plan.stableMilestone);
  const activeBlocked = unfinished.filter(task => task.status === 'active' && !ready.includes(task));
  return { byId, stablePath, ready, stableBlockers, activeBlocked };
}

function escapeMarkdown(value) { return value.replace(/[\\`*_[\]<>|]/g, '\\$&'); }
function taskLink(task) { return `[\`${task.id}\`](#${task.id})`; }
function links(entries) { return entries.map(entry => `[${escapeMarkdown(entry.label)}](${entry.url})`).join('; '); }
function nodeId(id) { return `task_${id.replaceAll('-', '_')}`; }
function mermaidLabel(value) { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

/** The document is generated solely from graph.json; no clock, network, or environment-dependent output. */
export function renderPlan(plan) {
  const { byId, stablePath, ready, stableBlockers, activeBlocked } = analyzePlan(plan);
  const owners = new Map(plan.repositories.map(repository => [repository.id, repository]));
  const milestone = byId.get(plan.stableMilestone);
  const totals = [...statuses].map(status => `${plan.tasks.filter(task => task.status === status).length} ${status}`).join(', ');
  const output = [
    `# ${plan.title}`, '',
    '<!-- Generated by node scripts/work-graph.mjs write from docs/work/graph.json. Do not edit this file directly. -->', '',
    plan.description, '',
    `Updated ${plan.updatedAt}. Current development API: \`${plan.apiVersion}\`. ${plan.tasks.length} tasks: ${totals}.`, '',
    'Edit [graph.json](./graph.json), then run `npm run plan:generate` and `npm run plan:check`. IDs are stable. `dependsOn` lists prerequisites; every arrow points from prerequisite to dependent. A done task requires evidence and done prerequisites. Evidence links are reviewable records, not automatically authenticated proofs.', '',
    'No duration or monetary estimates are implied by this graph. Evaluation spending remains measured in explicit ledger units. Work can begin before all dependencies complete, but cannot be marked done before them.', '',
    '## Repository ownership', '',
    '| ID | Public repository | Responsibility |',
    '| --- | --- | --- |',
    ...plan.repositories.map(repository => `| \`${repository.id}\` | [${escapeMarkdown(repository.name)}](${repository.url}) | ${escapeMarkdown(repository.scope)} |`), '',
    'Repository URLs identify intended ownership. Publication is established by the corresponding completed task and its evidence.', '',
    '## Ready frontier', '',
    'These unfinished tasks have no unfinished prerequisites. Readiness does not imply implementation or approval of their eventual claims.', '',
    ...(ready.length ? ready.map(task => `- ${taskLink(task)} — ${escapeMarkdown(task.title)} (${task.status}; ${task.owner}).`) : ['No unfinished task is ready.']), '',
    ...(activeBlocked.length ? ['Active work still awaiting prerequisites:', '', ...activeBlocked.map(task => `- ${taskLink(task)} awaits ${task.dependsOn.filter(id => byId.get(id).status !== 'done').map(id => taskLink(byId.get(id))).join(', ')}.`), ''] : []),
    '## Minimum stable API path', '',
    `${taskLink(milestone)} is **${milestone.status === 'done' ? 'done' : stableBlockers.length ? 'blocked' : 'ready for review'}**. The required path is its transitive prerequisite closure; ${stableBlockers.length} prerequisite tasks remain unfinished. Completing this path supports API stability within its stated scope, not universal verifier validity.`, '',
    ...(stableBlockers.length ? stableBlockers.map(task => `- ${taskLink(task)} — ${task.status}.`) : ['All milestone prerequisites are done; the milestone still needs its own acceptance evidence unless already marked done.']), '',
    'Later domain and empirical work is shown separately. Those tasks do not block the minimum protocol milestone; using their results in a consequential application still requires the relevant evidence.', '',
    '## Directed dependency graph', '',
    'Green = done; blue = active; gray = planned. The upper group is the minimum stable API path; the lower group contains independent examples and later extensions.', '',
    '```mermaid', 'flowchart TD',
  ];
  for (const [name, label, predicate] of [
    ['minimum', 'Minimum stable API path', task => stablePath.has(task.id)],
    ['extensions', 'Examples and later domain or empirical work', task => !stablePath.has(task.id)],
  ]) {
    output.push(`  subgraph ${name}["${label}"]`);
    for (const task of plan.tasks.filter(predicate)) output.push(`    ${nodeId(task.id)}["${mermaidLabel(task.id)}<br/>${mermaidLabel(task.title)}"]:::${task.status}`);
    output.push('  end');
  }
  for (const task of plan.tasks) for (const dependency of task.dependsOn) output.push(`  ${nodeId(dependency)} --> ${nodeId(task.id)}`);
  output.push('  classDef done fill:#dcfce7,stroke:#15803d,color:#14532d', '  classDef active fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a', '  classDef planned fill:#f1f5f9,stroke:#64748b,color:#0f172a', '```', '', '## Task contracts', '');
  for (const task of plan.tasks) {
    const owner = owners.get(task.owner);
    output.push(`<a id="${task.id}"></a>`, `### ${task.id}: ${task.title}`, '',
      `**${task.status}** · [${escapeMarkdown(owner.name)}](${owner.url}) · ${task.track} · ${stablePath.has(task.id) ? 'minimum stable path' : 'outside minimum stable path'}`, '',
      `Prerequisites: ${task.dependsOn.length ? task.dependsOn.map(id => taskLink(byId.get(id))).join(', ') : 'none'}.`, '',
      'Acceptance criteria:', '', ...task.acceptance.map(criterion => `- ${criterion}`), '',
      `Evidence: ${task.evidence.length ? links(task.evidence) : 'not yet recorded'}.`, '');
    if (task.links.length) output.push(`Context: ${links(task.links)}.`, '');
  }
  return output.join('\n');
}

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  assert((command === 'write' || command === 'check') && extra.length === 0, 'Usage: node scripts/work-graph.mjs <write|check>');
  const plan = JSON.parse(await readFile(sourceUrl, 'utf8'));
  const generated = renderPlan(plan);
  if (command === 'write') {
    await writeFile(outputUrl, generated);
    console.log(`Generated docs/work/README.md from ${plan.tasks.length} validated tasks.`);
    return;
  }
  const current = await readFile(outputUrl, 'utf8');
  assert(current === generated, 'docs/work/README.md is out of sync; run npm run plan:generate');
  const { ready, stableBlockers } = analyzePlan(plan);
  console.log(`Work graph valid and synchronized: ${plan.tasks.length} tasks, ${ready.length} ready, ${stableBlockers.length} unfinished stable prerequisites.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
