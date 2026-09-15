/** Transport-neutral resource descriptors; a caller may register them with its own MCP server. */
export declare const RESOURCES: readonly [{
    readonly uri: "quality://v2/assertion-zoo";
    readonly name: "V2 Assertion Taxonomy and Composition Contract";
    readonly description: "Assertion families and the declared guarantees of interoperable quality modules.";
    readonly mimeType: "application/json";
}];
export declare function readResource(uri: string): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
} | undefined;
//# sourceMappingURL=resources.d.ts.map