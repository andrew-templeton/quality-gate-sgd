import type { Cost, Interval, Observation } from './types.js';
export declare function requireThat(condition: unknown, message: string): asserts condition;
export declare function text(value: unknown, label: string): asserts value is string;
export declare function finite(value: number, label: string): void;
export declare function unique(values: string[], label: string): void;
export declare function validateCost(cost: Cost): void;
export declare function validateInterval(value: Interval): void;
export declare function digest(value: unknown): string;
/** Only use on JSON input/metadata, never an AbortSignal or a live client. */
export declare function freezeJson<T>(value: T): T;
export declare function validateObservation(value: Observation): void;
//# sourceMappingURL=validation.d.ts.map