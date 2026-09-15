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
export interface RenderPolicy {
    version: string;
    views: {
        id: string;
        maxTotal: number;
        maxNovel: number;
    }[];
}
export interface RenderModuleOptions {
    policy: RenderPolicy;
    reportPath?: string[];
    costUpperBound?: Cost;
}
export declare const RENDER_INPUT: {
    schemas: string[];
    capabilities: string[];
};
/** Required views/caps and the report selector are snapshotted, versioned operator configuration. */
export declare function renderedLegibilityModule(options: RenderModuleOptions): AssertionModule;
//# sourceMappingURL=modules.d.ts.map