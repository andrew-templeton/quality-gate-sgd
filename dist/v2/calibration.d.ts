type Side = 'A' | 'B';
export type PreferenceChoice = Side | 'tie' | 'cannot-judge';
/** Register before collecting responses. This is a single fixed-sample comparison. */
export interface PreferenceProtocol {
    id: string;
    version: string;
    question: string;
    baselineVersion: string;
    candidateVersion: string;
    samplingFrame: string;
    unitOfIndependence: string;
    plannedPairs: number;
    minimumDecisivePairs: number;
    alpha: number;
    mode: 'confirmatory' | 'exploratory';
}
export interface PreferenceCase {
    id: string;
    prompt: string;
    baseline: string;
    candidate: string;
}
export interface PreferencePacket {
    schemaVersion: '1';
    id: string;
    question: string;
    pairs: {
        id: string;
        prompt: string;
        A: string;
        B: string;
    }[];
    digest: string;
}
/** Keep this separate from the reader's play packet. Digests detect changes, not forgery. */
export interface PreferenceAnswerKey {
    schemaVersion: '1';
    packetId: string;
    packetDigest: string;
    protocol: PreferenceProtocol;
    protocolDigest: string;
    assignments: {
        pairId: string;
        caseId: string;
        candidateSide: Side;
    }[];
    digest: string;
}
export interface PreferenceResponse {
    packetId: string;
    packetDigest: string;
    pairId: string;
    choice: PreferenceChoice;
}
/** External facts the library cannot observe. False attestations invalidate statistical interpretation. */
export interface EvidenceUse {
    priorAnalyses: number;
    adaptedUsingTheseCases: boolean;
    independentUnits: boolean;
}
/**
 * Independent fair assignment to A/B, then a random permutation; no condition metadata enters the packet.
 * The caller must remove identifying text from prompts and displayed artifacts. Content can still unblind.
 * Store the protocol/key before play; do not expose the returned key to participants.
 */
export declare function preparePreferenceTrial(protocol: PreferenceProtocol, cases: PreferenceCase[]): {
    packet: PreferencePacket;
    answerKey: PreferenceAnswerKey;
};
/**
 * One-sided exact sign test H0: P(candidate preferred | decisive pair) <= 1/2.
 * Ties are excluded from that estimand and reported; abstention/missingness blocks a confirmatory verdict.
 * No optional stopping, repeated-look or multiple-comparison correction is supplied.
 */
export declare function assessPreferenceTrial(packet: PreferencePacket, answerKey: PreferenceAnswerKey, responses: PreferenceResponse[], use: EvidenceUse): {
    kind: "paired-preference";
    status: "insufficient-evidence" | "exploratory-only" | "supports-preference-improvement" | "no-demonstrated-improvement";
    packetDigest: string;
    protocolDigest: string;
    responseDigest: string;
    evidenceUse: {
        priorAnalyses: number;
        adaptedUsingTheseCases: boolean;
        independentUnits: boolean;
    };
    plannedPairs: number;
    wins: number;
    losses: number;
    ties: number;
    cannotJudge: number;
    missing: number;
    decisive: number;
    pValue: number | null;
    alpha: number;
    reasons: string[];
    estimand: string;
    guarantees: string[];
    doesNotGuarantee: string[];
};
export interface VerifierCalibrationProtocol {
    id: string;
    version: string;
    evaluatorVersion: string;
    datasetId: string;
    scope: string;
    plannedCases: number;
    minimumPerClass: number;
    alpha: number;
    maximumFalseAcceptRate: number;
    maximumFalseRejectRate: number;
    mode: 'confirmatory' | 'exploratory';
}
export interface LabeledVerifierCase {
    id: string;
    label: 'acceptable' | 'unacceptable';
    verdict: 'accept' | 'reject' | 'unavailable';
}
/**
 * Separate known-label calibration: simultaneous one-sided Clopper-Pearson upper bounds
 * for false acceptance and false rejection, with alpha/2 Bonferroni allocation per class.
 * Labels, sampling and preregistration are caller-supplied evidence, not inferred truth.
 */
export declare function assessVerifierCalibration(protocol: VerifierCalibrationProtocol, cases: LabeledVerifierCase[], use: EvidenceUse): {
    kind: "known-label-verifier-calibration";
    status: "insufficient-evidence" | "exploratory-only" | "meets-error-bounds" | "does-not-meet-error-bounds";
    protocolDigest: string;
    evidenceDigest: string;
    evidenceUse: {
        priorAnalyses: number;
        adaptedUsingTheseCases: boolean;
        independentUnits: boolean;
    };
    evaluatorVersion: string;
    scope: string;
    plannedCases: number;
    acceptable: number;
    unacceptable: number;
    falseAccepts: number;
    falseRejects: number;
    unavailable: number;
    missing: number;
    falseAcceptRate: number | null;
    falseRejectRate: number | null;
    falseAcceptUpper: number | null;
    falseRejectUpper: number | null;
    simultaneousConfidence: number;
    method: string;
    guarantees: string[];
    doesNotGuarantee: string[];
};
export {};
//# sourceMappingURL=calibration.d.ts.map