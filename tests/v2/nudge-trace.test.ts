import { describe, expect, it } from 'vitest';
import { traceNudgePlan } from '../../src/v2/nudge-trace.js';
import type { Nudge } from '../../src/v2/types.js';
const nudge = (id: string, lower: number, upper: number, unit = 'points'): Nudge => ({ id, assertionId: 'quality', instruction: 'Change addressed record',
  changes: [{ address: 'record', variable: 'value', direction: 1 }], reads: ['record'], writes: ['record'],
  effects: [{ assertionId: 'quality', direction: 'improves', basis: 'hypothesis', evidence: [] }], netBenefit: { lower, upper, unit }, costUpperBound: { steps: 1 },
  remediation: { harnessId: 'repair', prompt: 'Repair addressed issue', verification: ['quality'] } });
const context = { artifactDigest: 'baseline', scope: 'Fixed structured record' };

describe('inspectable partial nudge resolution', () => {
  it('keeps conditional preference, deferral and required follow-up separate from authorization', () => {
    const first = nudge('better', 3, 4); const second = nudge('worse', 1, 2);
    const result = traceNudgePlan([first, second], [], context);
    expect(result.entries[0]).toMatchObject({ status: 'selected-for-consideration', preferredOver: ['worse'], remedy: { executionAuthorized: false } });
    expect(result.entries[1].status).toBe('deferred');
    expect(result.conflicts[0].requiredFollowUp.join(' ')).toMatch(/complete gate/);
    expect(result.executionAuthorized).toBe(false); expect(Object.isFrozen(first)).toBe(false);
  });
  it('explains distinct follow-up for incomparable units, overlapping bounds and absent bounds', () => {
    expect(traceNudgePlan([nudge('a', 3, 4), nudge('b', 1, 2, 'minutes')], [], context).unresolved[0].requiredFollowUp.join(' ')).toMatch(/unit conversion/);
    expect(traceNudgePlan([nudge('a', 1, 4), nudge('b', 2, 5)], [], context).unresolved[0].requiredFollowUp.join(' ')).toMatch(/narrowing/);
    const missing = nudge('b', 0, 0); delete missing.netBenefit;
    expect(traceNudgePlan([nudge('a', 1, 2), missing], [], context).unresolved[0].requiredFollowUp.join(' ')).toMatch(/justified net-benefit bounds/);
  });
  it('records protected regressions even when interval benefit is higher', () => {
    const value = nudge('risky', 100, 101); value.effects.push({ assertionId: 'safety', direction: 'worsens', basis: 'observed', evidence: ['outcome'] });
    const result = traceNudgePlan([value], ['safety'], context);
    expect(result.entries[0].status).toBe('deferred');
    expect(result.entries[0].requiredFollowUp.join(' ')).toMatch(/protected objectives/);
  });
  it('never upgrades evidence strings to identified causality', () => {
    const value = nudge('a', 1, 2); value.effects[0] = { assertionId: 'quality', direction: 'improves', basis: 'observed', evidence: ['correlation'] };
    const result = traceNudgePlan([value], [], context);
    expect(result.entries[0].claimedEffects[0]).toMatchObject({ basis: 'observed', verifiedByPlanner: false });
    expect(result.entries[0].requiredFollowUp.join(' ')).toMatch(/identification design/);
    value.effects[0] = { ...value.effects[0], basis: 'identified', evidence: [] };
    expect(() => traceNudgePlan([value], [], context)).toThrow(/needs evidence/);
  });
});
