import type { AssertionModule, Cost, Nudge } from './types.js';
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
export interface SonarReport {
    artifactDigest: string;
    complete: boolean;
    issues: {
        key: string;
        rule: string;
        component: string;
        message: string;
        line?: number;
    }[];
}
export declare function sonarqubeModule(read: (data: unknown) => SonarReport, suppliedCost?: Cost): AssertionModule;
export declare function sonarNudges(report: SonarReport, costUpperBound: Cost): Nudge[];
//# sourceMappingURL=modules.d.ts.map