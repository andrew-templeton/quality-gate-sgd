#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tarballs = process.argv.slice(2);
if (tarballs.length !== 3) throw new Error('Usage: node examples/v2/check-workflow-packages.mjs <core.tgz> <isogloss.tgz> <software.tgz>');
const consumer = await mkdtemp(join(tmpdir(), 'quality-workflow-installed-'));
try {
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'quality-workflow-independent-consumer', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs.map(path => resolve(path))], { cwd: consumer, stdio: 'pipe' });
  await writeFile(join(consumer, 'workflow.mjs'), await readFile(new URL('./workflow-consumer.mjs', import.meta.url), 'utf8'));
  execFileSync(process.execPath, ['workflow.mjs'], { cwd: consumer, stdio: 'inherit' });
} finally { await rm(consumer, { recursive: true, force: true }); }
