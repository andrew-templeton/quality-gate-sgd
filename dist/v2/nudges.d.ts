import type { Nudge } from './types.js';
export declare function validateNudge(nudge: Nudge): void;
export declare function conflictReasons(a: Nudge, b: Nudge): string[];
/** Conservative partial resolution. Overlapping benefit intervals remain unresolved; this is not a global optimizer. */
export declare function planNudges(nudges: Nudge[], protectedAssertions?: string[]): {
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
//# sourceMappingURL=nudges.d.ts.map