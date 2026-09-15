import { planNudges } from './nudges.js';
import type { Nudge } from './types.js';
import { digest, freezeJson, text, unique } from './validation.js';

export interface NudgeTraceContext { artifactDigest: string; scope: string }

/** Inspectable planning only. Evidence references do not authorize execution or establish causality. */
export function traceNudgePlan(nudges: Nudge[], protectedAssertions: string[], context: NudgeTraceContext) {
  digest(nudges); digest(context);
  nudges = structuredClone(nudges);
  text(context.artifactDigest, 'Baseline artifact digest'); text(context.scope, 'Resolution scope');
  unique(protectedAssertions, 'Protected assertions');
  const plan = planNudges(nudges, protectedAssertions);
  const byId = new Map(nudges.map(nudge => [nudge.id, nudge]));
  const conflicts = plan.conflicts.map(conflict => {
    const left = byId.get(conflict.left); const right = byId.get(conflict.right);
    const comparable = left?.netBenefit && right?.netBenefit && left.netBenefit.unit === right.netBenefit.unit;
    const followUp = conflict.preferred
      ? ['Execute only after separate authorization; then evaluate the complete gate and recompute remaining interactions against the new baseline.']
      : !left?.netBenefit || !right?.netBenefit
        ? ['Supply justified net-benefit bounds for both interventions, including repair cost, on an explicit common utility scale.']
        : !comparable
          ? ['Obtain an operator-approved unit conversion with its assumptions and sensitivity, or retain the incomparable tradeoff.']
          : ['Collect outcome evidence capable of narrowing the overlapping net-benefit intervals, or retain the unresolved tradeoff.'];
    return { ...conflict, resolution: conflict.preferred ? 'conditional-preference' as const : 'unresolved' as const, requiredFollowUp: followUp };
  });
  const entries = nudges.map(nudge => {
    const deferred = plan.deferred.find(item => item.id === nudge.id);
    const related = conflicts.filter(item => item.left === nudge.id || item.right === nudge.id);
    const protectedEffects = nudge.effects.filter(effect => protectedAssertions.includes(effect.assertionId) && effect.direction === 'worsens');
    const requiredFollowUp = [...new Set([
      ...related.flatMap(item => item.requiredFollowUp),
      ...(protectedEffects.length ? ['Revise the intervention or measure the protected objectives; a predicted regression cannot be admitted from a benefit score.'] : []),
      ...nudge.effects.map(effect => effect.basis === 'hypothesis'
        ? `Measure the intervention's effect on ${effect.assertionId} before upgrading this hypothesis to an observation; observed association alone does not identify causality.`
        : effect.basis === 'observed'
          ? `Before calling the effect on ${effect.assertionId} identified, supply an identification design, its assumptions and intervention outcome evidence in this scope.`
          : `Audit the supplied identification evidence and assumptions for ${effect.assertionId}; this planner does not verify or extend that claim.`),
      'Re-evaluate all required assertions before admission; remedy metadata does not authorize a harness.',
    ])];
    return { id: nudge.id, status: deferred ? 'deferred' as const : 'selected-for-consideration' as const,
      reason: deferred?.reason ?? 'No unresolved eligible conflict or predicted protected regression remains',
      preferredOver: related.filter(item => item.preferred === nudge.id).map(item => item.left === nudge.id ? item.right : item.left),
      unresolvedWith: related.filter(item => item.resolution === 'unresolved').map(item => item.left === nudge.id ? item.right : item.left),
      claimedEffects: nudge.effects.map(effect => ({ ...effect, verifiedByPlanner: false as const })), requiredFollowUp,
      remedy: nudge.remediation ? { ...nudge.remediation, executionAuthorized: false as const } : null };
  });
  const body = { kind: 'partial-nudge-resolution' as const, context: { ...context }, protectedAssertions: [...protectedAssertions],
    plan, entries, conflicts, unresolved: conflicts.filter(item => item.resolution === 'unresolved'), executionAuthorized: false as const,
    scope: 'Conservative pairwise interval dominance conditional on declared bounds and units. Neither global optimization, causal identification, evidence review nor execution authorization is performed.' };
  return freezeJson({ ...body, digest: digest(body) });
}
