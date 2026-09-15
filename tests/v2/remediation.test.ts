import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetLedger } from '../../src/v2/budget.js';
import { commandHarness, executeRemediation } from '../../src/v2/remediation.js';
import type { RemediationRequest } from '../../src/v2/remediation.js';
import type { Artifact, Nudge } from '../../src/v2/types.js';
import { digest } from '../../src/v2/validation.js';

const artifact = (value: unknown): Artifact => ({ id: 'fixture', digest: digest(value), data: value });
const nudge = (): Nudge => ({ id: 'repair', assertionId: 'syntax', instruction: 'Repair the addressed expression.',
  changes: [], reads: ['file.ts'], writes: ['file.ts'], effects: [], costUpperBound: { tokens: 3 },
  remediation: { harnessId: 'repairer', prompt: 'Quoted diagnostic: $(do-not-execute) `also-literal`', verification: ['syntax'] } });
const request = (): Omit<RemediationRequest, 'signal'> => ({ artifact: artifact({ valid: false }), environmentDigest: 'environment', nudge: nudge() });
const directories: string[] = [];
const workspace = async (): Promise<string> => { const path = await mkdtemp(join(tmpdir(), 'quality-sgd-repair-')); directories.push(path); return path; };
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('explicit, budgeted remediation', () => {
  it('never runs a registered harness until its ID is explicitly enabled', async () => {
    const run = vi.fn(); const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', run }], budget, reservationId: 'repair:1' });
    expect(result.status).toBe('disabled'); expect(run).not.toHaveBeenCalled(); expect(budget.snapshot().spent).toEqual({});
  });

  it('reserves the declared bound before invoking work and settles actual units', async () => {
    const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run() {
      expect(budget.snapshot().reserved).toEqual({ tokens: 3 });
      return { artifact: artifact({ valid: true }), actualCost: { tokens: 2 } };
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(result.status).toBe('candidate'); expect(budget.snapshot().spent).toEqual({ tokens: 2 }); expect(budget.snapshot().reserved).toEqual({});
  });

  it('cannot dispatch unaffordable repair work', async () => {
    const run = vi.fn(); const budget = new BudgetLedger({ tokens: 2 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', run }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(result.status).toBe('budget'); expect(run).not.toHaveBeenCalled();
  });

  it('charges failed work and quarantines further spending', async () => {
    const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run() { throw new Error('repair failed'); } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(result).toMatchObject({ status: 'unavailable', actualCost: { tokens: 3 } });
    expect(budget.snapshot()).toMatchObject({ spent: { tokens: 3 }, reserved: {}, exceeded: true });
    expect(budget.reserve('next', { tokens: 1 })).toBe(false);
  });

  it('retains known excess spend when a cost report also contains an undeclared unit', async () => {
    const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run() {
      return { artifact: artifact(true), actualCost: { tokens: 8, unknown: 2 } };
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(result).toMatchObject({ status: 'unavailable', actualCost: { tokens: 8, unknown: 2 } });
    expect(budget.snapshot()).toMatchObject({ spent: { tokens: 8, unknown: 2 }, exceeded: true });
  });

  it('does not admit an otherwise valid candidate after a cost overrun', async () => {
    const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run() {
      return { artifact: artifact(true), actualCost: { tokens: 4 } };
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(result.status).toBe('budget'); expect(budget.snapshot().spent).toEqual({ tokens: 4 });
  });

  it('aborts a timed out harness and charges the reservation', async () => {
    const budget = new BudgetLedger({ tokens: 10 }); let aborted = false;
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run(context) {
      return new Promise((_resolve, reject) => context.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1', timeoutMs: 10 });
    expect(result.status).toBe('unavailable'); expect(aborted).toBe(true); expect(budget.snapshot().spent).toEqual({ tokens: 3 });
  });

  it('passes a snapshot to callbacks so mutation cannot change the accepted input', async () => {
    const input = request(); const budget = new BudgetLedger({ tokens: 10 });
    await executeRemediation({ request: input, harnesses: [{ id: 'repairer', async run(context) {
      (context.artifact.data as { valid: boolean }).valid = true;
      return { artifact: artifact(context.artifact.data), actualCost: { tokens: 1 } };
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    expect(input.artifact.data).toEqual({ valid: false });
  });

  it('snapshots a returned candidate before its producer can later mutate it', async () => {
    const candidate = artifact({ valid: true }); const budget = new BudgetLedger({ tokens: 10 });
    const result = await executeRemediation({ request: request(), harnesses: [{ id: 'repairer', async run() {
      return { artifact: candidate, actualCost: { tokens: 1 } };
    } }], enabledHarnessIds: ['repairer'], budget, reservationId: 'repair:1' });
    (candidate.data as { valid: boolean }).valid = false;
    expect(result.status).toBe('candidate');
    if (result.status === 'candidate') expect(result.artifact.data).toEqual({ valid: true });
  });
});

describe('bounded command adapter', () => {
  it('sends literal prompt text over stdin with no shell interpolation', async () => {
    const harness = commandHarness({ id: 'repairer', command: process.execPath,
      args: ['-e', 'let s=""; process.stdin.setEncoding("utf8"); process.stdin.on("data",x=>s+=x); process.stdin.on("end",()=>process.stdout.write(s));'],
      timeoutMs: 2_000, maxOutputBytes: 1_024,
      toArtifact: result => artifact(result.stdout),
    });
    const input = { ...request(), candidateWorkspace: await workspace() };
    const result = await executeRemediation({ request: input, harnesses: [harness], enabledHarnessIds: ['repairer'], budget: new BudgetLedger({ tokens: 10 }), reservationId: 'command:1', timeoutMs: 3_000 });
    expect(result.status).toBe('candidate');
    if (result.status === 'candidate') expect(result.artifact.data).toBe(input.nudge.remediation?.prompt);
    expect(result.actualCost).toEqual({ tokens: 3 });
  });

  it('requires the caller to supply an absolute candidate checkout', async () => {
    const harness = commandHarness({ id: 'repairer', command: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 100, maxOutputBytes: 100, toArtifact: () => artifact(true) });
    await expect(harness.run({ ...request(), signal: new AbortController().signal })).rejects.toThrow('isolated candidate workspace');
  });

  it('kills a command whose combined output exceeds the bound', async () => {
    const harness = commandHarness({ id: 'repairer', command: process.execPath,
      args: ['-e', 'process.stdin.resume(); process.stdout.write("x".repeat(4096)); setInterval(()=>{},1000);'],
      timeoutMs: 2_000, maxOutputBytes: 100, toArtifact: () => artifact(true) });
    await expect(harness.run({ ...request(), candidateWorkspace: await workspace(), signal: new AbortController().signal })).rejects.toThrow('output bound');
  });

  it('kills a command at its own deadline', async () => {
    const harness = commandHarness({ id: 'repairer', command: process.execPath,
      args: ['-e', 'process.stdin.resume(); setInterval(()=>{},1000);'], timeoutMs: 50, maxOutputBytes: 100, toArtifact: () => artifact(true) });
    await expect(harness.run({ ...request(), candidateWorkspace: await workspace(), signal: new AbortController().signal })).rejects.toThrow('timeout');
  });

  it('rejects permission bypass arguments', () => {
    expect(() => commandHarness({ id: 'repairer', command: 'claude', args: ['--dangerously-skip-permissions'], timeoutMs: 100, maxOutputBytes: 100, toArtifact: () => artifact(true) })).toThrow('Permission bypass');
  });

  it('snapshots argument and environment configuration before later caller mutation', async () => {
    const args = ['-e', 'process.stdin.resume(); process.stdin.on("end",()=>process.stdout.write(process.env.QUALITY_SGD_FIXTURE ?? "missing"));'];
    const env = { QUALITY_SGD_FIXTURE: 'original' };
    const harness = commandHarness({ id: 'repairer', command: process.execPath, args, env, timeoutMs: 2_000, maxOutputBytes: 100, toArtifact: result => artifact(result.stdout) });
    args.splice(0, args.length, '--definitely-not-valid'); env.QUALITY_SGD_FIXTURE = 'mutated';
    const result = await harness.run({ ...request(), candidateWorkspace: await workspace(), signal: new AbortController().signal });
    expect(result.artifact.data).toBe('original');
  });
});
