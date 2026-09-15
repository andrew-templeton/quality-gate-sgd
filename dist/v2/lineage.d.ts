export type QualityAddressKind = 'artifact' | 'component' | 'claim' | 'assertion';
export type LineageKind = 'source' | 'asset' | 'derived' | 'render' | 'audience' | 'policy' | 'view' | 'evaluator' | 'judgment';
export interface LineageNode {
    address: string;
    kind: LineageKind;
    /** A digest of actual content supplied by the adapter; unavailable content has no fabricated digest. */
    contentDigest: string | null;
    configurationDigest: string;
    dependencies: string[];
    availability: 'available' | 'unavailable';
    reason: string | null;
}
export interface ResolvedLineageNode extends LineageNode {
    revisionDigest: string;
    dependencyRevisions: Array<{
        address: string;
        revisionDigest: string;
    }>;
    available: boolean;
    unavailableDependencies: string[];
}
export interface LineageGraph {
    schemaVersion: 'quality-sgd.lineage/v1';
    nodes: ResolvedLineageNode[];
    digest: string;
}
export interface LineageReceipt<T = unknown> {
    schemaVersion: 'quality-sgd.lineage-receipt/v1';
    subject: string;
    subjectRevision: string;
    evaluator: string;
    evaluatorRevision: string;
    evaluatorDigest: string;
    /** The evaluator's scoped input, not an unrelated whole-artifact identity. */
    inputDigest: string;
    schemaDigest: string;
    valueDigest: string;
    value: T;
    lineage: Array<{
        address: string;
        revisionDigest: string;
    }>;
    digest: string;
}
export interface LineageRequirement {
    subject: string;
    evaluator: string;
    evaluatorDigest: string;
    inputDigest: string;
    schemaDigest: string;
}
export type LineageReuse<T> = {
    status: 'reusable';
    value: T;
} | {
    status: 'unavailable';
    reason: string;
};
/** Canonical addresses can be reused unchanged in findings, nudges, cards and output lineage. */
export declare function qualityAddress(kind: QualityAddressKind, ...segments: string[]): string;
export declare function validateQualityAddress(address: string): void;
/** Convenience constructor for JSON/text content. Binary adapters can supply their own content SHA-256. */
export declare function contentLineageNode(options: {
    address: string;
    kind: LineageKind;
    content: unknown;
    configuration?: unknown;
    dependencies?: string[];
}): LineageNode;
/** Reject invalid topology instead of treating missing or cyclic evidence as an empty dependency set. */
export declare function compileLineageGraph(input: LineageNode[]): LineageGraph;
export declare function validateLineageGraph(graph: LineageGraph): void;
/** Unrelated branch changes do not invalidate a scoped receipt. Every reused branch must remain available. */
export declare function compareLineageGraphs(previous: LineageGraph, current: LineageGraph): {
    changed: string[];
    invalidated: string[];
    reusable: string[];
    added: string[];
    unavailable: string[];
    removed: string[];
};
/** Bind all chosen environment roots to durable execution; root selection is an explicit adapter obligation. */
export declare function lineageEnvironmentDigest(graph: LineageGraph, roots: string[], context?: unknown): string;
export declare function createLineageReceipt<T>(graph: LineageGraph, expected: LineageRequirement, value: T): LineageReceipt<T>;
/** Any malformed, absent, stale or incompatible evidence yields unavailable, never an implicit pass. */
export declare function reuseLineageReceipt<T>(graph: LineageGraph, receipt: LineageReceipt<T> | null | undefined, expected: LineageRequirement): LineageReuse<T>;
//# sourceMappingURL=lineage.d.ts.map