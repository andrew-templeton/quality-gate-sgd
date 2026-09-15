import { type SchemaValue } from './contracts.js';
import { type SourceCommitmentContract } from './commitments.js';
import { type SurfacePolicy } from './surfaces.js';
declare const audienceSchema: import("./contracts.js").ValueSchema<{
    id: string;
    background: string;
    decisionExperience: string;
    knownConcepts: string[];
    unfamiliarConcepts: string[];
}>;
declare const taskSchema: import("./contracts.js").ValueSchema<{
    id: string;
    decision: string;
    requiredCommitmentIds: string[];
    entryElementIds: string[];
}>;
declare const contractSchema: import("./contracts.js").ValueSchema<{
    version: "quality-sgd.communication-contract/v1";
    audience: {
        id: string;
        background: string;
        decisionExperience: string;
        knownConcepts: string[];
        unfamiliarConcepts: string[];
    };
    task: {
        id: string;
        decision: string;
        requiredCommitmentIds: string[];
        entryElementIds: string[];
    };
    sourceRevisionDigest: string;
    sourceReferenceDigest: string;
    fidelityMode: "structured-only" | "qualified-prose";
    surfacePolicyDigest: string;
    collectorDigest: string;
}>;
export type CommunicationAudience = SchemaValue<typeof audienceSchema>;
export type CommunicationTask = SchemaValue<typeof taskSchema>;
export type CommunicationContract = SchemaValue<typeof contractSchema>;
export declare const COMMUNICATION_INPUT: {
    schemas: string[];
    capabilities: string[];
};
export declare const COMMUNICATION_OUTPUT: import("./contracts.js").OutputBinding<{
    contractDigest: string;
    audienceId: string;
    taskId: string;
    sourceReferenceDigest: string;
    artifactDigest: string;
    renderDigest: string;
    fidelityMode: "structured-only" | "qualified-prose";
}>;
/** Freeze reviewed audience/task requirements before rendering or revising candidates. */
export declare function defineCommunicationContract(options: {
    audience: CommunicationAudience;
    task: CommunicationTask;
    source: SourceCommitmentContract;
    fidelityMode: CommunicationContract['fidelityMode'];
    surfacePolicy: SurfacePolicy;
}): CommunicationContract;
/**
 * A typed conjunctive handoff. This binds existing evidence; it does not add a comprehension
 * judgment, infer audience knowledge or average failures into a scalar quality score.
 */
export declare function communicationScopeModule(supplied: CommunicationContract): {
    id: string;
    version: string;
    includes: string[];
    assertions: import("./types.js").Assertion[];
};
export {};
//# sourceMappingURL=communication.d.ts.map