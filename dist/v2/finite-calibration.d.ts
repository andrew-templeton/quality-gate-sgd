import { type AssertionContract } from './contracts.js';
import type { Cost } from './types.js';
export interface FiniteVerifierProtocol {
    id: string;
    version: string;
    scope: string;
    evaluatorDigest: string;
    applicabilityDigest: string;
    /** Fixed complete census, not a sample of a larger population. */
    population: {
        id: string;
        inputDigest: string;
        label: 'acceptable' | 'unacceptable';
        labelEvidence: string[];
    }[];
    reference: {
        kind: 'mathematical-definition' | 'external-reference';
        description: string;
        evidence: string[];
    };
    design: {
        kind: 'exhaustive-finite-population';
        weighting: 'uniform-within-label';
        dependence: string;
        evidenceUse: string;
        registeredBeforeExecution: boolean;
    };
    thresholds: {
        maximumFalseAcceptRate: number;
        maximumFalseRejectRate: number;
    };
    /** Operator-supplied consequences, not costs inferred from correctness or preference. */
    consequences: {
        unit: string;
        falseAccept: number;
        falseReject: number;
        basis: string;
    };
}
export interface FiniteVerifierObservation {
    caseId: string;
    inputDigest: string;
    evaluatorDigest: string;
    verdict: 'accept' | 'reject' | 'unavailable';
    evidence: string[];
    actualCost: Cost;
    reason?: string;
}
/**
 * Exact class-conditional census rates, with worst-case completion bounds for missing outcomes.
 * No independence assumption, sampling confidence, label verification or execution attestation.
 */
export declare function assessFiniteVerifier(protocol: FiniteVerifierProtocol, observations: FiniteVerifierObservation[], evaluator: AssertionContract): {
    digest: string;
    kind: "finite-verifier-census";
    status: "incomplete-census" | "meets-finite-thresholds" | "fails-finite-thresholds";
    protocolDigest: string;
    evaluatorDigest: string;
    applicabilityDigest: string;
    populationDigest: string;
    observationsDigest: string;
    scope: string;
    design: {
        kind: "exhaustive-finite-population";
        weighting: "uniform-within-label";
        dependence: string;
        evidenceUse: string;
        registeredBeforeExecution: boolean;
    };
    complete: boolean;
    falseAccept: {
        population: number;
        correct: number;
        errors: number;
        missing: number;
        unavailable: number;
        rate: number | null;
        completionBounds: {
            lower: number;
            upper: number;
        };
    };
    falseReject: {
        population: number;
        correct: number;
        errors: number;
        missing: number;
        unavailable: number;
        rate: number | null;
        completionBounds: {
            lower: number;
            upper: number;
        };
    };
    thresholds: {
        maximumFalseAcceptRate: number;
        maximumFalseRejectRate: number;
    };
    actualCost: Cost;
    knownErrorConsequence: {
        amount: number;
        unit: string;
        basis: string;
    };
    unresolved: {
        caseId: string;
        label: "acceptable" | "unacceptable";
        kind: string;
        reason: string;
    }[];
    interpretation: string;
    limitations: string[];
};
//# sourceMappingURL=finite-calibration.d.ts.map