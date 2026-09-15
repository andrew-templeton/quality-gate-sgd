import { describe, expect, it } from 'vitest';
import {
  assessPreferenceTrial, assessVerifierCalibration, preparePreferenceTrial,
  type EvidenceUse, type LabeledVerifierCase, type PreferenceAnswerKey, type PreferenceCase,
  type PreferencePacket, type PreferenceProtocol, type PreferenceResponse, type VerifierCalibrationProtocol,
} from '../../src/v2/calibration.js';

const fresh: EvidenceUse = { priorAnalyses: 0, adaptedUsingTheseCases: false, independentUnits: true };
function protocol(pairs = 20): PreferenceProtocol {
  return { id: 'study-1', version: '1', question: 'Which better answers the prompt?', baselineVersion: 'baseline-private-v1',
    candidateVersion: 'candidate-private-v2', samplingFrame: 'held-out decision briefs for registered audience',
    unitOfIndependence: 'one independently sampled brief', plannedPairs: pairs, minimumDecisivePairs: Math.min(10, pairs), alpha: 0.05, mode: 'confirmatory' };
}
function trial(pairs = 20) {
  const cases: PreferenceCase[] = Array.from({ length: pairs }, (_, index) => ({ id: `private-case-${index}`,
    prompt: `Task ${index}`, baseline: `Text X ${index}`, candidate: `Text Y ${index}` }));
  return preparePreferenceTrial(protocol(pairs), cases);
}
function ballots(packet: PreferencePacket, key: PreferenceAnswerKey, wins: number, ties = 0): PreferenceResponse[] {
  return key.assignments.map((assignment, index) => ({ packetId: packet.id, packetDigest: packet.digest, pairId: assignment.pairId,
    choice: index < wins ? assignment.candidateSide : index < wins + ties ? 'tie' : assignment.candidateSide === 'A' ? 'B' : 'A' }));
}

describe('blinded paired preference calibration', () => {
  it('places only display content and opaque identifiers in the reader packet', () => {
    const { packet, answerKey } = trial();
    expect(Object.keys(packet).sort()).toEqual(['digest', 'id', 'pairs', 'question', 'schemaVersion']);
    const publicJson = JSON.stringify(packet);
    for (const secret of ['baseline-private-v1', 'candidate-private-v2', 'private-case-', 'candidateSide', 'baselineVersion', 'candidateVersion']) {
      expect(publicJson).not.toContain(secret);
    }
    expect(new Set(packet.pairs.map(pair => pair.id)).size).toBe(20);
    for (const assignment of answerKey.assignments) {
      const pair = packet.pairs.find(item => item.id === assignment.pairId)!;
      expect(pair[assignment.candidateSide]).toMatch(/^Text Y /);
      expect(Object.keys(pair).sort()).toEqual(['A', 'B', 'id', 'prompt']);
    }
  });

  it('uses a fresh opaque packet and assignment mapping on every preparation', () => {
    const first = trial(); const second = trial();
    expect(first.packet.id).not.toBe(second.packet.id);
    expect(first.packet.digest).not.toBe(second.packet.digest);
    expect(first.packet.pairs.some(pair => second.packet.pairs.some(other => pair.id === other.id))).toBe(false);
  });

  it('round-trips the complete JSON packet/key/response flow without optional undefined fields', () => {
    const { packet, answerKey } = trial(10);
    const responses = ballots(packet, answerKey, 9);
    const direct = assessPreferenceTrial(packet, answerKey, responses, fresh);
    const fromJson = assessPreferenceTrial(
      JSON.parse(JSON.stringify(packet)), JSON.parse(JSON.stringify(answerKey)),
      JSON.parse(JSON.stringify(responses)), JSON.parse(JSON.stringify(fresh)),
    );
    expect(fromJson).toEqual(direct);
    expect(JSON.parse(JSON.stringify(direct))).toEqual(direct);
  });

  it('computes the exact one-sided sign-test tail and reports only preference support', () => {
    const { packet, answerKey } = trial(10);
    const assessment = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 9), fresh);
    expect(assessment.pValue).toBeCloseTo(11 / 1024, 14);
    expect(assessment.status).toBe('supports-preference-improvement');
    expect(assessment.kind).toBe('paired-preference');
    expect(assessment.doesNotGuarantee.join(' ')).toContain('not factual correctness');
  });

  it('does not call a balanced or reversed result an improvement', () => {
    const { packet, answerKey } = trial(10);
    expect(assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 5), fresh).status).toBe('no-demonstrated-improvement');
    const reversed = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 0), fresh);
    expect(reversed.pValue).toBe(1);
    expect(reversed.status).toBe('no-demonstrated-improvement');
  });

  it('counts ties explicitly and conditions its test on decisive pairs', () => {
    const { packet, answerKey } = trial(20);
    const result = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 10, 10), fresh);
    expect(result).toMatchObject({ wins: 10, losses: 0, ties: 10, decisive: 10, pValue: 1 / 1024, status: 'supports-preference-improvement' });
    const sparse = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 4, 16), fresh);
    expect(sparse.status).toBe('insufficient-evidence');
    const allTies = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 0, 20), fresh);
    expect(allTies.pValue).toBeNull();
    expect(allTies.status).toBe('insufficient-evidence');
  });

  it('withholds interim p-values and blocks missing or unjudgeable evidence', () => {
    const { packet, answerKey } = trial();
    const responses = ballots(packet, answerKey, 20);
    const missing = assessPreferenceTrial(packet, answerKey, responses.slice(0, 19), fresh);
    expect(missing).toMatchObject({ missing: 1, pValue: null, status: 'insufficient-evidence' });
    responses[0].choice = 'cannot-judge';
    expect(assessPreferenceTrial(packet, answerKey, responses, fresh)).toMatchObject({ cannotJudge: 1, pValue: null, status: 'insufficient-evidence' });
  });

  it('refuses confirmatory claims from repeated looks, adaptation, dependence or an exploratory protocol', () => {
    const { packet, answerKey } = trial();
    const responses = ballots(packet, answerKey, 20);
    for (const use of [{ ...fresh, priorAnalyses: 1 }, { ...fresh, adaptedUsingTheseCases: true }, { ...fresh, independentUnits: false }]) {
      expect(assessPreferenceTrial(packet, answerKey, responses, use).status).toBe('exploratory-only');
    }
    const exploratory = preparePreferenceTrial({ ...protocol(10), mode: 'exploratory' }, Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, prompt: 'Prompt', baseline: 'X', candidate: 'Y' })));
    expect(assessPreferenceTrial(exploratory.packet, exploratory.answerKey, ballots(exploratory.packet, exploratory.answerKey, 10), fresh).status).toBe('exploratory-only');
  });

  it('rejects stale, duplicated, unknown and malformed ballots', () => {
    const { packet, answerKey } = trial();
    const responses = ballots(packet, answerKey, 20);
    for (const override of [{ packetDigest: 'stale' }, { packetId: 'other' }, { pairId: 'unknown' }, { choice: 'candidate' }]) {
      expect(() => assessPreferenceTrial(packet, answerKey, [{ ...responses[0], ...override } as PreferenceResponse], fresh)).toThrow();
    }
    expect(() => assessPreferenceTrial(packet, answerKey, [responses[0], responses[0]], fresh)).toThrow('unique');
    expect(() => assessPreferenceTrial(packet, trial().answerKey, responses, fresh)).toThrow('does not match');
  });

  it('rejects changed display content, assignments and post-hoc protocol changes', () => {
    const { packet, answerKey } = trial();
    const responses = ballots(packet, answerKey, 20);
    const changedPacket = structuredClone(packet); changedPacket.pairs[0].A = 'Revised';
    expect(() => assessPreferenceTrial(changedPacket, answerKey, responses, fresh)).toThrow('content changed');
    const changedKey = structuredClone(answerKey); changedKey.assignments[0].candidateSide = changedKey.assignments[0].candidateSide === 'A' ? 'B' : 'A';
    expect(() => assessPreferenceTrial(packet, changedKey, responses, fresh)).toThrow('key or protocol changed');
    const changedProtocol = structuredClone(answerKey); changedProtocol.protocol.alpha = 0.5;
    expect(() => assessPreferenceTrial(packet, changedProtocol, responses, fresh)).toThrow('key or protocol changed');
  });

  it('copies protocol data and validates the prespecified finite design', () => {
    const original = protocol(1);
    const cases = [{ id: '1', prompt: 'Prompt', baseline: 'X', candidate: 'Y' }];
    const prepared = preparePreferenceTrial(original, cases);
    original.alpha = 0.9;
    expect(prepared.answerKey.protocol.alpha).toBe(0.05);
    for (const override of [{ alpha: 0 }, { alpha: NaN }, { plannedPairs: 1.5 }, { minimumDecisivePairs: 2 }, { mode: 'adaptive' }]) {
      expect(() => preparePreferenceTrial({ ...protocol(1), ...override } as PreferenceProtocol, cases)).toThrow();
    }
    expect(() => preparePreferenceTrial(protocol(2), [cases[0], cases[0]])).toThrow('unique');
    expect(() => preparePreferenceTrial(protocol(2), cases)).toThrow('exactly');
  });

  it('retains stable small-tail probabilities for a large fixed sample', () => {
    const { packet, answerKey } = trial(2_000);
    const result = assessPreferenceTrial(packet, answerKey, ballots(packet, answerKey, 1_100), fresh);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.00001);
    expect(result.status).toBe('supports-preference-improvement');
  });
});

function verifierProtocol(size = 200): VerifierCalibrationProtocol {
  return { id: 'verifier-study', version: '1', evaluatorVersion: 'assertion@2', datasetId: 'held-out-v1', scope: 'registered domain',
    plannedCases: size, minimumPerClass: size / 2, alpha: 0.05, maximumFalseAcceptRate: 0.05, maximumFalseRejectRate: 0.05, mode: 'confirmatory' };
}
function labeledCases(size = 200): LabeledVerifierCase[] {
  return Array.from({ length: size }, (_, index) => index < size / 2
    ? { id: `${index}`, label: 'acceptable', verdict: 'accept' }
    : { id: `${index}`, label: 'unacceptable', verdict: 'reject' });
}

describe('known-label verifier calibration', () => {
  it('uses simultaneous exact bounds rather than treating zero observed errors as perfection', () => {
    const result = assessVerifierCalibration(verifierProtocol(), labeledCases(), fresh);
    expect(result.status).toBe('meets-error-bounds');
    expect(result.falseAcceptRate).toBe(0);
    expect(result.falseRejectRate).toBe(0);
    expect(result.falseAcceptUpper).toBeCloseTo(1 - Math.pow(0.025, 1 / 100), 12);
    expect(result.falseRejectUpper).toBe(result.falseAcceptUpper);
    expect(result.falseAcceptUpper).toBeGreaterThan(0.03);
    expect(result.simultaneousConfidence).toBe(0.95);
  });

  it('does not qualify a tiny zero-error sample against a five-percent error bar', () => {
    const result = assessVerifierCalibration(verifierProtocol(20), labeledCases(20), fresh);
    expect(result.status).toBe('does-not-meet-error-bounds');
    expect(result.falseAcceptUpper).toBeGreaterThan(0.30);
  });

  it('inverts the nonzero-error binomial tail at a closed-form reference point', () => {
    // For k=1 error in n=2 trials, P(X<=1)=1-p^2; the upper bound is sqrt(1-alpha/2).
    const cases = labeledCases(4);
    cases[0].verdict = 'reject';
    cases[2].verdict = 'accept';
    const result = assessVerifierCalibration(verifierProtocol(4), cases, fresh);
    expect(result.falseAcceptUpper).toBeCloseTo(Math.sqrt(0.975), 14);
    expect(result.falseRejectUpper).toBeCloseTo(Math.sqrt(0.975), 14);
  });

  it('separates false acceptance and false rejection, including all-error boundaries', () => {
    const cases = labeledCases();
    for (let i = 0; i < 5; i++) cases[i].verdict = 'reject';
    for (let i = 100; i < 110; i++) cases[i].verdict = 'accept';
    const result = assessVerifierCalibration(verifierProtocol(), cases, fresh);
    expect(result).toMatchObject({ acceptable: 100, unacceptable: 100, falseAccepts: 10, falseRejects: 5, falseAcceptRate: 0.1, falseRejectRate: 0.05, status: 'does-not-meet-error-bounds' });
    expect(result.falseAcceptUpper).toBeGreaterThan(result.falseRejectUpper!);
    for (const item of cases) item.verdict = item.label === 'acceptable' ? 'reject' : 'accept';
    expect(assessVerifierCalibration(verifierProtocol(), cases, fresh)).toMatchObject({ falseAcceptUpper: 1, falseRejectUpper: 1 });
  });

  it('does not remove missing cases, abstentions or an absent label class from qualification', () => {
    const cases = labeledCases();
    expect(assessVerifierCalibration(verifierProtocol(), cases.slice(0, 199), fresh)).toMatchObject({ missing: 1, falseAcceptUpper: null, status: 'insufficient-evidence' });
    cases[0].verdict = 'unavailable';
    expect(assessVerifierCalibration(verifierProtocol(), cases, fresh)).toMatchObject({ unavailable: 1, falseRejectUpper: null, status: 'insufficient-evidence' });
    const oneClass = labeledCases().map(item => ({ ...item, label: 'acceptable' as const, verdict: 'accept' as const }));
    expect(assessVerifierCalibration(verifierProtocol(), oneClass, fresh)).toMatchObject({ unacceptable: 0, falseAcceptUpper: null, status: 'insufficient-evidence' });
  });

  it('does not qualify adaptive evidence and binds results to evaluator, protocol and dataset', () => {
    const result = assessVerifierCalibration(verifierProtocol(), labeledCases(), { ...fresh, adaptedUsingTheseCases: true });
    expect(result.status).toBe('exploratory-only');
    expect(result.evaluatorVersion).toBe('assertion@2');
    const changed = assessVerifierCalibration({ ...verifierProtocol(), evaluatorVersion: 'assertion@3' }, labeledCases(), fresh);
    expect(changed.protocolDigest).not.toBe(result.protocolDigest);
    const alteredLabels = labeledCases(); alteredLabels[0].label = 'unacceptable';
    expect(assessVerifierCalibration(verifierProtocol(), alteredLabels, fresh).evidenceDigest).not.toBe(result.evidenceDigest);
  });

  it('returns finite JSON reports for both incomplete and complete calibration evidence', () => {
    for (const cases of [[], labeledCases()]) {
      const result = assessVerifierCalibration(verifierProtocol(), cases, fresh);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it('rejects duplicate cases, impossible sample design and non-probability thresholds', () => {
    const cases = labeledCases();
    expect(() => assessVerifierCalibration(verifierProtocol(), [cases[0], cases[0]], fresh)).toThrow('unique');
    expect(() => assessVerifierCalibration({ ...verifierProtocol(), minimumPerClass: 101 }, cases, fresh)).toThrow('minima');
    expect(() => assessVerifierCalibration({ ...verifierProtocol(), maximumFalseAcceptRate: -1 }, cases, fresh)).toThrow('[0,1]');
    expect(() => assessVerifierCalibration(verifierProtocol(), cases, { ...fresh, priorAnalyses: -1 })).toThrow('Prior analyses');
  });
});
