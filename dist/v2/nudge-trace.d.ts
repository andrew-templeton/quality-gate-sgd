import type { Nudge } from './types.js';
export interface NudgeTraceContext {
    artifactDigest: string;
    scope: string;
}
/** Inspectable planning only. Evidence references do not authorize execution or establish causality. */
export declare function traceNudgePlan(nudges: Nudge[], protectedAssertions: string[], context: NudgeTraceContext): {
    digest: string;
    kind: "partial-nudge-resolution";
    context: {
        artifactDigest: string;
        scope: string;
    };
    protectedAssertions: string[];
    plan: {
        selected: Nudge[];
        deferred: {
            id: string;
            reason: string;
        }[];
        conflicts: {
            left: string;
            right: string;
            reasons: string[];
            preferred: string | null;
        }[];
    };
    entries: {
        id: string;
        status: "deferred" | "selected-for-consideration";
        reason: string;
        preferredOver: string[];
        unresolvedWith: string[];
        claimedEffects: {
            verifiedByPlanner: false;
            assertionId: string;
            direction: "improves" | "worsens" | "unknown";
            basis: "hypothesis" | "observed" | "identified";
            evidence: string[];
        }[];
        requiredFollowUp: string[];
        remedy: {
            executionAuthorized: false;
            harnessId: string;
            prompt: string;
            verification: string[];
        } | null;
    }[];
    conflicts: {
        resolution: "unresolved" | "conditional-preference";
        requiredFollowUp: string[];
        left: string;
        right: string;
        reasons: string[];
        preferred: string | null;
    }[];
    unresolved: {
        resolution: "unresolved" | "conditional-preference";
        requiredFollowUp: string[];
        left: string;
        right: string;
        reasons: string[];
        preferred: string | null;
    }[];
    executionAuthorized: false;
    scope: string;
};
//# sourceMappingURL=nudge-trace.d.ts.map