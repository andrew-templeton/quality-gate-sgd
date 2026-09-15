import { type SchemaValue } from './contracts.js';
import type { AssertionModule } from './types.js';
declare const rectSchema: import("./contracts.js").ValueSchema<{
    x: number;
    y: number;
    width: number;
    height: number;
}>;
export type SurfaceRect = SchemaValue<typeof rectSchema>;
/** Every item is independently accounted for. Candidate-declared grouping earns no compression credit. */
export interface SurfaceElementPolicy {
    id: string;
    address: string;
    text: string;
    concepts: string[];
    defines: string[];
}
export interface SurfaceStatePolicy {
    id: string;
    route: string;
    viewport: {
        width: number;
        height: number;
    };
    input: 'keyboard' | 'touch';
    interaction: string;
    requiredElements: string[];
    entryElements: string[];
    actions: string[];
    maxTotal: number;
    maxNovel: number;
    minFontPx: number;
    minTargetPx: number;
    maxBlankGapPx: number;
    maxScrollScreens: number;
}
export interface SurfacePolicy {
    version: string;
    collectorDigest: string;
    scrollModel: 'integer-css-pixels';
    knownConcepts: string[];
    elements: SurfaceElementPolicy[];
    states: SurfaceStatePolicy[];
}
export declare const SURFACE_INPUT: {
    schemas: string[];
    capabilities: string[];
};
export declare const SURFACE_OUTPUT: import("./contracts.js").OutputBinding<{
    artifactDigest: string;
    environmentDigest: string;
    renderDigest: string;
    policyDigest: string;
    collectorDigest: string;
}>;
export declare const surfaceEvidenceSchema: import("./contracts.js").ValueSchema<{
    protocol: "quality-sgd.surface-evidence/v1";
    artifactDigest: string;
    environmentDigest: string;
    sourceDigest: string;
    dataDigest: string;
    collectorDigest: string;
    policyDigest: string;
    browser: string;
    renderDigest: string;
    scrollModel: "integer-css-pixels";
    states: {
        id: string;
        route: string;
        viewport: {
            width: number;
            height: number;
        };
        input: "keyboard" | "touch";
        interaction: string;
        complete: boolean;
        unavailable: string[];
        documentHeight: number;
        chromeHeight: number;
        scrollProbes: {
            requested: number;
            observed: number;
        }[];
        anchors: {
            id: string;
            top: number;
        }[];
        elements: {
            id: string;
            address: string;
            text: string;
            fontPx: number;
            rects: {
                x: number;
                y: number;
                width: number;
                height: number;
            }[];
        }[];
        windows: {
            id: string;
            scrollTop: number;
            visible: string[];
        }[];
        interactions: {
            id: string;
            method: "keyboard" | "touch";
            reachable: boolean;
            focusVisible: boolean;
            activated: boolean;
            targetVisible: boolean;
            targetWidth: number;
            targetHeight: number;
        }[];
        defects: {
            code: string;
            address: string;
            message: string;
        }[];
        captures: {
            id: string;
            scrollTop: number;
            digest: string;
            path: string;
        }[];
    }[];
}>;
export type SurfaceEvidence = SchemaValue<typeof surfaceEvidenceSchema>;
export type SurfaceVerification = Pick<SurfaceEvidence, 'artifactDigest' | 'environmentDigest' | 'renderDigest' | 'policyDigest' | 'collectorDigest'>;
export type SurfaceStateEvidence = SurfaceEvidence['states'][number];
export interface SurfaceWindow {
    id: string;
    scrollTop: number;
    visible: string[];
    total: string[];
    novel: string[];
    unexplained: string[];
}
/**
 * Sweep viewport membership boundaries, plus natural section starts and the page ends.
 * Integer-pixel midpoints cover every interval between entering/leaving text fragments. This is
 * deliberately not a partition into disjoint folds; partially visible items count.
 * Requires verified integer CSS pixel scrolling, stationary document-coordinate text
 * geometry and one measured top chrome band. Fractional scrolling is unsupported.
 */
export declare function surfaceWindowStarts(state: Pick<SurfaceStateEvidence, 'viewport' | 'documentHeight' | 'chromeHeight' | 'elements' | 'anchors'>): number[];
/** Rectangles include visible text fragments, in document coordinates, before viewport clipping. */
export declare function surfaceVisible(state: Pick<SurfaceStateEvidence, 'viewport' | 'chromeHeight' | 'elements'>, scrollTop: number): string[];
export declare function surfaceRenderDigest(evidence: Omit<SurfaceEvidence, 'renderDigest'> | SurfaceEvidence): string;
export declare function validateSurfacePolicy(supplied: SurfacePolicy): SurfacePolicy;
/** Validation checks identity and measurement coverage. It cannot attest an honest browser or semantic inventory. */
export declare function validateSurfaceEvidence(supplied: unknown, policy: SurfacePolicy, identity: {
    artifactDigest: string;
    environmentDigest: string;
}): SurfaceEvidence;
/** Novelty is recomputed from trusted knowledge and concept membership; no learning is inferred across states/windows. */
export declare function surfaceWindows(state: SurfaceStateEvidence, policy: SurfacePolicy): SurfaceWindow[];
/** Browser-independent predicates over evidence from an explicitly trusted external collector. */
export declare function surfaceEvidenceModule(options: {
    policy: SurfacePolicy;
    reportPath?: string[];
}): AssertionModule;
export {};
//# sourceMappingURL=surfaces.d.ts.map