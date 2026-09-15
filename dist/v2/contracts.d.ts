import type { Assertion, AssertionCard, EvaluationContext, Observation } from './types.js';
/** Deliberately bounded schema algebra; unsupported keywords cannot be silently ignored. */
export type SchemaNode = {
    kind: 'json';
} | {
    kind: 'string';
    minLength?: number;
} | {
    kind: 'number';
    integer?: boolean;
    minimum?: number;
    maximum?: number;
} | {
    kind: 'boolean';
} | {
    kind: 'literal';
    value: string | number | boolean | null;
} | {
    kind: 'array';
    items: SchemaNode;
    minItems?: number;
    maxItems?: number;
} | {
    kind: 'object';
    properties: Record<string, SchemaNode>;
    optional: string[];
    additionalProperties: boolean;
} | {
    kind: 'union';
    variants: SchemaNode[];
};
export interface ValueSchema<T> {
    readonly definition: SchemaNode;
    readonly valueType?: T;
}
export type SchemaValue<S> = S extends ValueSchema<infer T> ? T : never;
export declare const schema: {
    json: () => ValueSchema<unknown>;
    string: (options?: {
        minLength?: number;
    }) => ValueSchema<string>;
    number: (options?: {
        integer?: boolean;
        minimum?: number;
        maximum?: number;
    }) => ValueSchema<number>;
    boolean: () => ValueSchema<boolean>;
    literal: <T extends string | number | boolean | null>(value: T) => ValueSchema<T>;
    array: <T>(items: ValueSchema<T>, options?: {
        minItems?: number;
        maxItems?: number;
    }) => ValueSchema<T[]>;
    object: <S extends Record<string, ValueSchema<unknown>>>(properties: S) => ValueSchema<{ [K in keyof S]: SchemaValue<S[K]>; }>;
    union: <S extends readonly ValueSchema<unknown>[]>(...variants: S) => ValueSchema<SchemaValue<S[number]>>;
};
export declare function validateSchema(node: SchemaNode): void;
export declare function parseSchema<T>(definition: ValueSchema<T>, input: unknown): T;
export interface InputContract {
    schemaId: string;
    schemaVersion: string;
    schema: SchemaNode;
    /** Own properties from artifact.data. Empty path binds the complete payload. */
    path: string[];
    capabilities: string[];
}
export interface InputBinding<T> extends InputContract {
    readonly valueType?: T;
}
export declare function bindInput<T>(options: {
    schemaId: string;
    schemaVersion: string;
    schema: ValueSchema<T>;
    path?: string[];
    capabilities?: string[];
}): InputBinding<T>;
export declare function inputSchemaKey(input: Pick<InputContract, 'schemaId' | 'schemaVersion'>): string;
export declare function validateInputContract(input: InputContract): void;
export declare function inputCompatibility(contract: InputContract, available: EvaluationContext['available']): {
    missingSchemas: string[];
    missingCapabilities: string[];
    declaredCompatible: boolean;
};
export declare function prepareInput<T>(contract: InputBinding<T>, context: Omit<EvaluationContext, 'signal'>): T;
export interface AssertionContract {
    protocol: 'quality-sgd.assertion/v1';
    implementation: {
        id: string;
        version: string;
        digest: string;
    };
    configuration: unknown;
    applicability: unknown;
    statementDigest: string;
    input: InputContract;
    evaluatorDigest: string;
}
export declare function evaluatorIdentity(contract: Omit<AssertionContract, 'evaluatorDigest'> | AssertionContract): string;
export declare function assertionStatement(card: AssertionCard): string;
export declare function validateAssertionContract(contract: AssertionContract): void;
/**
 * Semantic configuration is passed as a frozen snapshot, never as the caller's object.
 * Implementation identity is an integrity declaration, not attestation of honest JavaScript.
 * Evaluators must use the supplied configuration; undeclared mutable closure state violates this contract.
 */
export declare function defineAssertion<C, I>(definition: {
    card: AssertionCard;
    implementation: AssertionContract['implementation'];
    configuration: C;
    applicability: unknown;
    input: InputBinding<I>;
    evaluate(context: EvaluationContext, input: I, configuration: Readonly<C>): Promise<Observation>;
}): Assertion;
//# sourceMappingURL=contracts.d.ts.map