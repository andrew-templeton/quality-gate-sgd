# Durable execution and recovery

`DurableRun` provides a local, single-writer journal for the vector budget and improvement loop. It persists reservations, operation outcomes, accepted artifacts and evaluations, attempted candidates, admission history, round/stall counters, and ordered events. Reopening a run uses its original budget; supplying larger limits is rejected.

```ts
import { DurableRun, runQualityLoop } from 'quality-gate-sgd';

const run = DurableRun.open({
  path: '/absolute/run-directory/checkpoint.json',
  contractDigest: gate.digest,
  environmentDigest,
  limits: { tokens: 50_000, evaluations: 100, dollars: 5 },
});
try {
  const result = await runQualityLoop({
    ...loopOptions,
    gate,
    environmentDigest,
    budget: run.budget,
    durability: run,
    executionIdentity: {
      proposal: 'proposer-build-and-rubric-digest',
      repair: 'repairer-build-and-configuration-digest',
      workspace: 'workspace-preparation-build-digest',
    },
  });
} finally {
  run.close();
}
```

The proposer, repairer and workspace identities are caller declarations, analogous to assertion implementation identities. Change them when their code, model, prompt or semantic configuration changes. A digest does not attest that a callback is honest or free of undeclared mutable dependencies. Runtime input declarations in `available` are bound to the loop settings and are preserved for baseline and candidate evaluation.

## Persisted boundaries

Each paid assertion, proposal or repair uses a stable operation ID containing the run ID, baseline epoch and request identity. The journal persists:

1. The upper-bound reservation before external work.
2. A prepared operation with its request digest.
3. Dispatch intent before invoking the callback.
4. The returned outcome before settlement.
5. Settlement before advancing the loop checkpoint.

A prepared operation can continue because external dispatch has not begun. A completed operation returns its saved outcome, and repeated settlement of that same cost is idempotent. Changing an operation's request or reservation bound while reusing its ID is rejected. Proposers and repair harnesses receive `operationId`; forward it to external services that support idempotency keys.

Loop checkpoints distinguish baseline evaluation, the next round, proposal, plan, repair, candidate evaluation, admission, and terminal results. A crash between individual checks replays completed observations and continues the incomplete evaluation. A crash after admission restores the updated accepted artifact, reversal history, accepted/rejected attempts and stall count. A terminal resume returns the recorded result without spending again. The independent round limit, required gate, improvement margins, enabled harnesses, timeouts, input declarations and execution identities cannot change silently during resume.

The loop performs one intervention per round. Its deadbands, reversal cooldown, larger reversal margin, previously accepted/rejected candidate detection, and consecutive-stall limit still apply after recovery. These controls do not establish convergence or global optimality.

## Unknown external outcomes

A process can die after a service receives a request and before the result reaches the journal. A timeout or cancellation also cannot establish that the service consumed no resources. Such an operation stays reserved and throws `ReconciliationRequired`. Repeated resume does not invoke it again.

After independently recovering a receipt by operation ID, record the returned output and provenance:

```ts
run.reconcileOperation(operationId, {
  outcome: recoveredOutput,
  evidence: 'Provider receipt / job ID / artifact and metering record',
});
// runQualityLoop with the same settings now consumes the recorded outcome.
```

The supplied outcome still passes the normal assertion/repair output validation and complete candidate verification. The engine does not treat a reconciliation note as authentication of the receipt. The caller owns provenance and must recover both outcome and actual cost; a preference or model judgment cannot establish an unobserved external result.

When an outcome cannot be recovered, `run.abandonOperation(id, evidence)` charges the full reserved amount and records abandonment. It never grants permission to retry that operation. Inspect the run and either terminate it or explicitly rebaseline. A timeout can leave a remote operation running; reconciliation must account for this before starting another epoch.

`run.rebaseline({ contractDigest, environmentDigest, reason })` archives the previous checkpoint and identities, starts a new comparison epoch, and retains every previous expenditure and reservation tombstone. Unknown or outstanding work must first be reconciled or conservatively charged. This deliberately resets comparison history under an explicit new baseline while preserving the old history in the archive; it does not carry incomparable loss measurements forward or grant a new budget.

## Storage and writer guarantees

The implementation writes a complete versioned journal to a temporary file, fsyncs it, atomically renames it, and fsyncs the containing directory before permitting the next external operation. It acquires an exclusive lock file for the lifetime of the writer and verifies ownership before each write. A persistence failure poisons the handle and stops dispatch; reopen the persisted journal to establish what survived.

The supported scope is one process writer on a local POSIX filesystem with atomic rename and file/directory fsync. This is not a distributed lock or a claim about network filesystems, object storage, arbitrary disk firmware, host loss, or malicious modification. Keep the entire run directory on durable storage and back it up according to application requirements. The checksum detects accidental content corruption; it is not a signature or an anti-rollback service. Restoring an old backup is not a safe way to refund later external spending.

A crashed writer leaves its lock. Reopen with `recoverAbandonedLock: true` only when recovery is intended: the implementation permits this only for a demonstrably dead PID on the same host. It refuses a live PID, permission-denied PID check, remote host, or malformed lock. A separate exclusive recovery lock serializes contenders. For ambiguous storage/host recovery, inspect external work and obtain exclusive ownership before manually repairing storage; the library does not guess.

`BudgetLedger.exportState()` and `BudgetLedger.restore()` are also usable independently. Their versioned state includes limits, total spent units, all outstanding reservation IDs, and settled/charged/failed tombstones. Restoration recomputes expenditure and overrun status and rejects missing, duplicate, inconsistent or unaffordable records. Unknown work stays reserved; missing measurements cannot silently refund it. Plain in-memory ledgers retain duplicate outstanding-reservation protection and do not provide crash safety without a synchronous durable persistence owner.

## Acceptance evidence

`tests/v2/durable-ledger.test.ts` checks accounting restoration, inconsistent snapshots, unknown expenditure, repeat settlement, request collisions, writer exclusion, explicit reconciliation and charged rebaselining.

`tests/v2/durable-loop.test.ts` launches separate Node processes and kills them with SIGKILL after reservation, prepared operation, recorded outcome, settlement, candidate creation, candidate evaluation and admission boundaries. It also kills a process after the external repair record is durable but before the journal has its result, verifies that repeated resume remains blocked, and resumes through an independently recovered fixture receipt.

The deterministic six-round scenario independently records every evaluation, proposal and repair in a fsynced external record. It compares journal expenditure in **evaluations, tokens, cents and rounds** against that record, checks no duplicate operation/artifact evaluations, and exercises a rejected deadband step, an interrupted reversal cooldown, a later admissible reversal, a required-behavior regression and a final admitted repair. Additional resumed scenarios exhaust the stall window, repeat a rejected candidate and exhaust the evaluation budget. These fixtures validate execution and accounting guarantees, not the quality of a real model or application-specific verifier.
