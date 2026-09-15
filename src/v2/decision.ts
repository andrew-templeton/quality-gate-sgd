import { finite, requireThat, text, unique } from './validation.js';

export interface DecisionModel {
  unit: string;
  perspective: string;
  horizon: string;
  basis: string;
  states: { id: string; prior: number }[];
  /** Every action must be feasible in every modeled state. */
  actions: { id: string; utility: Record<string, number> }[];
}
export interface AssessmentExperiment {
  id: string;
  unit: string;
  cost: number;
  basis: string;
  outcomes: { id: string; likelihood: Record<string, number> }[];
}
const tolerance = 1e-10;
function probability(value: number): void { requireThat(Number.isFinite(value) && value >= 0 && value <= 1, 'Probability must lie in [0,1]'); }
function distribution(values: number[]): void { values.forEach(probability); requireThat(Math.abs(values.reduce((a, b) => a + b, 0) - 1) <= tolerance, 'Probability mass must sum to one'); }
function exactKeys(value: Record<string, number>, ids: string[]): void { requireThat(Object.keys(value).length === ids.length && ids.every(id => Object.hasOwn(value, id)), 'Provide exactly one value per state'); }
function entropy(values: number[]): number { return -values.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0); }

/** Finite one-assessment EVSI under supplied priors/likelihoods. No inferred causal effect or global policy optimality. */
export function assessExperiment(model: DecisionModel, experiment: AssessmentExperiment) {
  for (const value of [model.unit, model.perspective, model.horizon, model.basis, experiment.id, experiment.basis]) text(value, 'Decision context');
  requireThat(model.unit === experiment.unit, 'Assessment cost and utility units must agree explicitly');
  requireThat(model.states.length > 0 && model.actions.length > 0 && experiment.outcomes.length > 0, 'Nonempty state/action/outcome spaces required');
  unique(model.states.map(state => state.id), 'State IDs'); unique(model.actions.map(action => action.id), 'Action IDs'); unique(experiment.outcomes.map(outcome => outcome.id), 'Outcome IDs');
  distribution(model.states.map(state => state.prior));
  finite(experiment.cost, 'Experiment cost'); requireThat(experiment.cost >= 0, 'Cost must be nonnegative');
  const ids = model.states.map(state => state.id);
  for (const action of model.actions) { exactKeys(action.utility, ids); Object.values(action.utility).forEach(value => finite(value, 'Utility')); }
  for (const outcome of experiment.outcomes) { exactKeys(outcome.likelihood, ids); Object.values(outcome.likelihood).forEach(probability); }
  ids.forEach(id => distribution(experiment.outcomes.map(outcome => outcome.likelihood[id])));
  const best = (belief: number[]) => {
    const options = model.actions.map(action => ({ id: action.id, value: model.states.reduce((sum, state, index) => sum + belief[index] * action.utility[state.id], 0) }));
    options.forEach(option => finite(option.value, 'Expected utility'));
    const value = Math.max(...options.map(option => option.value));
    return { value, actions: options.filter(option => Math.abs(option.value - value) <= tolerance).map(option => option.id) };
  };
  const priors = model.states.map(state => state.prior);
  const current = best(priors);
  const outcomes = experiment.outcomes.map(outcome => {
    const joints = model.states.map(state => state.prior * outcome.likelihood[state.id]);
    const p = joints.reduce((a, b) => a + b, 0);
    if (p === 0) return { id: outcome.id, probability: 0, posterior: null, utility: null, actions: [] as string[], entropy: null };
    const belief = joints.map(joint => joint / p); const choice = best(belief);
    return { id: outcome.id, probability: p, posterior: Object.fromEntries(ids.map((id, index) => [id, belief[index]])), utility: choice.value, actions: choice.actions, entropy: entropy(belief) };
  });
  const expectedUtility = outcomes.reduce((sum, outcome) => sum + outcome.probability * (outcome.utility ?? 0), 0);
  const grossValue = expectedUtility - current.value;
  const netValue = grossValue - experiment.cost;
  finite(netValue, 'Net information value');
  requireThat(grossValue >= -tolerance * Math.max(1, Math.abs(expectedUtility), Math.abs(current.value)), 'Numerically invalid information value');
  return {
    kind: 'modeled-one-step' as const, experimentId: experiment.id, unit: model.unit,
    currentUtility: current.value, currentActions: current.actions, outcomes, expectedUtility,
    grossValue, cost: experiment.cost, netValue,
    informationGainBits: entropy(priors) - outcomes.reduce((sum, outcome) => sum + outcome.probability * (outcome.entropy ?? 0), 0),
    limitation: 'Conditional on the supplied finite model; floating-point tolerance 1e-10. Information gain is not decision value. No population calibration or optimal multi-round policy is established.',
  };
}

export function chooseAssessment(model: DecisionModel | null, experiments: AssessmentExperiment[]) {
  if (!model) return { kind: 'insufficient-model' as const, selected: [] as string[], reason: 'Supply utility context, priors, feasible actions, payoffs and likelihoods before claiming optimal assessment value.' };
  unique(experiments.map(experiment => experiment.id), 'Experiment IDs');
  const evaluations = experiments.map(experiment => assessExperiment(model, experiment));
  const maximum = Math.max(0, ...evaluations.map(value => value.netValue));
  return { kind: maximum > tolerance ? 'assess' as const : 'stop' as const,
    selected: maximum > tolerance ? evaluations.filter(value => Math.abs(value.netValue - maximum) <= tolerance).map(value => value.experimentId) : [], evaluations };
}
