import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [core, software, evidence] = process.argv.slice(2);
if (!core || !software) throw new Error('Usage: node check-packages.mjs <core.tgz> <software.tgz> [evidence.json]');
const directory = await mkdtemp(join(tmpdir(), 'quality-repair-installed-'));
try {
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(core), resolve(software), 'eslint@9.39.2'], { cwd: directory, stdio: 'pipe' });
  for (const name of ['run.mjs', 'worker.mjs']) await writeFile(join(directory, name), await readFile(new URL(name, import.meta.url)));
  execFileSync(process.execPath, ['run.mjs', ...(evidence ? [resolve(evidence)] : [])], { cwd: directory, stdio: 'inherit' });
} finally { await rm(directory, { recursive: true, force: true }); }
