import type { AssertionModule, Cost } from './types.js';
export interface FoldMeasurement {
    id: string;
    quanta: string[];
    novel: string[];
    unexplained: string[];
}
export interface RenderEvidence {
    artifactDigest: string;
    environmentDigest: string;
    screenshotDigest: string;
    views: {
        id: string;
        folds: FoldMeasurement[];
        defects: {
            address: string;
            message: string;
        }[];
    }[];
}
/** Operator-owned requirements, supplied separately from candidate measurements. */
export interface RenderPolicy {
    version: string;
    views: {
        id: string;
        maxTotal: number;
        maxNovel: number;
    }[];
}
export declare function renderedLegibilityModule(read: (data: unknown) => RenderEvidence, suppliedPolicy: RenderPolicy, suppliedCost?: Cost): AssertionModule;
//# sourceMappingURL=modules.d.ts.map