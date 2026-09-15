import type { AssertionModule, CompiledGate, GatePolicy } from './types.js';
export declare const ASSERTION_ZOO: readonly [{
    readonly path: readonly ["structure", "syntax"];
    readonly meaning: "Parse/type/schema predicates over supplied input.";
}, {
    readonly path: readonly ["structure", "references"];
    readonly meaning: "Reference integrity and current dependency ancestry.";
}, {
    readonly path: readonly ["measurement", "arithmetic"];
    readonly meaning: "Declared quantities, units, denominators and balance identities.";
}, {
    readonly path: readonly ["measurement", "regression"];
    readonly meaning: "Observed behavior on the executed test population.";
}, {
    readonly path: readonly ["meaning", "fidelity"];
    readonly meaning: "Preservation of source commitments and claim strength.";
}, {
    readonly path: readonly ["communication", "legibility"];
    readonly meaning: "Audience-relative introduction, density and comprehension.";
}, {
    readonly path: readonly ["communication", "geometry"];
    readonly meaning: "Rendered visibility and operation in tested states.";
}, {
    readonly path: readonly ["causality", "identification"];
    readonly meaning: "Audit of the assumptions that would support an intervention claim.";
}, {
    readonly path: readonly ["decision", "utility"];
    readonly meaning: "Conditional decisions under a supplied utility and likelihood model.";
}, {
    readonly path: readonly ["control", "reliability"];
    readonly meaning: "Evaluator calibration, freshness, budget and update eligibility.";
}];
export declare function compileGate(modules: AssertionModule[], selected: string[], policy: GatePolicy): CompiledGate;
/** Local metadata discovery. A declaration match is a candidate for validation, not proof of semantic compatibility. */
export declare function discoverAssertions(modules: AssertionModule[], available: {
    schemas: string[];
    capabilities: string[];
}, query?: string): {
    declaredCompatible: boolean;
    limitation: string;
    moduleId: string;
    card: import("./types.js").AssertionCard;
    matchesQuery: boolean;
    missingSchemas: string[];
    missingCapabilities: string[];
}[];
export declare function modelCard(gate: CompiledGate): object;
//# sourceMappingURL=catalog.d.ts.map