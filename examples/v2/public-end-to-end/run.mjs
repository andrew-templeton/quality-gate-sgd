import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const inputs = process.argv.slice(2);
if (inputs.length !== 5) throw new Error('Usage: node run.mjs <core.tgz> <isogloss.tgz> <software.tgz> <sonar.tgz> <new-output-directory>');
const requestedOutputDir = resolve(inputs[4]); await mkdir(requestedOutputDir, { recursive: false });
const outputDir = await realpath(requestedOutputDir);
const consumer = join(outputDir, 'consumer'), packagesDir = join(outputDir, 'packages');
await mkdir(consumer); await mkdir(packagesDir);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const commands = [];
const run = (command, args, cwd, timeoutMs = 180000) => new Promise((resolveRun, reject) => {
  const start = performance.now(); const entry = { command, args, cwd: relative(outputDir, cwd) || '.', timeoutMs };
  commands.push(entry);
  const child = spawn(command, args, { cwd, env: { ...process.env, QUALITY_SGD_ISOGLOSS_ENTRY: '', QUALITY_SGD_HOST: '', NODE_PATH: '' }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', overflow = false, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
  const append = (kind, bytes) => {
    if (stdout.length + stderr.length + bytes.length > 16 * 1024 * 1024) { overflow = true; child.kill('SIGKILL'); return; }
    if (kind === 'stdout') stdout += bytes; else stderr += bytes;
  };
  child.stdout.on('data', bytes => append('stdout', bytes)); child.stderr.on('data', bytes => append('stderr', bytes));
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', (code, signal) => {
    clearTimeout(timer); Object.assign(entry, { code, signal, elapsedMilliseconds: performance.now() - start, stdoutDigest: hash(stdout), stderrDigest: hash(stderr), overflow, timedOut });
    if (code !== 0 || signal || overflow || timedOut) reject(new Error(`${command} failed (${code ?? signal}): ${stderr.slice(-10000)}`));
    else resolveRun({ stdout, stderr });
  });
});

try {
  const names = ['quality-gate-sgd', 'isogloss', 'quality-sgd-software', 'quality-sgd-sonarqube'];
  const sources = [];
  for (let index = 0; index < names.length; index++) {
    const original = await realpath(resolve(inputs[index])); const bytes = await readFile(original);
    const filename = `${names[index]}.tgz`; await copyFile(original, join(packagesDir, filename));
    sources.push({ name: names[index], suppliedFilename: basename(original), tarballSha256: hash(bytes), installedFrom: `../packages/${filename}` });
  }
  await writeFile(join(consumer, 'package.json'), `${JSON.stringify({ name: 'quality-sgd-public-end-to-end-consumer', private: true, type: 'module' }, null, 2)}\n`);
  const installation = await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...sources.map(source => source.installedFrom), 'playwright@1.63.0', 'eslint@9.39.2', 'typescript@5.9.3'], consumer);
  await writeFile(join(outputDir, 'install.log'), installation.stdout + installation.stderr);
  for (const source of sources) {
    const installedRoot = join(consumer, 'node_modules', source.name);
    assert.equal(await realpath(installedRoot), installedRoot, 'Installed packages must be materialized from tarballs, not linked to checkouts');
    const metadata = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
    assert.equal(metadata.name, source.name); source.version = metadata.version; source.repository = metadata.repository?.url ?? null;
  }
  const coreRoot = join(consumer, 'node_modules', 'quality-gate-sgd');
  const runtimeNames = ['contracts', 'validation', 'catalog', 'evaluate', 'budget', 'decision', 'nudges', 'nudge-trace', 'finite-calibration', 'calibration', 'admission', 'loop', 'remediation', 'durability'];
  const runtimeManifest = Object.fromEntries(await Promise.all(runtimeNames.map(async name => [name, hash(await readFile(join(coreRoot, 'dist', 'v2', `${name}.js`)))])));
  Object.assign(runtimeManifest, { algorithm: 'sha256-file-bytes', packages: sources, node: process.version });
  const examples = join(consumer, 'examples'); await mkdir(examples);
  const sourceFiles = [];
  const copy = async (source, target, origin) => {
    const bytes = await readFile(source); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    sourceFiles.push({ path: relative(consumer, target), sha256: hash(bytes), origin });
  };
  await copy(join(coreRoot, 'examples/v2/workflow-consumer.mjs'), join(examples, 'workflow-consumer.mjs'), 'installed-core-tarball');
  for (const name of ['run.mjs', 'worker.mjs']) await copy(join(coreRoot, 'examples/v2/repair-validation', name), join(examples, 'repair-validation', name), 'installed-core-tarball');
  for (const name of ['collector.mjs', 'measure.mjs', 'fixture.mjs', 'run.mjs', 'composition.mjs', 'communication-source.mjs', 'package-lock.json']) await copy(join(coreRoot, 'examples/v2/rendered', name), join(examples, 'rendered', name), 'installed-core-tarball');
  for (const name of ['program.mjs', 'protocol.json']) await copy(join(coreRoot, 'examples/v2/decision-program', name), join(examples, 'decision-program', name), 'installed-core-tarball');
  // The reproducible orchestration bundle can be distributed independently of the four tested packages.
  const bundle = dirname(fileURLToPath(import.meta.url));
  for (const name of ['installed.mjs', 'durable.mjs', 'durable-worker.mjs', 'patch-worker.mjs', 'finite.mjs', 'sonar.mjs']) await copy(join(bundle, name), join(examples, 'public-end-to-end', name), 'public-orchestration-bundle');
  await writeFile(join(consumer, 'runtime-manifest.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  await writeFile(join(outputDir, 'inputs.json'), `${JSON.stringify({ sources, runtimeManifest, sourceFiles, orchestrationBootstrapSha256: hash(await readFile(fileURLToPath(import.meta.url))), installLockSha256: hash(await readFile(join(consumer, 'package-lock.json'))) }, null, 2)}\n`);
  await run(process.execPath, ['node_modules/playwright/cli.js', 'install', 'chromium'], consumer);
  const result = await run(process.execPath, ['examples/public-end-to-end/installed.mjs', outputDir], consumer, 300000);
  await writeFile(join(outputDir, 'run.log'), result.stdout + result.stderr);
  const report = JSON.parse(await readFile(join(outputDir, 'report.json'), 'utf8'));
  assert.equal(report.status, 'pass');
  await writeFile(join(outputDir, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, outputDir, sources: sources.map(({ name, version, tarballSha256 }) => ({ name, version, tarballSha256 })), scopes: report.scopes, durable: report.durable.after, rendered: report.rendered.comparisons, commands: 'commands.json' }, null, 2));
} catch (error) {
  await writeFile(join(outputDir, 'failure.json'), `${JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error), commands }, null, 2)}\n`);
  throw error;
}
