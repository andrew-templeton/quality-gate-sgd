import type { AssertionModule, CompiledGate } from './types.js';
/** Transport-neutral resource descriptors; a caller may register them with its own MCP server. */
export declare const RESOURCES: readonly [{
    readonly uri: "quality://v2/assertion-zoo";
    readonly name: "V2 Assertion Taxonomy and Composition Contract";
    readonly description: "Assertion families and the declared guarantees of interoperable quality modules.";
    readonly mimeType: "application/json";
}, {
    readonly uri: "quality://v2/assertion-catalog";
    readonly name: "Local Assertion Catalog";
    readonly description: "Caller-supplied modules, hierarchy, applicability and execution contracts.";
    readonly mimeType: "application/json";
}, {
    readonly uri: "quality://v2/composition-card";
    readonly name: "Selected Assertion Subset";
    readonly description: "Caller-supplied compiled composition with component guarantees and costs.";
    readonly mimeType: "application/json";
}];
export declare function readResource(uri: string, supplied?: {
    modules?: AssertionModule[];
    gate?: CompiledGate;
}): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
} | undefined;
//# sourceMappingURL=resources.d.ts.map