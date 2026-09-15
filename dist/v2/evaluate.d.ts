import { BudgetLedger } from './budget.js';
import type { CompiledGate, Evaluation, EvaluationContext } from './types.js';
import { DurableRun } from './durability.js';
export declare function evaluateGate(gate: CompiledGate, input: Omit<EvaluationContext, 'signal' | 'operationId'>, budget: BudgetLedger, options?: {
    timeoutMs?: number;
    durability?: DurableRun;
}): Promise<Evaluation>;
//# sourceMappingURL=evaluate.d.ts.map