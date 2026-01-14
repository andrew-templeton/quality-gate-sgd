# Research Direction

> Academic investigation of quality-guided descent for LLM coding agents

## Thesis

Deterministic quality gates create gradient descent-like optimization behavior when LLM agents iterate against them. This emerges from three properties of the quality function: quantitative measurement, determinism, and local continuity.

## Why Build in Public

**Pre-registration for causality**: By documenting our hypotheses, experimental design, and metric choices *before* running experiments, we defend against p-hacking concerns. The commit history serves as a timestamped ledger of our reasoning.

This approach follows open science best practices:
- Hypotheses stated a priori
- Experimental design documented before data collection
- All code and data publicly available
- Negative results reported alongside positive

## Research Questions

### RQ1: Convergence Behavior
Do LLM agents with quality gates converge faster than agents without?
- **Metric**: Iterations to pass quality gate
- **Baseline**: LLM with no quality feedback
- **Treatment**: LLM with quality-gate-sgd

### RQ2: Success Rate
Do quality gates improve task completion rate?
- **Metric**: % of tasks passing after N iterations
- **Baseline**: Same as RQ1
- **Treatment**: Same as RQ1

### RQ3: Quality Ceiling
Do quality gates improve final code quality beyond "just passing"?
- **Metric**: Final quality score distribution
- **Hypothesis**: Gate agents cluster near threshold; non-gate agents have higher variance

### RQ4: Topology Design
Which metric combinations create the smoothest descent?
- **Metric**: Descent smoothness (fewer oscillations, monotonic improvement)
- **Variables**: Different topology configurations

### RQ5: Target Granularity
Does file-level or symbol-level targeting improve convergence?
- **Metric**: Iterations to pass (τ_dim vs τ_file vs τ_symbol)
- **Variables**: Three granularity modes (dimension, file, symbol)
- **Hypothesis**: Finer granularity increases bias parameter p, leading to faster convergence
- **See**: [theory/DIFFERENTIABILITY.md](./theory/DIFFERENTIABILITY.md) Section 5

### RQ6: Cross-Dimension Value
Do targets affecting multiple dimensions provide more value than single-dimension targets?
- **Metric**: Correlation between dimensionsAffected count and actual ΔQ achieved
- **Hypothesis**: Targets with cross-dimension impact (coverage + errors + smells) converge faster than single-dimension targets
- **Analysis**: Stratify targets by number of dimensions affected, compare improvement per iteration

## Experimental Design

### Dataset
- **Source**: SWE-bench or similar LLM coding benchmark
- **Size**: 50-100 tasks minimum for statistical power
- **Selection**: Stratified by difficulty if available

### Protocol
```
For each task T:
  1. Reset to initial state
  2. Run agent for max_iterations or until pass
  3. Record trajectory: [(iteration, metrics, pass/fail), ...]
  4. Store final code state
```

### Conditions
| Condition | Quality Feedback | Max Iterations |
|-----------|------------------|----------------|
| Baseline | None | 50 |
| Treatment | quality-gate-sgd | 50 |

### Analysis
- **Primary**: Two-sample t-test on iterations-to-pass
- **Secondary**: Chi-squared on success rates
- **Exploratory**: Trajectory visualization, convergence curves

## Paper Outline

1. **Abstract**
2. **Introduction** — Problem: LLM code quality is stochastic
3. **Related Work** — RLHF, LLM agents, software quality
4. **Quality Geometry** — The theoretical framework (Section 3 of paper = theory/GEOMETRY.md)
5. **A Concrete Topology** — Our instantiation (Section 4 = theory/TOPOLOGY.md)
6. **Experiments** — SWE-bench evaluation
7. **Results** — RQ1-RQ6 findings
8. **Discussion** — Limitations, future topologies
9. **Conclusion**

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Framework (current) | 1-2 weeks | v0.2.0 release |
| Experiment setup | 1 week | Harness + pilot |
| Data collection | 2-3 weeks | Raw trajectories |
| Analysis | 1 week | Statistical results |
| Writing | 2-3 weeks | Arxiv preprint |

## Target Venues

1. **Arxiv** — Immediate, establishes priority
2. **NeurIPS LLM Agents Workshop** — If timing aligns
3. **ICSE/FSE** — Longer timeline, higher bar

---

*See [CHANGELOG.md](./CHANGELOG.md) for timestamped development history.*
*See [theory/GEOMETRY.md](./theory/GEOMETRY.md) for theoretical foundation.*
*See [theory/DIFFERENTIABILITY.md](./theory/DIFFERENTIABILITY.md) for discrete gradient computation.*
