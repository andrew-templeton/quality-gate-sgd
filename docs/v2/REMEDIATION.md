# Optional remediation and bounded iteration

A remediation prompt describes a proposed intervention. Its presence in an assertion card or nudge does not authorize execution and does not establish that the intervention works. Register a harness, explicitly enable its ID, and let the entire compiled gate evaluate the resulting candidate before admission.

The loop uses one `BudgetLedger` for baseline checks, proposal generation, workspace preparation and repair, and candidate checks. Each phase reserves its declared upper bound before work. Unknown or malformed metering charges at least that reservation, retains any known larger expenditure, and disables further dispatch. Tokens, dollars, evaluations, and other units remain separate budgets; the engine does not invent conversions.

## Run the loop with an injected generator

This small example assumes the application has already compiled `gate`, captured `baseline`, and implemented `proposeNudges` and `generateCandidate`. Both callbacks return actual costs in the same units they reserve. Supplying `candidateGenerator` explicitly enables that callback; it does not enable any registered external harness.

```ts
import { BudgetLedger, runQualityLoop } from '../../src/v2/index.js';

const result = await runQualityLoop({
  gate,
  artifact: baseline,
  environmentDigest, // source commitments, audience, policy, render states, environment
  budget: new BudgetLedger({ evaluations: 40, tokens: 12_000 }),
  admission: {
    gate: gate.policy,
    objectives: { 'render.fold-budget': 0 },
    reversalMultiplier: 2,
    cooldownRounds: 2,
    maxStalledRounds: 2,
  },
  maxRounds: 4,
  proposalCostUpperBound: { tokens: 1_000 },
  propose: proposeNudges, // -> { nudges, actualCost: { tokens: ... } }
  candidateGenerator: generateCandidate, // -> { artifact, actualCost: { tokens: ... } }
  evaluationTimeoutMs: 30_000,
  proposalTimeoutMs: 30_000,
  repairTimeoutMs: 60_000,
});

console.log(result.stopReason, result.budget.spent, result.events);
// result.artifact is the last admitted artifact. Publishing is a separate application action.
```

Every proposed nudge carries its own repair `costUpperBound`, explicit read/write footprint, and addressed changes. The generator receives the chosen nudge and an `AbortSignal`. It must honor cancellation and produce a new artifact identity from the actual content and its transitive dependencies.

The loop performs one conflict-resolved intervention per round, then re-plans using the observed result. An unavailable prerequisite remains incomplete; a dependent that is merely blocked by a measured failing prerequisite can become evaluable after that prerequisite is repaired. Required regressions, incompatible contracts, and missing comparison evidence prevent admission. An unavailable advisory result remains visible in the evaluation but does not block a required-gate pass unless it is also a configured improvement objective. Budget quarantine applies to the whole run.

By default, the loop stops when the required subset passes. Set `stopOnGatePass: false` to continue objective improvement within the remaining budget and round limit. Other stop reasons are `stalled`, `cycle`, `incomplete`, `budget`, and `round-limit`. A plateau or exhausted budget is never reported as a pass.

## Opt into a command harness

The command adapter accepts an executable and an argument array, invokes no shell, and sends the prompt through stdin. This example uses Claude Code's noninteractive `--print` mode without adding a model choice or changing its normal permission behavior. It does not execute until its ID is also enabled in the loop.

```ts
import { commandHarness, runQualityLoop } from '../../src/v2/index.js';

const claudeCode = commandHarness({
  id: 'claude-code',
  command: 'claude',
  args: ['--print'],
  timeoutMs: 90_000,
  maxOutputBytes: 256_000, // stdout and stderr combined
  // Defaults to nudge.remediation.prompt, or nudge.instruction.
  toArtifact: async (_output, request) =>
    captureArtifactFromCheckout(request.candidateWorkspace!),
  // Omit actualCost when reliable metering is unavailable: charge the full reservation.
});

const result = await runQualityLoop({
  ...loopOptions,
  candidateGenerator: undefined,
  harnesses: [claudeCode],
  enabledHarnessIds: ['claude-code'],
  repairTimeoutMs: 100_000, // also covers workspace preparation and artifact capture
  prepareWorkspace: async ({ artifact, round, signal }) =>
    prepareDisposableCheckout({ artifact, round, signal }),
});
```

`prepareDisposableCheckout` and `captureArtifactFromCheckout` are application adapters, not built-in functions. The former must create a fresh isolated checkout for each attempt, populated from the current accepted artifact. The latter must capture the changed files, refresh all applicable scan/render inputs, and compute their real digest. The caller owns cleanup. Do not run the command against a live or shared working tree.

With `enabledHarnessIds` omitted, the loop returns the proposed plan in its events and stops without preparing a workspace or launching a process. If a harness requires permissions or credentials that are unavailable, its failure remains a failed attempt; the adapter supplies no permission bypass flags.

## Process and evidence limits

- The command timeout and combined output bound kill the process group on POSIX. On Windows, only the direct child is killed. This is process control, not an OS sandbox; the executable has the caller's ambient permissions.
- The outer deadline also covers a supplied generator or workspace callback. Arbitrary JavaScript must cooperate with `AbortSignal`; the engine cannot forcibly stop a callback that ignores it. No more work is dispatched after a timed-out phase.
- Input objects passed to proposal and repair callbacks are snapshots. A candidate is not accepted merely because a harness reports success or returns fewer issues. The complete selected assertion closure must run, and the admission policy must establish the required repair or robust improvement.
- The nudge's suggested verification list is context for its repair harness. It cannot shrink the compiled gate or replace required tests.
- Artifact identity and isolated workspace preparation are surface-adapter responsibilities. This layer neither authenticates a caller-supplied digest nor automatically commits, deploys, or publishes an artifact.
