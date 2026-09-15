import { BudgetLedger } from './budget.js';
import type { CompiledGate, Evaluation, EvaluationContext } from './types.js';
export declare function evaluateGate(gate: CompiledGate, input: Omit<EvaluationContext, 'signal'>, budget: BudgetLedger, options?: {
    timeoutMs?: number;
}): Promise<Evaluation>;
//# sourceMappingURL=evaluate.d.ts.map