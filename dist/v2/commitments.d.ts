import { type ValueSchema } from './contracts.js';
import type { AssertionModule, Cost, Finding, Status } from './types.js';
export interface CommitmentQuantity {
    amount: number;
    unit: string;
    denominator: {
        amount: number;
        unit: string;
        population: string;
    } | null;
}
/** Canonical semantic identifiers/annotations, not an automatic natural-language parser. */
export interface SemanticCommitment {
    id: string;
    address: string;
    sourceAddresses: string[];
    proposition: string;
    quantity: CommitmentQuantity | null;
    actor: string;
    population: string;
    period: string;
    scope: string;
    conditions: string[];
    dependencies: string[];
    adverseScenarios: string[];
    uncertainty: {
        kind: 'exact' | 'estimate' | 'interval' | 'unknown';
        lower: number | null;
        upper: number | null;
        confidence: number | null;
        description: string;
    };
    claimStrength: 'description' | 'association' | 'prediction' | 'causal' | 'guarantee';
    materialCosts: {
        id: string;
        amount: number;
        unit: string;
        period: string;
    }[];
    action: {
        actor: string;
        operation: string;
        target: string;
        deadline: string;
        conditions: string[];
    } | null;
}
export type NumericRelationship = {
    id: string;
    kind: 'sum';
    resultId: string;
    terms: {
        commitmentId: string;
        coefficient: number;
    }[];
    absoluteTolerance: number;
} | {
    id: string;
    kind: 'ratio';
    resultId: string;
    numeratorId: string;
    denominatorId: string;
    scale: 1 | 100;
    absoluteTolerance: number;
} | {
    id: string;
    kind: 'all-in-cost';
    resultId: string;
    absoluteTolerance: number;
};
export interface SourceCorrection {
    id: string;
    commitmentId: string;
    sourceRevisionDigest: string;
    before: SemanticCommitment;
    after: SemanticCommitment;
    approvedBy: string;
    reason: string;
    evidence: string[];
}
export interface SourceCommitmentContract {
    id: string;
    revisionDigest: string;
    contentDigest: string;
    content: string;
    /** An exact contiguous partition of the supplied full text, in UTF-16 offsets. */
    sections: {
        address: string;
        start: number;
        end: number;
    }[];
    coverage: {
        status: 'complete' | 'partial' | 'unknown';
        coveredAddresses: string[];
        evidence: string[];
    };
    commitments: SemanticCommitment[];
    relationships: NumericRelationship[];
    corrections: SourceCorrection[];
}
export interface SemanticJudgmentReceipt {
    evaluatorDigest: string;
    applicabilityDigest: string;
    referenceDigest: string;
    sourceRevisionDigest: string;
    sourceContentDigest: string;
    candidateRevisionDigest: string;
    candidateContentDigest: string;
    candidateInventoryDigest: string;
    coverageDigest: string;
    status: Status;
    evidence: string[];
}
export interface CandidateCommitmentReport {
    sourceRevisionDigest: string;
    candidateRevisionDigest: string;
    candidateContentDigest: string;
    sourceCoverageDigest: string;
    commitments: SemanticCommitment[];
    judgment: SemanticJudgmentReceipt | null;
}
export interface CommitmentPolicy {
    mode: 'structured-only' | 'qualified-prose';
    scope: string;
    /** Accepted external qualification is an operator trust decision, not a self-issued candidate field. */
    semanticEvaluators: {
        evaluatorDigest: string;
        applicabilityDigest: string;
        scope: string;
        evidence: string[];
    }[];
}
export interface CommitmentSummary {
    sourceRevisionDigest: string;
    sourceContentDigest: string;
    candidateRevisionDigest: string;
    candidateContentDigest: string;
    sourceCoverageDigest: string;
    referenceDigest: string;
    inventoryDigest: string;
    preservedCommitmentIds: string[];
    appliedCorrectionIds: string[];
    semanticMode: CommitmentPolicy['mode'];
}
export interface CommitmentAssessment {
    status: Status;
    findings: Finding[];
    evidence: string[];
    summary: CommitmentSummary;
}
export declare const COMMITMENT_SCHEMA: ValueSchema<SemanticCommitment>;
export declare const CANDIDATE_COMMITMENT_SCHEMA: ValueSchema<CandidateCommitmentReport>;
export declare const COMMITMENT_OUTPUT: import("./contracts.js").OutputBinding<CommitmentSummary>;
export declare const COMMITMENT_INPUT: {
    schemas: string[];
    capabilities: string[];
};
export declare function commitmentInventoryDigest(items: SemanticCommitment[]): string;
export declare function sourceCoverageDigest(source: SourceCommitmentContract): string;
export declare function sourceReferenceDigest(source: SourceCommitmentContract): string;
/** Compare validated structured annotations. Prose fidelity additionally requires an accepted scoped semantic receipt. */
export declare function assessCommitments(sourceInput: SourceCommitmentContract, candidateInput: CandidateCommitmentReport, policy: CommitmentPolicy, candidateText: string): CommitmentAssessment;
export declare function sourceCommitmentsModule(options: {
    source: SourceCommitmentContract;
    policy: CommitmentPolicy;
    reportPath?: string[];
    candidateTextPath?: string[];
    costUpperBound?: Cost;
}): AssertionModule;
//# sourceMappingURL=commitments.d.ts.map