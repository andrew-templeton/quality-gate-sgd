# The SGD Metaphor: A Mathematical Framework

## Abstract

This document provides the mathematical foundation for why deterministic quality gates create gradient descent-like behavior from stochastic LLM agents. We formalize the properties required for convergence and classify quality metrics by their suitability for this optimization framework.

## 1. The Core Theorem

### Statement

> Given a stochastic agent (like an LLM) iterating against a deterministic quality function Q(code) → ℝ, the agent's trajectory through code space exhibits stochastic gradient descent behavior when Q satisfies three properties: quantitative measurement, determinism, and local continuity.

### Intuition

In continuous optimization, SGD works because:
1. The gradient ∇f(x) points toward improvement
2. Random sampling provides exploration
3. Each step descends on average

With LLM agents and quality gates:
1. The quality function Q provides direction (what to fix)
2. The LLM's stochasticity provides exploration (how to fix)
3. The gate rejection creates descent pressure (fix it or fail)

## 2. Required Properties

### 2.1 Quantitative Measurement

The quality function Q must map code to numbers:

```
Q: Code → ℝⁿ
```

Where each dimension has a clear optimization direction:
- Coverage ↑ (higher is better)
- Bug count ↓ (lower is better)

**Why this matters**: Without numeric values, there's no gradient to descend. Binary pass/fail gates provide direction but not magnitude.

### 2.2 Determinism (Pure Function)

For the same code state, Q must return the same value:

```
∀ code: Q(code) = Q(code)
```

**Why this matters**: Non-deterministic measurement creates noise that overwhelms the gradient signal. If the same code sometimes passes and sometimes fails, the agent can't learn the improvement direction.

### 2.3 Local Continuity

Small code changes should produce small metric changes:

```
∀ε > 0, ∃δ > 0: |code₁ - code₂| < δ ⟹ |Q(code₁) - Q(code₂)| < ε
```

In practice, this means:
- Adding one test case → small coverage increase
- Fixing one bug → bug count decreases by 1
- No discontinuous "cliffs" where small changes cause large metric jumps

**Why this matters**: Discontinuous quality functions create basins the agent can't escape. If fixing one bug doesn't improve metrics until all bugs are fixed, the agent has no gradient to follow.

## 3. Metric Classification

### 3.1 Objective Metrics vs. Weighting Metrics

Not all measurements participate equally in the gradient:

| Type | Role | Examples |
|---|---|-----|
| **Objective** | Creates gradient | coverage, bugs, smells |
| **Weighting** | Focuses gradient | impact, degree, severity |

**Objective metrics** define *what* to optimize-they form the loss function L(code).

**Weighting metrics** define *where* to optimize-they create a importance distribution over files.

### 3.2 Smoothness Analysis

Metrics vary in their "gradient smoothness"-how continuously they respond to code changes:

```
Smoothness ≈ 1 / (Δmetric per atomic change)
```

**Tier 1 (Smoothest)**:
- `coverage.lines`: ~0.03% per line covered (N ≈ 3000)
- `duplications`: Gradual decrease as code is refactored

**Tier 2 (Good)**:
- `coverage.branches`: ~0.5% per branch covered (N ≈ 200)
- `codeSmells`: ~1% per smell fixed (N ≈ 100)

**Tier 3 (Discrete)**:
- `sonarqube.blocker`: 20-100% per fix (N ≈ 5)
- `eslint.errors`: Discrete counts with cliff-like behavior

**Recommendation**: Prefer percentage-based metrics with large denominators for smoother gradient landscapes.

### 3.3 SGD Property Evaluation Matrix

How well do common metrics satisfy the three required properties?

| Metric | Quantitative | Deterministic | Continuous | SGD Grade | Notes |
|----|:------:|:-------:|:-----:|:-----:|----|
| **coverage.lines** | ✓ % | ✓ | ✓✓ (N≈3000) | **A** | Excellent smoothness |
| **coverage.statements** | ✓ % | ✓ | ✓✓ (N≈3000) | **A** | Excellent smoothness |
| **coverage.branches** | ✓ % | ✓ | ✓ (N≈200) | **B+** | Good granularity |
| **coverage.functions** | ✓ % | ✓ | ✓ (N≈100) | **B** | Moderate granularity |
| **duplications %** | ✓ % | ✓ | ✓ | **B+** | Gradual improvement |
| **sonarqube.codeSmells** | ✓ int | ✓ | △ (N≈100) | **B-** | OK but discrete |
| **sonarqube.minor** | ✓ int | ✓ | △ (N≈50) | **C+** | Moderately discrete |
| **sonarqube.major** | ✓ int | ✓ | △ (N≈20) | **C** | More discrete |
| **sonarqube.bugs** | ✓ int | ✓ | ✗ (N≈5-20) | **C-** | Small N = cliffs |
| **sonarqube.vulnerabilities** | ✓ int | ✓ | ✗ (N≈5) | **D** | Very discrete |
| **sonarqube.critical** | ✓ int | ✓ | ✗ (N≈5) | **D** | Cliff-like |
| **sonarqube.blocker** | ✓ int | ✓ | ✗ (N≈0-3) | **D-** | Near-binary |
| **typescript.errors** | ✓ int | △* | ✗ cascade | **D** | *Flaky with incremental |
| **eslint.errors** | ✓ int | ✓ | ✗ cascade | **D+** | Cascading failures |

**Key insight**: Tier 3 metrics (D grades) violate local continuity and are poorly suited as optimization objectives. However, they work well as **hard constraints** via ceilings. The system should use smooth metrics (coverage %) as objectives and discrete metrics as gates.

### 3.4 Improving Continuity via Normalization

Discrete count metrics can be smoothed by normalizing to code size:

```
bugs_per_ksloc = bugs / (sloc / 1000)
smells_per_ksloc = codeSmells / (sloc / 1000)
```

This transforms cliff-like counts into continuous densities. As the codebase grows, the denominator smooths the discrete numerator, improving local continuity.

**Example**:
- Raw: 5 bugs → 4 bugs = 20% improvement (cliff)
- Normalized: 0.50 bugs/kSLOC → 0.40 bugs/kSLOC = 20% improvement (smoother as code grows)

## 4. The Composite Priority Function

### 4.1 Four Gradient Dimensions

For LLM agent guidance, we define priority as a weighted combination:

```
P(file, violations) = Σᵢ wᵢ × gᵢ
```

Where:

| Dimension | Formula | Interpretation |
|------|-----|--------|
| `coverageGap` | 1 - coverage | Needs more tests |
| `easeOfTesting` | 1 / (1 + degree) | Simpler to test (leaf node) |
| `importance` | dependents / max | Critical code, cascading failures |
| `severityScore` | Σ severity_weights | More/worse violations |

### 4.2 Dependency Graph Metrics

**Degree** (forward dependencies):
- Degree 0 = leaf node (no imports)
- Degree N = imports only files with degree < N
- Higher degree = more complex dependency chain

**Dependents** (reverse dependencies):
- Direct dependents = files that import this file
- Indirect dependents = transitive importers
- Higher dependents = more critical code

### 4.3 Strategic Quadrants

Files can be categorized by impact × ease:

```
                    High Impact
                        │
    Integration Layer   │   Critical Foundation
    (test after deps)   │   (test FIRST)
                        │
    ────────────────────┼────────────────────
                        │
    Complex Isolated    │   Isolated Utilities
    (defer)             │   (opportunistic)
                        │
                    Low Impact
            High Degree ←──────→ Low Degree
```

**Critical Foundation** (high impact, low degree): These are leaf nodes that many files depend on. Test them first-they're easy to test and failures cascade widely.

## 5. The SGD Analogy in Detail

### 5.1 Continuous SGD

In standard SGD:
```
θₜ₊₁ = θₜ - η∇L(θₜ) + noise
```

Where:
- θ is the parameter vector
- η is the learning rate
- ∇L is the gradient of loss
- noise comes from mini-batch sampling

### 5.2 Discrete "SGD" with Quality Gates

In our framework:
```
codeₜ₊₁ = LLM(codeₜ, feedback(Q(codeₜ)))
```

Where:
- code is the current state
- LLM is the stochastic agent
- Q is the quality function
- feedback provides the "gradient direction"

**The key mapping**:
- Mini-batch noise → LLM stochasticity
- Gradient direction → Quality gate feedback
- Learning rate → Agent responsiveness

### 5.3 Why This Works

1. **Gradient from Gates**: The quality function Q provides ordering-Q(code_A) < Q(code_B) means B is better. This ordering defines the descent direction.

2. **Stochasticity from LLM**: The LLM generates diverse code modifications. This provides the exploration that prevents getting stuck in local minima.

3. **Descent from Rejection**: When code fails the quality gate, the agent must try again. This creates pressure toward the minimum.

### 5.4 Limitations and Extensions

The analogy has limitations, though some have been addressed:

| SGD Property | Quality Gates | Status |
|-------|--------|----|
| Continuous space | Discrete code space | Inherent |
| Differentiable loss | Non-differentiable metrics | Inherent |
| Gradient computation | Priority ordering | **Extended** |
| Learning rate control | Agent responsiveness | Open |

**Original limitation**: In discrete spaces, the dimension-space gradient degenerates to priority ordering.

**Extension (Discrete Differentiability)**: We can compute **target-space gradients** over enumerable moves:

```
∇ₜQ = [∂Q/∂target₁, ∂Q/∂target₂, ...]
```

Where each target is an addressable unit from the shared address space (address_id, span) with computable expected ΔQ. This provides actual gradient computation over discrete code-space locations, not just priority ordering.

This requires a **shared addressing scheme** so all axes map into the same target space. For TypeScript we use the compiler symbol graph (qualified symbol names, plus edges for calls/imports/extends) because it is stable under line churn and supports cross-axis aggregation. File:line addressing remains a fallback when a symbol cannot be resolved. In prose domains, paragraph/sentence/word indices or a topic graph can play the same role, but the choice must be consistent across metrics.

**See [theory/DIFFERENTIABILITY.md](./theory/DIFFERENTIABILITY.md)** for the full mathematical treatment.

### 5.5 Known Limitations (Honest Assessment)

We acknowledge several limitations of this framework:

**1. Determinism Violations**

TypeScript error counts can be non-deterministic due to:
- Incremental compilation caching
- LSP server state
- File system timing

**Mitigation**: Always run fresh `tsc` compilation, not incremental. Clear caches between measurements.

**2. Local Continuity Violations**

Several metrics violate the continuity requirement:
- `sonarqube.blocker`: N ≈ 0-3 means each fix is 33-100% improvement
- `sonarqube.critical`: Similar cliff-like behavior
- TypeScript/ESLint errors: Cascading fixes create discontinuities

**Mitigation**: Use these as constraints (ceilings) not objectives. They define feasible regions, not descent directions.

**3. Cascading Effects**

Some fixes produce non-local improvements:
- Fixing one ESLint rule may fix 10 violations
- Fixing a type error may clear downstream errors
- Adding one test may cover multiple branches

This violates "small change = small improvement" but in the *beneficial* direction (superlinear descent). We consider this acceptable as it accelerates convergence.

**4. Metric Correlation**

Quality dimensions are not independent:
- Higher coverage often correlates with fewer bugs
- Lower complexity correlates with fewer smells

This complicates the geometry but doesn't invalidate descent behavior.

**5. The Analogy is Imperfect**

We emphasize: this is an *analogy*, not an equivalence. Code space is discrete, quality functions are non-differentiable, and we compute priority orderings rather than true gradients.

The value is in the *behavioral similarity*: stochastic agents iterating against deterministic gates exhibit descent-like convergence toward quality targets.

## 6. Designing Quality "Geometry"

### 6.1 Avoiding Local Minima

Poor metric design creates local minima:
- Binary gates with no intermediate values
- Metrics that improve only after many changes
- Conflicting metrics that can't be jointly optimized

**Solution**: Use smooth, monotonic metrics that reward incremental progress.

### 6.2 Multi-Objective Optimization

Quality is inherently multi-objective:
- Coverage vs. performance
- Type safety vs. flexibility
- Complexity vs. readability

**Solution**: Define floors/ceilings to create a feasible region, then optimize within it. Monotonic rules prevent regression on important dimensions.

### 6.3 The Pareto Frontier

With multiple metrics, the optimal solution lies on the Pareto frontier-the set of solutions where no metric can improve without another degrading.

Quality gates with floors approximate this by:
1. Ensuring all metrics meet minimum thresholds
2. Allowing flexibility in how the agent optimizes

## 7. Conclusion

Deterministic quality gates create gradient descent-like behavior for LLM agents when:

1. **Metrics are quantitative** - Numbers with optimization directions
2. **Measurements are deterministic** - Same code → same results
3. **Changes are continuous** - Small edits → small metric changes

The priority function combines objective metrics (what to optimize) with weighting metrics (where to focus) to guide agents through the quality landscape.

While not mathematically identical to SGD, this framework provides the key intuitions:
- Gates provide descent direction
- LLM stochasticity provides exploration
- Rejection creates optimization pressure

The result: LLM agents that iteratively improve code quality, converging toward solutions that satisfy all quality constraints.

--

## Further Reading

This document presents the practical framework. For deeper theoretical treatment:

- **[theory/GEOMETRY.md](./theory/GEOMETRY.md)** - The abstract quality geometry framework (tool-agnostic)
- **[theory/TOPOLOGY.md](./theory/TOPOLOGY.md)** - Our specific metric instantiation and rationale
- **[theory/CONVERGENCE.md](./theory/CONVERGENCE.md)** - Formal convergence theorem with proofs
- **[theory/CLAIMS.md](./theory/CLAIMS.md)** - Citation inventory and validation requirements

The key distinction: **geometry** describes the abstract structure of quality spaces; **topology** is our specific choice of metrics. The geometry exists independent of tooling; the topology is a design decision open to empirical optimization.

**The convergence theorem** establishes that quality-guided iteration converges in finite expected time under the "biased proposer" assumption - that LLMs given quality feedback propose improvements more often than regressions. This is empirically testable.
