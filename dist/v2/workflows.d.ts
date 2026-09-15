import { assertionContext, compositionContext } from './context.js';
import { type InputContract, type OutputContract } from './contracts.js';
import type { Artifact, AssertionModule, GatePolicy } from './types.js';
/** Application inputs and outputs are both visible data ports at the quality-evaluation boundary. */
export interface WorkflowContract {
    id: string;
    inputs: InputContract[];
    outputs: InputContract[];
    capabilities: string[];
}
export interface WorkflowRequirement {
    id: string;
    description: string;
    mode: 'required' | 'optional';
    select: {
        /** Explicit alternatives, not a claim that equal names have equal implementations. */
        assertionIds?: string[];
        family?: string[];
        query?: string;
        /** Optional desired assertion evidence output; distinct from the application's output ports. */
        produces?: OutputContract;
    };
}
export interface WorkflowProblem {
    code: string;
    assertionId: string | null;
    message: string;
}
export interface WorkflowInputInspection {
    assertionId: string;
    missingSchemas: string[];
    missingCapabilities: string[];
    matchingPorts: Array<{
        side: 'input' | 'output';
        schema: string;
        path: string[];
    }>;
    runtime: 'not-supplied' | 'valid' | 'invalid';
    problems: WorkflowProblem[];
}
export interface WorkflowCandidate {
    moduleId: string;
    assertionId: string;
    matchReasons: string[];
    input: WorkflowInputInspection;
    context: ReturnType<typeof assertionContext> | null;
    problems: WorkflowProblem[];
}
export interface WorkflowProposal {
    id: string;
    selected: Array<{
        requirementId: string;
        moduleId: string;
        assertionId: string;
        mode: 'required' | 'optional';
    }>;
    omittedOptional: string[];
    modules: string[];
    policy: GatePolicy;
    status: 'declaration-compatible' | 'validated-inputs' | 'incomplete' | 'invalid';
    problems: WorkflowProblem[];
    orderedAssertions: string[];
    handoffs: Array<{
        from: string;
        to: string;
        name: string;
        schema: string;
        schemaDigest: string;
        status: 'contract-compatible-not-executed';
    }>;
    inputs: WorkflowInputInspection[];
    context: ReturnType<typeof compositionContext> | null;
    compiledDigest: string | null;
}
export interface WorkflowPlanOptions {
    workflow: WorkflowContract;
    requirements: WorkflowRequirement[];
    catalog: AssertionModule[];
    /** Pure validation only. Neither a runner nor a report collector is invoked. */
    sample?: {
        artifact: Artifact;
        environmentDigest: string;
    };
    limits: {
        maxAssignments: number;
        maxProposals: number;
    };
}
export declare function workflowAvailable(workflow: WorkflowContract): {
    schemas: string[];
    capabilities: string[];
};
/** Bounded local proposal enumeration. Its deterministic order is not a preference or optimality ranking. */
export declare function proposeWorkflowCompositions(supplied: WorkflowPlanOptions): {
    schemaVersion: string;
    workflow: WorkflowContract;
    workflowDigest: string;
    available: {
        schemas: string[];
        capabilities: string[];
    };
    requirements: {
        requirement: WorkflowRequirement;
        alternatives: WorkflowCandidate[];
        status: "candidates-for-inspection" | "unsupported";
    }[];
    unsupportedRequirements: {
        id: string;
        mode: "optional" | "required";
        reason: string;
    }[];
    proposals: WorkflowProposal[];
    enumeration: {
        consideredAssignments: number;
        totalAssignments: string;
        returnedProposals: number;
        complete: boolean;
        truncated: boolean;
        maxAssignments: number;
        maxProposals: number;
    };
    interpretation: string[];
};
//# sourceMappingURL=workflows.d.ts.map