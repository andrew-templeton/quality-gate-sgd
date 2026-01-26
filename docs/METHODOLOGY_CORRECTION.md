# Methodology Correction: Scientific Approach

## Problem Statement

Initial implementation (Phase 1) confounded multiple variables:
- Static code extraction vs agentic tool use
- One-shot reasoning vs iterative exploration
- Different prompting strategy

**Result:** Not comparable to SWE-bench leaderboard baselines.

## Correct Scientific Approach

### Minimal Instrumentation Principle

To isolate the quality gate effect, we must:

1. ✅ Use proven harness (SWE-agent or mini-swe-agent)
2. ✅ Preserve all tools, prompts, iteration patterns
3. ✅ Add ONLY quality gate as treatment
4. ✅ Use current frontier models (GPT-5.2, Opus 4.5, Gemini 3)

### Chosen Harness: Mini-SWE-agent

**Why mini-swe-agent:**
- 100 lines of code (easy to instrument)
- Bash-only (no complex tool implementation)
- Scores 74% on SWE-bench Verified
- Open source, well-documented
- Used by Live-SWE-agent as base

**Repository:** https://github.com/SWE-agent/mini-swe-agent

### Quality Gate Instrumentation

**Hook point:** Before patch submission

```typescript
// Baseline (existing mini-swe-agent)
function agentLoop(task: SWEBenchTask): Patch {
  let trajectory = [];

  while (!solved && attempts < MAX_ATTEMPTS) {
    const action = llm(systemPrompt, trajectory);
    const result = executeBash(action);
    trajectory.push({ action, result });

    if (action.includes("submit")) {
      return extractPatch(trajectory);
    }
  }
}

// Treatment (+ Quality Gate)
function agentLoopWithQualityGate(task: SWEBenchTask): Patch {
  let trajectory = [];

  while (!solved && attempts < MAX_ATTEMPTS) {
    const action = llm(systemPrompt, trajectory);

    // INSTRUMENTATION: Quality gate before submission
    if (action.includes("submit")) {
      const reasoning = extractReasoning(trajectory);
      const quality = evaluateQuality(reasoning); // 5 dimensions

      if (quality.overall < THRESHOLD) {
        const feedback = generateFeedback(quality);
        const result = `QUALITY GATE REJECTED: ${feedback}`;
        trajectory.push({ action, result });
        continue; // Force refinement
      }
    }

    const result = executeBash(action);
    trajectory.push({ action, result });

    if (action.includes("submit") && qualityPassed) {
      return extractPatch(trajectory);
    }
  }
}
```

## Experimental Design

### Conditions

| Condition | Harness | Quality Gate | Model | Expected |
|-----------|---------|--------------|-------|----------|
| Baseline | mini-swe-agent | ✗ | GPT-5.2 | ~74% |
| Treatment A | mini-swe-agent | ✓ | GPT-5.2 | 74-85%? |
| Treatment B | mini-swe-agent | ✓ | Opus 4.5 | Higher |

### Hypothesis

**H1 (Quality Gate Effect):**
- Adding quality gate improves pass rate by ≥5pp
- p < 0.05 on 50 tasks per condition

**H2 (Reasoning Quality Predicts Success):**
- Quality scores correlate with patch success (ρ > 0.3)

### Sample Size

- **Pilot:** 20 tasks (10 baseline, 10 treatment) - Quick signal
- **Powered:** 100 tasks (50 baseline, 50 treatment) - Statistical power
- **Stratified:** By repo, test complexity

## Implementation Steps

### Phase 1: Integrate Mini-SWE-agent (1 day)

1. Clone mini-swe-agent repository
2. Wrap in TypeScript adapter
3. Validate baseline matches published 74%

### Phase 2: Instrument Quality Gate (0.5 day)

1. Hook submission action
2. Extract reasoning from trajectory
3. Evaluate with existing 5-dimension scorer
4. Provide feedback on rejection

### Phase 3: Run Experiments (2-3 days)

1. Baseline: 50 tasks with mini-swe-agent + GPT-5.2
2. Treatment: 50 tasks with quality gate + GPT-5.2
3. Statistical analysis

### Phase 4: Analysis & Publication (1 day)

1. Compute pass rates, t-test
2. Correlation analysis (quality scores vs success)
3. Cost analysis (iterations, API calls)
4. Write paper: "Quality-Gated Reasoning Improves SWE-bench Performance"

## What Changes from Current Implementation

### Keep ✅
- Quality gate evaluator (5 dimensions)
- Feedback generation
- Statistical analysis tools
- Docker evaluation infrastructure

### Replace ❌
- Static code extraction → Use bash tools in harness
- Custom iteration loop → Use mini-swe-agent's loop
- Direct reasoning extraction → Extract from trajectory
- Custom prompts → Use mini-swe-agent's proven prompts

### Add ➕
- Mini-swe-agent integration
- Trajectory parsing
- Submission hook
- Rejection/feedback mechanism

## Timeline

- **Day 1:** Integrate mini-swe-agent, validate baseline
- **Day 2:** Instrument quality gate, test on 5 tasks
- **Day 3-4:** Run pilot (20 tasks), analyze
- **Day 5-6:** Run powered experiment (100 tasks)
- **Day 7:** Analysis, write results

**Total:** 1 week to publication-ready results

## Success Criteria

**Minimum publishable:**
- Δpass rate ≥ 5pp (e.g., 74% → 79%)
- p < 0.05
- Quality dimensions correlate with success

**Strong result:**
- Δpass rate ≥ 10pp (e.g., 74% → 84%)
- p < 0.01
- Cost per success < 2x baseline

**Breakthrough:**
- Δpass rate ≥ 15pp (e.g., 74% → 89%)
- Approaches or exceeds Opus 4.5's 80.9%
- Generalizes across models (GPT-5.2, Opus 4.5, Gemini 3)

## Why This Is Publishable

1. **Directly comparable:** Same harness, models, tasks as leaderboard
2. **Minimal change:** Only quality gate differs
3. **Reproducible:** Uses open-source mini-swe-agent
4. **Novel contribution:** First to apply Bayesian reasoning quality gate
5. **Clear attribution:** Can say "X% improvement over mini-swe-agent baseline"

## References

- [SWE-agent](https://github.com/SWE-agent/SWE-agent) - Main harness
- [Mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) - 100-line baseline
- [Live-SWE-agent](https://github.com/OpenAutoCoder/live-swe-agent) - Self-evolving variant
- [SWE-bench Verified Leaderboard](https://llm-stats.com/benchmarks/swe-bench-verified)
- [Claude Opus 4.5 Results](https://www.theunwindai.com/p/claude-opus-4-5-scores-80-9-on-swe-bench)
- [GPT-5.2 Release](https://openai.com/index/introducing-gpt-5-2/)
