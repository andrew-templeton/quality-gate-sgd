import { beforeAll, describe, expect, it } from 'vitest';
import * as contracts from '../../src/v2/contracts.js';
import * as validation from '../../src/v2/validation.js';
import * as catalog from '../../src/v2/catalog.js';
import * as evaluate from '../../src/v2/evaluate.js';
import * as budget from '../../src/v2/budget.js';
import * as decision from '../../src/v2/decision.js';
import * as nudges from '../../src/v2/nudges.js';
import * as trace from '../../src/v2/nudge-trace.js';
import * as finite from '../../src/v2/finite-calibration.js';
import * as calibration from '../../src/v2/calibration.js';
import * as admission from '../../src/v2/admission.js';
import * as loop from '../../src/v2/loop.js';
import * as remediation from '../../src/v2/remediation.js';
import { runDecisionProgram, runtimeManifest } from '../../examples/v2/decision-program/program.mjs';

const core = { ...contracts, ...validation, ...catalog, ...evaluate, ...budget, ...decision, ...nudges, ...trace, ...finite, ...calibration, ...admission, ...loop, ...remediation };
let result: Awaited<ReturnType<typeof runDecisionProgram>>;
beforeAll(async () => {
  const manifest = await runtimeManifest(core, '../../../src/v2/');
  result = await runDecisionProgram(core, { runtimeManifest: manifest });
}, 30_000);

describe('executed finite decision/control program', () => {
  it('retains finite false accepts, false rejects, missingness and actual scanner failures', () => {
    expect(result.report.population).toMatchObject({ members: 224, acceptable: 32, unacceptable: 192 });
    expect(result.report.census.exact.status).toBe('meets-finite-thresholds');
    expect(result.report.census.approximate.falseAccept.errors).toBe(44);
    expect(result.report.census.approximate.falseReject.errors).toBe(12);
    expect(result.report.census.outage.falseReject).toMatchObject({ missing: 1, unavailable: 9 });
    expect(result.report.census.outage.falseAccept.unavailable).toBe(48);
    expect(result.observations.filter(value => value.mode === 'outage' && value.budget.exceeded)).toHaveLength(1);
    expect(result.report.samplingApiAudit.status).toBe('exploratory-only');
  });
  it('separates information gain, posterior change and actual action value', () => {
    const assessments = result.report.decision.choice.evaluations;
    const exact = assessments.find(value => value.experimentId === 'exact');
    const approximate = assessments.find(value => value.experimentId === 'approximate');
    const color = assessments.find(value => value.experimentId === 'color');
    const constant = assessments.find(value => value.experimentId === 'constant');
    expect(exact.netValue).toBeCloseTo(2 / 7 - 0.1);
    expect(color.informationGainBits).toBeCloseTo(1);
    expect(color.grossValue).toBeCloseTo(0);
    expect(approximate.informationGainBits).toBeGreaterThan(0);
    expect(approximate.outcomes.every(value => value.actions.length === 1 && value.actions[0] === 'reject')).toBe(true);
    expect(approximate.outcomes[0].posterior['acceptable:A']).not.toBe(result.report.decision.model.states[0].prior);
    expect(constant.informationGainBits).toBeCloseTo(0);
    expect(result.report.decision.noAssessment.additionalCost).toBe(0);
  });
  it('executes the selected assessment and no-assessment policies with matching finite consequences', () => {
    const [assess, stop] = result.report.selectedPolicyRuns;
    expect(assess).toMatchObject({ choice: 'assess', selected: 'exact', assessmentSteps: 224, grossUtility: -0 });
    expect(assess.netUtility).toBeCloseTo(-0.1);
    expect(stop).toMatchObject({ choice: 'stop', selected: null, assessmentSteps: 0 });
    expect(stop.netUtility).toBeCloseTo(-2 / 7);
    expect(stop.executions.every(value => value.observation === null)).toBe(true);
    expect(result.report.sensitivity).toHaveLength(36);
    expect(result.report.sensitivity.every(value => value.independentlyAgrees)).toBe(true);
    expect(result.report.sensitivity.some(value => value.kind === 'stop')).toBe(true);
    expect(result.report.uncertainty.exactNetValueRange.lower).toBeLessThan(0);
    expect(result.report.uncertainty.exactNetValueRange.upper).toBeGreaterThan(0);
  });
  it('keeps protected, incomparable and unsupported causal proposals unresolved or rejected', () => {
    expect(result.report.conflicts.dominance.plan.selected.map(value => value.id)).toEqual(['raise-total-to-three']);
    expect(result.report.conflicts.overlap.unresolved).toHaveLength(1);
    expect(result.report.conflicts.incomparable.unresolved).toHaveLength(1);
    expect(result.report.conflicts.protected.entries.find(value => value.id === 'restore-total').status).toBe('deferred');
    expect(result.report.responseSurface['restore-total'].protectedRegressions).toBe(48);
    expect(result.report.responseSurface['change-color'].unchangedArithmetic).toBe(224);
    const color = result.report.loops.find(value => value.scenario === 'color-hypothesis');
    expect(color.stopReason).toBe('stalled');
    expect(color.events.find(value => value.phase === 'admission').status).toBe('rejected');
  });
  it('meters actual full-gate checks, rejected repairs, disabled remedies and bounded stopping', () => {
    const repaired = result.report.loops.find(value => value.scenario === 'repair-after-protected-rejection');
    expect(repaired).toMatchObject({ stopReason: 'pass', rounds: 2, actualInvocations: { assessment_steps: 6, proposal_steps: 2, repair_steps: 2 } });
    expect(repaired.events.filter(value => value.phase === 'admission').map(value => value.status)).toEqual(['rejected', 'accepted']);
    expect(result.report.loops.map(value => value.stopReason)).toEqual(['pass', 'stalled', 'budget', 'round-limit', 'incomplete', 'stalled']);
    expect(result.report.loops.every(value => value.accountingMatchesInvocations)).toBe(true);
    expect(result.report.totalMeasuredInvocations).toEqual({ assessment_steps: 1589, proposal_steps: 8, repair_steps: 5 });
  });
});
