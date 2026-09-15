import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  assert.equal(Object.keys(manifest[field] ?? {}).length, 0, `Core ${field} must not install a domain verifier`);
}
assert.deepEqual(manifest.bin, { 'quality-gate-v2': './dist/v2/cli.js' });
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
for (const { path } of pack.files) {
  if (path.startsWith('dist/')) {
    assert.match(path, /^dist\/(?:index\.(?:js|js\.map|d\.ts|d\.ts\.map)|v2\/[a-z-]+\.(?:js|js\.map|d\.ts|d\.ts\.map))$/, `Unexpected runtime file: ${path}`);
  }
  assert.ok(!/^(?:python|templates|node_modules|data)\//.test(path), `Domain asset leaked into core: ${path}`);
}
for (const required of ['dist/index.js', 'dist/v2/cli.js', 'docs/work/graph.json', 'docs/work/README.md', 'docs/v2/MIGRATION.md']) {
  assert.ok(pack.files.some(file => file.path === required), `Missing package file: ${required}`);
}
const core = await import(new URL('../dist/index.js', import.meta.url));
for (const name of ['compileGate', 'BudgetLedger', 'runQualityLoop', 'readResource']) {
  assert.equal(typeof core[name], 'function', `Missing core export ${name}`);
  assert.equal(core[name], core.v2[name], `Root and v2 namespace disagree: ${name}`);
}
for (const name of ['extractTypescriptMetrics', 'extractEslintMetrics', 'evaluateRules', 'sonarqubeModule', 'sonarNudges', 'isoglossModule']) {
  assert.ok(!(name in core) && !(name in core.v2), `External implementation remains exported: ${name}`);
}
console.log(`Package boundary passed: ${pack.files.length} files; no software runtime, domain dependency or obsolete CLI.`);
