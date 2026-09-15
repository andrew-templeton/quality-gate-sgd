/** Public contracts: a predicate, an empirical estimate and a causal claim are different objects. */
export type Cost = Record<string, number>;
export type Status = 'pass' | 'fail' | 'unavailable';
export type EvidenceKind = 'deterministic' | 'empirical' | 'model-judgment' | 'causal-assumption-audit';
export interface Interval {
    lower: number;
    upper: number;
    unit: string;
}
export interface AssertionCard {
    id: string;
    version: string;
    title: string;
    /** Hierarchical, discoverable taxonomy; not an ordered ladder of proof strength. */
    path: string[];
    claim: string;
    input: {
        schemas: string[];
        capabilities: string[];
        description: string;
    };
    evidenceKind: EvidenceKind;
    assumptions: string[];
    guarantees: string[];
    doesNotGuarantee: string[];
    requires: string[];
    costUpperBound: Cost;
    calibration: {
        status: 'not-applicable' | 'unqualified' | 'qualified';
        evidence: string[];
        /** Must equal this assertion's version to authorize a model-judgment hard gate. */
        evaluatorVersion?: string;
        /** Full standard evaluator identity, including input contracts, configuration and applicability. */
        evaluatorDigest?: string;
        applicabilityDigest?: string;
        scope: string;
    };
    remediation?: {
        prompt: string;
        harnessId?: string;
        verification: string[];
    };
}
export interface Artifact {
    id: string;
    /** Digest of actual content and transitive render dependencies, supplied by the surface adapter. */
    digest: string;
    data: unknown;
}
export interface EvaluationContext {
    artifact: Artifact;
    /** Digest of source commitments, audience, policy inputs, viewport/state matrix and environment. */
    environmentDigest: string;
    signal: AbortSignal;
    /** Engine-owned stable request ID; adapters may forward it for provider receipt/idempotency lookup. */
    operationId?: string;
    /** Explicit workflow declarations; matching these does not authenticate provenance. */
    available?: {
        schemas: string[];
        capabilities: string[];
    };
}
export interface Finding {
    address: string;
    message: string;
    evidence: string[];
}
export interface Observation {
    status: Status;
    findings: Finding[];
    evidence: string[];
    /** Lower is better. Bounds have caller-declared semantics; not automatically confidence intervals. */
    loss?: Interval;
    actualCost: Cost;
}
export interface Assertion {
    card: AssertionCard;
    /** Standard, portable execution contract. Legacy assertions have no implicit qualification. */
    contract?: import('./contracts.js').AssertionContract;
    evaluate(context: EvaluationContext): Promise<Observation>;
}
export interface AssertionModule {
    id: string;
    version: string;
    includes: string[];
    assertions: Assertion[];
}
export interface GatePolicy {
    required: string[];
    advisory: string[];
}
export interface CompiledGate {
    modules: string[];
    assertions: Assertion[];
    policy: GatePolicy;
    digest: string;
}
export interface AssertionResult extends Observation {
    assertionId: string;
    inputDigest: string;
    reason?: string;
    reasonCode?: 'prerequisite-blocked';
}
export interface Evaluation {
    artifactDigest: string;
    inputDigest: string;
    requiredAssertions: string[];
    contractDigest: string;
    status: Status;
    results: AssertionResult[];
    budget: {
        limits: Cost;
        spent: Cost;
        reserved: Cost;
        exceeded: boolean;
    };
}
export interface Change {
    address: string;
    variable: string;
    direction: -1 | 1;
}
export interface Nudge {
    id: string;
    assertionId: string;
    instruction: string;
    changes: Change[];
    /** Reads and writes use the same symbol/claim/component address space as findings. */
    reads: string[];
    writes: string[];
    effects: {
        assertionId: string;
        direction: 'improves' | 'worsens' | 'unknown';
        basis: 'hypothesis' | 'observed' | 'identified';
        evidence: string[];
    }[];
    /** Net benefit AFTER repair cost on an explicitly supplied common utility scale. */
    netBenefit?: Interval;
    costUpperBound: Cost;
    remediation?: {
        harnessId: string;
        prompt: string;
        verification: string[];
    };
}
//# sourceMappingURL=types.d.ts.map