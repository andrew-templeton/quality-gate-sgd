import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const protocol = JSON.parse(await readFile(new URL('./protocol.json', import.meta.url), 'utf8'));
const coreNames = ['contracts', 'validation', 'catalog', 'evaluate', 'budget', 'decision', 'nudges', 'nudge-trace', 'finite-calibration', 'calibration', 'admission', 'loop', 'remediation', 'durability'];

export async function loadCore() {
  const parts = await Promise.all(coreNames.map(name => import(new URL(`../../../dist/v2/${name}.js`, import.meta.url))));
  return Object.assign({}, ...parts);
}

export async function runtimeManifest(core, directory = '../../../dist/v2/') {
  return Object.fromEntries(await Promise.all(coreNames.map(async name => {
    const url = new URL(`${directory}${name}.${directory.includes('/src/') ? 'ts' : 'js'}`, import.meta.url);
    return [name, core.digest(await readFile(url, 'utf8'))];
  })));
}

export function enumeratePopulation(definition = protocol.population) {
  return definition.a.flatMap(a => definition.b.flatMap(b => definition.total.flatMap(total => definition.color.map(color => ({
    id: `${a}:${b}:${total}:${color}`, data: { a, b, total, color },
    label: BigInt(a) + BigInt(b) === BigInt(total) ? 'acceptable' : 'unacceptable',
  })))));
}

/** Enumerate every deterministic outcome->action policy directly over executed rows; no Bayesian API calls. */
export function enumeratePolicies(rows, outcomeKey, payoffs, assessmentCost) {
  const outcomes = [...new Set(rows.map(row => row.outcomes[outcomeKey]))].sort();
  const actions = Object.keys(payoffs);
  const assignments = outcomes.reduce((policies, outcome) => policies.flatMap(policy => actions.map(action => ({ ...policy, [outcome]: action }))), [{}]);
  const scored = assignments.map(policy => ({ policy,
    grossUtility: rows.reduce((sum, row) => sum + payoffs[policy[row.outcomes[outcomeKey]]][row.label], 0) / rows.length,
  })).map(value => ({ ...value, utilityAfterCost: value.grossUtility - assessmentCost }));
  const maximum = Math.max(...scored.map(value => value.utilityAfterCost));
  return { outcomes, policiesExamined: scored.length, allPolicies: scored,
    maximumUtilityAfterCost: maximum, selected: scored.filter(value => Math.abs(value.utilityAfterCost - maximum) < 1e-10) };
}

function makeModel(rows, falseAccept, falseReject) {
  const states = [...new Set(rows.map(row => `${row.label}:${row.data.color}`))].sort();
  return { unit: protocol.decisions.unit, perspective: protocol.decisions.perspective, horizon: protocol.decisions.horizon,
    basis: 'Priors and likelihoods are exact frequencies in the executed finite census; error consequences are declared assumptions.',
    states: states.map(id => ({ id, prior: rows.filter(row => `${row.label}:${row.data.color}` === id).length / rows.length })),
    actions: [
      { id: 'accept', utility: Object.fromEntries(states.map(id => [id, id.startsWith('unacceptable:') ? -falseAccept : 0])) },
      { id: 'reject', utility: Object.fromEntries(states.map(id => [id, id.startsWith('acceptable:') ? -falseReject : 0])) },
    ] };
}

function makeExperiment(rows, mode, model, cost) {
  const outcomes = [...new Set(rows.map(row => row.outcomes[mode]))].sort();
  return { id: mode, unit: model.unit, cost, basis: `Actual ${mode} assertion verdicts on all finite members; ${protocol.decisions.conversion}`,
    outcomes: outcomes.map(id => ({ id, likelihood: Object.fromEntries(model.states.map(state => {
      const members = rows.filter(row => `${row.label}:${row.data.color}` === state.id);
      return [state.id, members.filter(row => row.outcomes[mode] === id).length / members.length];
    })) })) };
}

function compareDecision(core, rows, falseAccept, falseReject, cost) {
  const model = makeModel(rows, falseAccept, falseReject);
  const experiments = ['exact', 'approximate', 'color', 'constant'].map(mode => makeExperiment(rows, mode, model, cost));
  const payoffs = { accept: { acceptable: 0, unacceptable: -falseAccept }, reject: { acceptable: -falseReject, unacceptable: 0 } };
  const independent = Object.fromEntries(['none', ...experiments.map(value => value.id)].map(mode => [mode,
    enumeratePolicies(rows, mode, payoffs, mode === 'none' ? 0 : cost)]));
  const choice = core.chooseAssessment(model, experiments);
  const noAssessment = independent.none.maximumUtilityAfterCost;
  for (const value of choice.evaluations) {
    assert(Math.abs(value.currentUtility - noAssessment) < 1e-10);
    assert(Math.abs(value.expectedUtility - independent[value.experimentId].maximumUtilityAfterCost - cost) < 1e-10);
    assert(Math.abs(value.netValue - (independent[value.experimentId].maximumUtilityAfterCost - noAssessment)) < 1e-10);
  }
  const max = Math.max(noAssessment, ...experiments.map(value => independent[value.id].maximumUtilityAfterCost));
  const expected = max > noAssessment + 1e-10 ? experiments.filter(value => Math.abs(independent[value.id].maximumUtilityAfterCost - max) < 1e-10).map(value => value.id) : [];
  assert.deepEqual(choice.selected, expected);
  return { assumptions: { falseAcceptCost: falseAccept, falseRejectCost: falseReject, assessmentCost: cost }, model, experiments, choice,
    independentEnumeration: independent, noAssessment: { utility: noAssessment, additionalCost: 0, policy: independent.none.selected },
    independentlyAgrees: true };
}

function nudge(id, changes, effects, netBenefit) {
  return { id, assertionId: 'finite-arithmetic', instruction: `Apply the declared ${id} transformation to a disposable structured candidate.`,
    changes: changes.map(([variable, direction]) => ({ address: 'record', variable, direction })), reads: ['record'], writes: ['record'],
    effects, ...(netBenefit ? { netBenefit } : {}), costUpperBound: { repair_steps: 1 },
    remediation: { harnessId: 'finite-candidate-generator', prompt: 'Run only the named finite transformation, then evaluate both assertions.', verification: ['finite-arithmetic', 'finite-total-limit'] } };
}

export async function runDecisionProgram(core, options = {}) {
  const manifest = options.runtimeManifest ?? await runtimeManifest(core);
  const programDigest = core.digest(await readFile(new URL('./program.mjs', import.meta.url), 'utf8'));
  const implementationDigest = core.digest({ programDigest, contracts: manifest.contracts, validation: manifest.validation });
  const runtimeEnvironment = { node: process.version, platform: process.platform, architecture: process.arch };
  const environmentDigest = core.digest({ protocol, manifest, runtimeEnvironment });
  const members = enumeratePopulation(); assert.equal(members.length, 224);
  const meter = { assessment_steps: 0, proposal_steps: 0, repair_steps: 0 };
  const input = core.bindInput({ schemaId: 'quality-sgd.example-finite-record', schemaVersion: '1', capabilities: ['finite-integer-record'],
    schema: core.schema.object({ a: core.schema.number({ integer: true, minimum: 0, maximum: 3 }), b: core.schema.number({ integer: true, minimum: 0, maximum: 3 }),
      total: core.schema.number({ integer: true, minimum: 0, maximum: 6 }), color: core.schema.union(core.schema.literal('A'), core.schema.literal('B')) }) });
  const available = { schemas: ['quality-sgd.example-finite-record@1'], capabilities: ['finite-integer-record'] };
  const artifact = data => ({ id: 'finite-record', digest: core.digest(data), data });
  const makeAssertion = (mode, id = `finite-${mode}`) => core.defineAssertion({
    card: { id, version: '1', title: `Finite ${mode} predicate`, path: ['measurement', 'arithmetic'],
      claim: `Execute the declared ${mode} predicate on one schema-valid finite record.`,
      input: { schemas: [], capabilities: [], description: protocol.population.scope }, evidenceKind: 'deterministic',
      assumptions: ['Supplied integers describe the entire record; operations have the declared finite semantics.'],
      guarantees: ['The specified finite predicate is executed, or unavailable is retained.'],
      doesNotGuarantee: ['The predicate is an adequate verifier outside its stated arithmetic task; no reader or business validity is claimed.'],
      requires: [], costUpperBound: { assessment_steps: 1 }, calibration: { status: 'not-applicable', evidence: [], scope: protocol.population.scope } },
    implementation: { id: 'finite-decision-program', version: '1', digest: implementationDigest },
    configuration: { mode, faults: protocol.calibration.outage, protectedTotal: protocol.loops.protectedTotal },
    applicability: { population: protocol.population.scope, protocolDigest: core.digest(protocol), purpose: 'constructed-control-census' }, input,
    async evaluate(_context, data, config) {
      meter.assessment_steps++;
      if (config.mode === 'outage' && `${data.a}:${data.b}:${data.total}:${data.color}` === config.faults.throwOnCase) throw new Error('Preregistered fault injection: evaluator throws');
      if (config.mode === 'outage' && data.a === config.faults.unavailableWhenA) return {
        status: 'unavailable', findings: [{ address: 'record', message: 'Preregistered unavailable-input stripe', evidence: [String(data.a)] }],
        evidence: ['configured-unavailable-stripe'], actualCost: { assessment_steps: 1 } };
      let pass;
      if (config.mode === 'exact' || config.mode === 'outage') pass = data.a + data.b === data.total;
      else if (config.mode === 'approximate') pass = data.total <= 3 && (data.a + data.b) % 2 === data.total % 2;
      else if (config.mode === 'color') pass = data.color === 'A';
      else if (config.mode === 'constant') pass = true;
      else if (config.mode === 'limit') pass = data.total <= config.protectedTotal;
      else throw new Error('Unknown finite evaluator mode');
      const loss = config.mode === 'exact' ? Math.abs(data.a + data.b - data.total) : pass ? 0 : 1;
      return { status: pass ? 'pass' : 'fail', findings: pass ? [] : [{ address: 'record', message: `${config.mode} predicate returned false`, evidence: [core.digest(data)] }],
        evidence: [`executed:${config.mode}:${core.digest(data)}`], loss: { lower: loss, upper: loss, unit: config.mode === 'exact' ? 'integer-distance' : 'predicate-defects' }, actualCost: { assessment_steps: 1 } };
    },
  });
  const makeGate = assertions => core.compileGate([{ id: 'finite-program', version: '1', includes: [], assertions }], ['finite-program'], { required: assertions.map(value => value.card.id), advisory: [] });
  const assertions = Object.fromEntries(['exact', 'approximate', 'outage', 'color', 'constant', 'limit'].map(mode => [mode, makeAssertion(mode)]));
  const gates = Object.fromEntries(Object.entries(assertions).map(([mode, assertion]) => [mode, makeGate([assertion])]));
  const censusProtocols = Object.fromEntries(protocol.calibration.variants.map(mode => {
    const evaluator = assertions[mode].contract;
    const contractDigest = core.digest({ gate: gates[mode].digest, environment: environmentDigest });
    return [mode, { id: `${protocol.id}:${mode}`, version: protocol.version, scope: protocol.population.scope,
      evaluatorDigest: evaluator.evaluatorDigest, applicabilityDigest: core.digest(evaluator.applicability),
      population: members.map(member => ({ id: member.id, inputDigest: core.digest({ contractDigest, artifact: artifact(member.data).digest, data: member.data, available }),
        label: member.label, labelEvidence: [`BigInt(${member.data.a})+BigInt(${member.data.b})===BigInt(${member.data.total})`]})),
      reference: { kind: 'mathematical-definition', description: protocol.population.reference, evidence: [`protocol:${core.digest(protocol)}`] },
      design: { kind: 'exhaustive-finite-population', weighting: 'uniform-within-label', dependence: protocol.population.sampling, evidenceUse: protocol.population.evidenceUse, registeredBeforeExecution: true },
      thresholds: { maximumFalseAcceptRate: protocol.calibration.maximumFalseAcceptRate, maximumFalseRejectRate: protocol.calibration.maximumFalseRejectRate },
      consequences: { unit: protocol.decisions.unit, falseAccept: protocol.decisions.falseAcceptCost, falseReject: protocol.decisions.falseRejectCost, basis: 'Declared pedagogical error costs, not measured operator preferences or financial loss.' } }];
  }));
  const registration = { schemaVersion: '1', protocol, protocolDigest: core.digest(protocol), programDigest, runtimeManifest: manifest, runtimeEnvironment, environmentDigest,
    evaluatorContracts: Object.fromEntries(Object.entries(assertions).map(([mode, assertion]) => [mode, assertion.contract])), censusProtocols,
    timingAttestation: 'Constructed in memory before dispatch. If the CLI is used, written before dispatch. Digests do not establish an independently trusted registration time.' };
  await options.onRegistered?.(registration);
  const observations = []; const rows = members.map(member => ({ ...member, outcomes: { none: 'no-assessment' } }));
  const census = {};
  for (const [mode, assertion] of Object.entries(assertions)) {
    const modeObservations = [];
    for (const row of rows) {
      if (mode === 'outage' && row.id === protocol.calibration.outage.skipCase) continue;
      const budget = new core.BudgetLedger({ assessment_steps: 1 });
      const evaluation = await core.evaluateGate(gates[mode], { artifact: artifact(row.data), environmentDigest, available }, budget);
      const result = evaluation.results[0];
      row.outcomes[mode] = result.status;
      const observation = { caseId: row.id, inputDigest: evaluation.inputDigest, evaluatorDigest: assertion.contract.evaluatorDigest,
        verdict: result.status === 'pass' ? 'accept' : result.status === 'fail' ? 'reject' : 'unavailable',
        evidence: [`host-evaluation:${core.digest(evaluation)}`, ...result.evidence], actualCost: evaluation.budget.spent,
        ...(result.status === 'unavailable' ? { reason: result.reason ?? result.findings.map(value => value.message).join('; ') } : {}) };
      modeObservations.push(observation);
      observations.push({ mode, ...observation, result, budget: evaluation.budget });
    }
    if (censusProtocols[mode]) census[mode] = core.assessFiniteVerifier(censusProtocols[mode], modeObservations, assertion.contract);
  }
  const decision = compareDecision(core, rows, protocol.decisions.falseAcceptCost, protocol.decisions.falseRejectCost, protocol.decisions.assessmentCost);
  const executeSelectedPolicy = async (cost, name) => {
    const model = compareDecision(core, rows, protocol.decisions.falseAcceptCost, protocol.decisions.falseRejectCost, cost);
    const mode = model.choice.selected[0];
    const before = meter.assessment_steps;
    const executions = [];
    for (const row of rows) {
      let action = model.noAssessment.policy[0].policy['no-assessment'];
      let observation = null;
      if (mode) {
        const evaluation = await core.evaluateGate(gates[mode], { artifact: artifact(row.data), environmentDigest, available }, new core.BudgetLedger({ assessment_steps: 1 }));
        const result = evaluation.results[0];
        const assessment = model.choice.evaluations.find(value => value.experimentId === mode);
        const conditional = assessment.outcomes.find(value => value.id === result.status);
        assert(conditional && conditional.actions.length > 0);
        action = conditional.actions[0];
        observation = { evaluatorDigest: assertions[mode].contract.evaluatorDigest, inputDigest: evaluation.inputDigest, result, budget: evaluation.budget };
      }
      const consequence = action === 'accept' && row.label === 'unacceptable' ? protocol.decisions.falseAcceptCost
        : action === 'reject' && row.label === 'acceptable' ? protocol.decisions.falseRejectCost : 0;
      executions.push({ caseId: row.id, action, consequence, observation });
    }
    const assessmentSteps = meter.assessment_steps - before;
    const grossUtility = -executions.reduce((sum, value) => sum + value.consequence, 0) / rows.length;
    const netUtility = grossUtility - assessmentSteps / rows.length * cost;
    const independentlyExpected = model.independentEnumeration[mode ?? 'none'].maximumUtilityAfterCost;
    assert(Math.abs(netUtility - independentlyExpected) < 1e-10);
    return { name, scope: 'Actual policy execution over the same reused finite census; no independent holdout or prospective population claim.',
      choice: model.choice.kind, selected: mode ?? null, assessmentSteps, proposalSteps: 0, repairSteps: 0,
      utilityCostPerAssessmentStep: cost, grossUtility, netUtility, independentlyExpected, independentlyAgrees: true, executions };
  };
  const selectedPolicyRuns = [await executeSelectedPolicy(0.1, 'assess-exact'), await executeSelectedPolicy(0.3, 'no-assessment')];
  const sensitivity = protocol.decisions.sensitivityFalseAcceptCosts.flatMap(accept => protocol.decisions.sensitivityFalseRejectCosts.flatMap(reject => protocol.decisions.sensitivityAssessmentCosts.map(cost => {
    const result = compareDecision(core, rows, accept, reject, cost);
    return { ...result.assumptions, kind: result.choice.kind, selected: result.choice.selected, noAssessmentUtility: result.noAssessment.utility,
      netValues: Object.fromEntries(result.choice.evaluations.map(value => [value.experimentId, value.netValue])), independentlyAgrees: result.independentlyAgrees };
  })));
  const unitRejection = (() => {
    try { core.assessExperiment(decision.model, { ...decision.experiments[0], unit: 'milliseconds' }); return 'UNEXPECTED: accepted'; }
    catch (error) { return error.message; }
  })();
  assert.match(unitRejection, /units must agree/);
  const lookup = new Map(rows.map(row => [row.id, row]));
  const transformations = {
    'restore-total': value => ({ ...value, total: value.a + value.b }),
    'clamp-total': value => ({ ...value, total: Math.min(value.a + value.b, protocol.loops.protectedTotal) }),
    'change-color': value => ({ ...value, color: value.color === 'A' ? 'B' : 'A' }),
  };
  const responseSurface = Object.fromEntries(Object.entries(transformations).map(([name, transform]) => {
    const outcomes = rows.map(row => {
      const transformed = transform(row.data); const key = `${transformed.a}:${transformed.b}:${transformed.total}:${transformed.color}`;
      const after = lookup.get(key); assert(after);
      return { caseId: row.id, transformedCaseId: key, beforeArithmetic: row.outcomes.exact, afterArithmetic: after.outcomes.exact,
        beforeProtected: row.outcomes.limit, afterProtected: after.outcomes.limit };
    });
    return [name, { evidenceBasis: 'Exhaustive response table of actual current host evaluations composed with an explicit deterministic transformation.',
      identificationScope: 'Only the declared finite program where these transformations are interventions on mutable input fields and the executed predicates are the complete outcome functions. No observational-to-business causal inference.',
      members: outcomes.length, arithmeticRepairs: outcomes.filter(value => value.beforeArithmetic === 'fail' && value.afterArithmetic === 'pass').length,
      arithmeticRegressions: outcomes.filter(value => value.beforeArithmetic === 'pass' && value.afterArithmetic === 'fail').length,
      protectedRegressions: outcomes.filter(value => value.beforeProtected === 'pass' && value.afterProtected === 'fail').length,
      unchangedArithmetic: outcomes.filter(value => value.beforeArithmetic === value.afterArithmetic).length,
      outcomeDigest: core.digest(outcomes), outcomes }];
  }));
  const effect = (direction, basis = 'hypothesis', evidence = []) => ({ assertionId: 'finite-arithmetic', direction, basis, evidence });
  const measuredComparison = targetId => {
    const before = observations.find(value => value.mode === 'exact' && value.caseId === '3:3:0:A');
    const after = observations.find(value => value.mode === 'exact' && value.caseId === targetId);
    assert(before && after && before.result.loss && after.result.loss);
    const measuredGain = before.result.loss.lower - after.result.loss.upper;
    return { sourceCaseId: before.caseId, targetCaseId: after.caseId, beforeLoss: before.result.loss, afterLoss: after.result.loss,
      measuredGain, assumedRepairSteps: 1, assumedUtilityCostPerRepairStep: 1, conditionalNetBenefit: measuredGain - 1,
      evidence: [...before.evidence, ...after.evidence], interpretation: 'Measured predicate differences in the finite response table; utility and one-step repair cost are declared planning assumptions.' };
  };
  const measuredComparisons = { raiseTotal: measuredComparison('3:3:3:A'), reduceA: measuredComparison('1:3:0:A') };
  const positive = nudge('raise-total-to-three', [['total', 1]], [effect('improves', 'observed', measuredComparisons.raiseTotal.evidence)],
    { lower: measuredComparisons.raiseTotal.conditionalNetBenefit, upper: measuredComparisons.raiseTotal.conditionalNetBenefit, unit: 'declared-utility-points' });
  const lesser = nudge('reduce-a-to-one', [['a', -1]], [effect('improves', 'observed', measuredComparisons.reduceA.evidence)],
    { lower: measuredComparisons.reduceA.conditionalNetBenefit, upper: measuredComparisons.reduceA.conditionalNetBenefit, unit: 'declared-utility-points' });
  const protectedNudge = nudge('restore-total', [['total', 1]], [effect('improves', 'identified', [responseSurface['restore-total'].outcomeDigest]),
    { assertionId: 'finite-total-limit', direction: 'worsens', basis: 'observed', evidence: ['3:3:0:A -> 3:3:6:A; total limit regresses'] }], { lower: 5, upper: 5, unit: 'declared-utility-points' });
  const opposite = nudge('lower-total', [['total', -1]], [effect('unknown')], { lower: 1, upper: 3, unit: 'declared-utility-points' });
  const color = nudge('change-color', [['color', 1]], [effect('improves')]);
  const context = { artifactDigest: artifact(protocol.loops.baseline).digest, scope: '3:3:0:A; declared utility = reduction in integer-distance minus one point per executed repair step; protected total <=3. Bounds here are constructed exact values, not confidence intervals.' };
  const conflicts = {
    dominance: core.traceNudgePlan([positive, lesser], [], context),
    overlap: core.traceNudgePlan([positive, opposite], [], context),
    incomparable: core.traceNudgePlan([positive, { ...lesser, netBenefit: { lower: 1, upper: 1, unit: 'milliseconds' } }], [], context),
    protected: core.traceNudgePlan([positive, protectedNudge], ['finite-total-limit'], context),
    hypothesis: core.traceNudgePlan([color], [], context),
    identifiedScope: core.traceNudgePlan([protectedNudge], [], context),
  };
  const gate = makeGate([makeAssertion('exact', 'finite-arithmetic'), makeAssertion('limit', 'finite-total-limit')]);
  const runLoop = async scenario => {
    const before = { ...meter };
    const proposal = (id = 'attempt-repair') => nudge(id, id === 'attempt-1' ? [['total', 1]] : [['a', -1], ['b', -1], ['total', 1]], [effect('improves')]);
    const options = { gate, artifact: artifact(protocol.loops.baseline), environmentDigest, available,
      budget: new core.BudgetLedger(scenario === 'repair-budget' ? { ...protocol.loops.limits, repair_steps: 1 } : protocol.loops.limits),
      admission: { gate: gate.policy, objectives: { 'finite-arithmetic': 0 }, reversalMultiplier: 2, cooldownRounds: 1, maxStalledRounds: scenario === 'color-hypothesis' ? 1 : 3 },
      maxRounds: scenario === 'round-limit' ? 1 : protocol.loops.maxRounds, proposalCostUpperBound: { proposal_steps: 1 },
      async propose({ round }) {
        meter.proposal_steps++;
        return { nudges: scenario === 'unresolved' ? [positive, opposite] : scenario === 'color-hypothesis' ? [color] : [proposal(`attempt-${round}`)], actualCost: { proposal_steps: 1 } };
      },
      ...(scenario === 'disabled-remedy' ? { harnesses: [{ id: 'finite-candidate-generator', run: async () => { throw new Error('Disabled harness must never execute'); } }] } : {
        async candidateGenerator({ artifact: prior, nudge: proposed }) {
          meter.repair_steps++;
          const data = scenario === 'color-hypothesis' ? { ...prior.data, color: 'B' }
            : proposed.id === 'attempt-1' ? { ...prior.data, total: 6 } : { a: 1, b: 2, total: 3, color: 'A' };
          return { artifact: artifact(data), actualCost: { repair_steps: 1 } };
        },
      }),
    };
    const result = await core.runQualityLoop(options);
    const actualInvocations = Object.fromEntries(Object.entries(meter).map(([unit, amount]) => [unit, amount - before[unit]]));
    for (const [unit, amount] of Object.entries(actualInvocations)) assert.equal(result.budget.spent[unit] ?? 0, amount);
    assert.equal(result.rounds, result.events.filter(event => event.phase === 'proposal').length);
    return { scenario, actualInvocations, accountingMatchesInvocations: true, ...result };
  };
  const loops = [];
  for (const scenario of ['repair-after-protected-rejection', 'unresolved', 'repair-budget', 'round-limit', 'disabled-remedy', 'color-hypothesis']) loops.push(await runLoop(scenario));
  const uncertainty = { assumptions: protocol.decisions.uncertainty,
    exactNetValueRange: { lower: 32 / 224 * protocol.decisions.uncertainty.falseRejectCost[0] - protocol.decisions.uncertainty.assessmentCost[1],
      upper: 32 / 224 * protocol.decisions.uncertainty.falseRejectCost[1] - protocol.decisions.uncertainty.assessmentCost[0] },
    conclusion: 'Range crosses zero: no robust assess-versus-stop choice over these declared cost assumptions. Request an operator tradeoff or retain the unresolved choice.' };
  // This adapter intentionally invokes the sample API in exploratory mode but does not publish its inapplicable IID bounds.
  const sampleApi = core.assessVerifierCalibration({ id: 'finite-program-sampling-api-audit', version: '1', evaluatorVersion: assertions.exact.contract.evaluatorDigest,
    datasetId: core.digest(members), scope: protocol.population.scope, plannedCases: members.length, minimumPerClass: 1, alpha: 0.05,
    maximumFalseAcceptRate: 0, maximumFalseRejectRate: 0, mode: 'exploratory' },
  rows.map(row => ({ id: row.id, label: row.label, verdict: row.outcomes.exact === 'pass' ? 'accept' : 'reject' })), { priorAnalyses: 1, adaptedUsingTheseCases: true, independentUnits: false });
  const body = { schemaVersion: '1', kind: 'executed-finite-decision-program', registrationDigest: core.digest(registration), protocolDigest: core.digest(protocol),
    runtimeManifest: manifest, runtimeEnvironment, programDigest, population: { members: members.length, acceptable: members.filter(row => row.label === 'acceptable').length, unacceptable: members.filter(row => row.label === 'unacceptable').length, scope: protocol.population.scope },
    census, samplingApiAudit: { status: sampleApi.status, evidenceUse: sampleApi.evidenceUse, applicability: 'Binomial sample bounds intentionally omitted: this design is a reused constructed census, not IID sampling.' },
    decision, selectedPolicyRuns, sensitivity, uncertainty, unitRejection, missingModel: core.chooseAssessment(null, []), conflicts, measuredComparisons, responseSurface, loops,
    observationsDigest: core.digest(observations), totalMeasuredInvocations: meter,
    costInterpretation: 'All dispatch, proposal and repair counts were executed locally. No paid model, token or currency cost was incurred or inferred. Utility conversion is an operator assumption. Wall time, power and machine purchase cost were not measured.',
    limitations: protocol.claimsExcluded };
  return { registration, observations, report: { ...body, digest: core.digest(body) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDirectory = process.argv[2];
  if (!outputDirectory) throw new Error('Usage: node examples/v2/decision-program/program.mjs <new-output-directory>');
  await mkdir(outputDirectory, { recursive: false });
  const core = await loadCore();
  const save = async (name, value) => writeFile(resolve(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  const result = await runDecisionProgram(core, { onRegistered: registration => save('registration.json', registration) });
  await save('observations.json', result.observations);
  await save('report.json', result.report);
  console.log(JSON.stringify({ outputDirectory: resolve(outputDirectory), reportDigest: result.report.digest, population: result.report.population,
    census: Object.fromEntries(Object.entries(result.report.census).map(([key, value]) => [key, { status: value.status, falseAccept: value.falseAccept, falseReject: value.falseReject }])),
    assessment: result.report.decision.choice.selected, invocations: result.report.totalMeasuredInvocations,
    loops: result.report.loops.map(value => ({ scenario: value.scenario, stopReason: value.stopReason, rounds: value.rounds, actualInvocations: value.actualInvocations })) }, null, 2));
}
