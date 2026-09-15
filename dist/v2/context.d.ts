import type { Assertion, AssertionModule, CompiledGate, Cost, EvidenceKind } from './types.js';
export declare const CARD_VOCABULARY: {
    id: string;
    path: string;
    claim: string;
    evidenceKind: string;
    assumptions: string;
    guarantees: string;
    doesNotGuarantee: string;
    applicability: string;
    implementation: string;
    configuration: string;
    input: string;
    output: string;
    prerequisites: string;
    calibration: string;
    costUpperBound: string;
    remediation: string;
};
export declare const EVIDENCE_CONTEXT: Record<EvidenceKind, {
    supports: string;
    requiredEvidence: string[];
    excluded: string[];
}>;
export declare function assertionContext(assertion: Assertion): {
    card: import("./types.js").AssertionCard;
    protocol: string;
    implementation: {
        id: string;
        version: string;
        digest: string;
    } | null;
    configuration: {} | null;
    applicability: {} | null;
    evaluatorDigest: string | null;
    runtimeInput: import("./contracts.js").InputContract | null;
    runtimeOutput: import("./contracts.js").OutputContract | null;
    handoffs: Record<string, import("./contracts.js").PrerequisiteBinding<unknown>>;
    interpretation: {
        supports: string;
        requiredEvidence: string[];
        excluded: string[];
    };
    selectionStatus: string;
};
export declare function catalogContext(modules: AssertionModule[]): {
    schemaVersion: number;
    vocabulary: {
        id: string;
        path: string;
        claim: string;
        evidenceKind: string;
        assumptions: string;
        guarantees: string;
        doesNotGuarantee: string;
        applicability: string;
        implementation: string;
        configuration: string;
        input: string;
        output: string;
        prerequisites: string;
        calibration: string;
        costUpperBound: string;
        remediation: string;
    };
    evidenceKinds: Record<EvidenceKind, {
        supports: string;
        requiredEvidence: string[];
        excluded: string[];
    }>;
    families: {
        id: "structure" | "measurement" | "meaning" | "communication" | "causality" | "decision" | "control";
        children: {
            path: ("structure" | "syntax" | "references" | "measurement" | "arithmetic" | "regression" | "meaning" | "fidelity" | "communication" | "legibility" | "geometry" | "causality" | "identification" | "decision" | "utility" | "control" | "reliability")[];
            meaning: "Parse/type/schema predicates over supplied input." | "Reference integrity and current dependency ancestry." | "Declared quantities, units, denominators and balance identities." | "Observed behavior on the executed test population." | "Preservation of source commitments and claim strength." | "Audience-relative introduction, density and comprehension." | "Rendered visibility and operation in tested states." | "Audit of the assumptions that would support an intervention claim." | "Conditional decisions under a supplied utility and likelihood model." | "Evaluator calibration, freshness, budget and update eligibility.";
            assertions: {
                moduleId: string;
                assertionId: string;
                path: string[];
            }[];
        }[];
    }[];
    modules: {
        id: string;
        version: string;
        includes: string[];
        assertions: {
            card: import("./types.js").AssertionCard;
            protocol: string;
            implementation: {
                id: string;
                version: string;
                digest: string;
            } | null;
            configuration: {} | null;
            applicability: {} | null;
            evaluatorDigest: string | null;
            runtimeInput: import("./contracts.js").InputContract | null;
            runtimeOutput: import("./contracts.js").OutputContract | null;
            handoffs: Record<string, import("./contracts.js").PrerequisiteBinding<unknown>>;
            interpretation: {
                supports: string;
                requiredEvidence: string[];
                excluded: string[];
            };
            selectionStatus: string;
        }[];
    }[];
    interpretation: string;
};
export declare function evaluationCostUpperBound(assertions: Assertion[]): Cost;
/** A selected subset retains every component's boundaries; it has no invented aggregate confidence. */
export declare function compositionContext(gate: CompiledGate): {
    schemaVersion: number;
    card: object;
    assertions: {
        card: import("./types.js").AssertionCard;
        protocol: string;
        implementation: {
            id: string;
            version: string;
            digest: string;
        } | null;
        configuration: {} | null;
        applicability: {} | null;
        evaluatorDigest: string | null;
        runtimeInput: import("./contracts.js").InputContract | null;
        runtimeOutput: import("./contracts.js").OutputContract | null;
        handoffs: Record<string, import("./contracts.js").PrerequisiteBinding<unknown>>;
        interpretation: {
            supports: string;
            requiredEvidence: string[];
            excluded: string[];
        };
        selectionStatus: string;
    }[];
    evaluationCostUpperBound: Cost;
    accountingScope: string;
    selectionObligations: string[];
};
//# sourceMappingURL=context.d.ts.map