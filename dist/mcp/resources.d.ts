/**
 * MCP Resource Handlers
 * =====================
 * Implements the resource handlers for the MCP server.
 */
export declare const RESOURCES: {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}[];
export declare function handleDimensionsResource(): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
};
export declare function handleRulesResource(): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
};
export declare function handleFitnessResource(): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
};
export declare function handleConvergenceResource(): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
};
export declare function handleGeometryResource(): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
};
export declare function readResource(uri: string): {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
} | undefined;
//# sourceMappingURL=resources.d.ts.map