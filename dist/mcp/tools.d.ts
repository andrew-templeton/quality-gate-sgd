/**
 * MCP Tool Handlers
 * =================
 * Implements the tool handlers for the MCP server.
 */
export declare const TOOLS: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            coverageOnly: {
                type: string;
                description: string;
                default: boolean;
            };
            granularity?: undefined;
            limit?: undefined;
            topic?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            granularity: {
                type: string;
                enum: string[];
                description: string;
                default: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            coverageOnly: {
                type: string;
                description: string;
                default: boolean;
            };
            topic?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            coverageOnly?: undefined;
            granularity?: undefined;
            limit?: undefined;
            topic?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            topic: {
                type: string;
                description: string;
            };
            coverageOnly?: undefined;
            granularity?: undefined;
            limit?: undefined;
        };
        required: string[];
    };
})[];
interface RunArguments {
    coverageOnly?: boolean;
}
interface ScoreArguments {
    coverageOnly?: boolean;
}
interface SuggestArguments {
    granularity?: 'dimension' | 'file' | 'symbol';
    limit?: number;
    coverageOnly?: boolean;
}
interface ExplainArguments {
    topic: string;
}
export declare function handleRun(args: RunArguments): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleScore(args: ScoreArguments): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleSuggest(args: SuggestArguments): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleTrajectory(): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare function handleExplain(args: ExplainArguments): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export {};
//# sourceMappingURL=tools.d.ts.map