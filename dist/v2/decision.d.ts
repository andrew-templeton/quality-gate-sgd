export interface DecisionModel {
    unit: string;
    perspective: string;
    horizon: string;
    basis: string;
    states: {
        id: string;
        prior: number;
    }[];
    /** Every action must be feasible in every modeled state. */
    actions: {
        id: string;
        utility: Record<string, number>;
    }[];
}
export interface AssessmentExperiment {
    id: string;
    unit: string;
    cost: number;
    basis: string;
    outcomes: {
        id: string;
        likelihood: Record<string, number>;
    }[];
}
/** Finite one-assessment EVSI under supplied priors/likelihoods. No inferred causal effect or global policy optimality. */
export declare function assessExperiment(model: DecisionModel, experiment: AssessmentExperiment): {
    kind: "modeled-one-step";
    experimentId: string;
    unit: string;
    currentUtility: number;
    currentActions: string[];
    outcomes: ({
        id: string;
        probability: number;
        posterior: null;
        utility: null;
        actions: string[];
        entropy: null;
    } | {
        id: string;
        probability: number;
        posterior: {
            [k: string]: number;
        };
        utility: number;
        actions: string[];
        entropy: number;
    })[];
    expectedUtility: number;
    grossValue: number;
    cost: number;
    netValue: number;
    informationGainBits: number;
    limitation: string;
};
export declare function chooseAssessment(model: DecisionModel | null, experiments: AssessmentExperiment[]): {
    kind: "insufficient-model";
    selected: string[];
    reason: string;
    evaluations?: undefined;
} | {
    kind: "assess" | "stop";
    selected: string[];
    evaluations: {
        kind: "modeled-one-step";
        experimentId: string;
        unit: string;
        currentUtility: number;
        currentActions: string[];
        outcomes: ({
            id: string;
            probability: number;
            posterior: null;
            utility: null;
            actions: string[];
            entropy: null;
        } | {
            id: string;
            probability: number;
            posterior: {
                [k: string]: number;
            };
            utility: number;
            actions: string[];
            entropy: number;
        })[];
        expectedUtility: number;
        grossValue: number;
        cost: number;
        netValue: number;
        informationGainBits: number;
        limitation: string;
    }[];
    reason?: undefined;
};
//# sourceMappingURL=decision.d.ts.map