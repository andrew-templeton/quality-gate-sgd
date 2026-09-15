import type { AssertionModule, Cost, Nudge } from './types.js';
export interface FoldMeasurement {
    id: string;
    quanta: string[];
    novel: string[];
    unexplained: string[];
    maxTotal: number;
    maxNovel: number;
}
export interface RenderEvidence {
    artifactDigest: string;
    environmentDigest: string;
    screenshotDigest: string;
    requiredViews: string[];
    views: {
        id: string;
        folds: FoldMeasurement[];
        defects: {
            address: string;
            message: string;
        }[];
    }[];
}
export declare function renderedLegibilityModule(read: (data: unknown) => RenderEvidence, suppliedCost?: Cost): AssertionModule;
export interface IsoglossEngine {
    foldReport(text: string, terms: ReadonlySet<string>, options: {
        cap: number;
        foldWords: number;
    }): {
        index: number;
        quanta: number;
        cap: number;
        overloaded: boolean;
    }[];
}
export declare function isoglossModule(engine: IsoglossEngine, supplied: {
    terms: string[];
    cap: number;
    foldWords: number;
    engineVersion: string;
}, suppliedCost?: Cost): AssertionModule;
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