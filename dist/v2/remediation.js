import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { validateNudge } from './nudges.js';
import { digest, requireThat, text, unique } from './validation.js';
/** Produce an isolated candidate only; the complete gate still has to evaluate and admit it. */
export async function executeRemediation(options) {
    const { request, budget } = options;
    validateNudge(request.nudge);
    unique(options.harnesses.map(harness => harness.id), 'Harness IDs');
    unique([...(options.enabledHarnessIds ?? [])], 'Enabled harness IDs');
    const harnessId = options.harnessId ?? request.nudge.remediation?.harnessId;
    if (!harnessId || !(options.enabledHarnessIds ?? []).includes(harnessId))
        return { status: 'disabled', reason: 'No explicitly enabled repair harness', actualCost: {} };
    const harness = options.harnesses.find(entry => entry.id === harnessId);
    if (!harness)
        return { status: 'unavailable', reason: `Enabled harness is not registered: ${harnessId}`, actualCost: {} };
    const timeoutMs = options.timeoutMs ?? 60_000;
    requireThat(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647, 'Invalid remediation timeout');
    text(request.artifact.id, 'Artifact ID');
    text(request.artifact.digest, 'Artifact digest');
    text(request.environmentDigest, 'Environment digest');
    if (!budget.reserve(options.reservationId, request.nudge.costUpperBound))
        return { status: 'budget', reason: 'Repair budget unavailable or a prior cost bound was exceeded', actualCost: {} };
    const controller = new AbortController();
    const spentBefore = budget.snapshot().spent;
    const charged = () => Object.fromEntries(Object.entries(budget.snapshot().spent).map(([unit, amount]) => [unit, amount - (Object.hasOwn(spentBefore, unit) ? spentBefore[unit] : 0)]).filter(([, amount]) => amount !== 0));
    let timer;
    let settled = false;
    let output;
    try {
        output = await Promise.race([
            Promise.resolve().then(() => harness.run({ ...structuredClone(request), signal: controller.signal })),
            new Promise((_, reject) => {
                timer = setTimeout(() => { controller.abort(); reject(new Error('Remediation timeout; candidate was not evaluated or admitted')); }, timeoutMs);
            }),
        ]);
        output = structuredClone(output);
        // Meter before validating the artifact: malformed output still consumed the reported work.
        budget.settle(options.reservationId, output.actualCost);
        settled = true;
        text(output.artifact.id, 'Candidate ID');
        text(output.artifact.digest, 'Candidate digest');
        digest(output.artifact.data); // Reject values that cannot be bound to the evaluation identity.
        if (budget.snapshot().exceeded)
            return { status: 'budget', reason: 'Repair exceeded its reserved cost; candidate was not admitted', actualCost: output.actualCost };
        return { status: 'candidate', artifact: output.artifact, actualCost: output.actualCost };
    }
    catch (error) {
        if (!settled)
            budget.failReservation(options.reservationId, output?.actualCost);
        return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error), actualCost: charged() };
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/**
 * shell:false; prompts travel through stdin and never become command arguments.
 * The caller prepares a fresh isolated checkout for EACH attempt and owns cleanup.
 * This adapter is process control, not an OS sandbox: command permissions remain the caller's.
 * On POSIX, abort/timeout/output overflow kills the process group. Windows kills only the child.
 */
export function commandHarness(options) {
    text(options.id, 'Harness ID');
    text(options.command, 'Harness command');
    requireThat(Array.isArray(options.args) && options.args.every(arg => typeof arg === 'string'), 'Harness arguments must be an array of strings');
    options = { ...options, args: [...options.args], ...(options.env ? { env: { ...options.env } } : {}) };
    requireThat(Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 && options.timeoutMs <= 2_147_483_647, 'Invalid command timeout');
    requireThat(Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0, 'Command output bound must be a positive safe integer');
    requireThat(!options.args.some((arg, index) => /^--(?:allow-)?dangerously-skip-permissions(?:=|$)/.test(arg)
        || /^--permission-mode=bypassPermissions$/.test(arg)
        || (arg === '--permission-mode' && options.args[index + 1] === 'bypassPermissions')), 'Permission bypass flags are not supported');
    return { id: options.id, async run(request) {
            requireThat(typeof request.candidateWorkspace === 'string' && isAbsolute(request.candidateWorkspace), 'An absolute isolated candidate workspace is required');
            requireThat(!request.signal.aborted, 'Remediation was cancelled before launch');
            const prompt = options.prompt?.(request) ?? request.nudge.remediation?.prompt ?? request.nudge.instruction;
            text(prompt, 'Remediation prompt');
            const result = await new Promise((resolve, reject) => {
                const child = spawn(options.command, [...options.args], {
                    cwd: request.candidateWorkspace, env: options.env, shell: false,
                    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
                });
                const stdout = [];
                const stderr = [];
                let bytes = 0;
                let failure;
                const kill = (message) => {
                    failure ??= new Error(message);
                    if (child.pid) {
                        try {
                            if (process.platform !== 'win32')
                                process.kill(-child.pid, 'SIGKILL');
                            else
                                child.kill('SIGKILL');
                        }
                        catch {
                            child.kill('SIGKILL');
                        }
                    }
                };
                const aborted = () => kill('Remediation command cancelled');
                request.signal.addEventListener('abort', aborted, { once: true });
                const timer = setTimeout(() => kill('Remediation command timeout'), options.timeoutMs);
                const append = (channel, chunk) => {
                    if (failure)
                        return;
                    bytes += chunk.byteLength;
                    if (bytes > options.maxOutputBytes) {
                        kill('Remediation command exceeded its output bound');
                        return;
                    }
                    if (channel === 'stdout')
                        stdout.push(chunk);
                    else
                        stderr.push(chunk);
                };
                child.stdout.on('data', (chunk) => append('stdout', chunk));
                child.stderr.on('data', (chunk) => append('stderr', chunk));
                child.stdin.on('error', error => kill(`Remediation stdin failed: ${error.message}`));
                child.on('error', error => { failure ??= error; });
                child.on('close', (code, signal) => {
                    clearTimeout(timer);
                    request.signal.removeEventListener('abort', aborted);
                    if (failure)
                        reject(failure);
                    else if (code !== 0)
                        reject(new Error(`Remediation command exited with ${code === null ? signal : code}`));
                    else
                        resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
                });
                if (request.signal.aborted)
                    aborted();
                else
                    child.stdin.end(prompt);
            });
            const actualCost = options.actualCost?.(result, request) ?? { ...request.nudge.costUpperBound };
            return { artifact: await options.toArtifact(result, request), actualCost };
        } };
}
//# sourceMappingURL=remediation.js.map