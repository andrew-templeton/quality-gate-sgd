# Quality Geometry: A Theoretical Framework

> **Working Draft** - This document presents preliminary theoretical work. Claims marked `[NOVEL]` await empirical validation. Citations marked `[PENDING]` are being compiled. See [CLAIMS.md](./CLAIMS.md) for full status.

> The abstract structure of quality measurement spaces and their optimization properties

## 1. Introduction

This document presents **Quality Geometry** as a theoretical framework, independent of any specific tooling or metric implementation. The core claim is:

> Quality measurements on code form a structured space with geometric properties that can be exploited by optimization algorithms-including stochastic agents like LLMs.

This is distinct from choosing *which* metrics to use (the **topology**). The geometry describes the abstract structure; the topology is a concrete instantiation.

## 2. The Quality Space

### 2.1 Definition

Let **C** be the space of all possible code states for a given project. A **quality function** is a mapping:

```
Q: C → ℝⁿ
```

Where each dimension qᵢ represents a measurable quality attribute (coverage, bug count, complexity, etc.).

### 2.2 Properties for Optimization

For Q to support gradient-like optimization, it should satisfy:

**Property 1: Quantitative Measurement**
```
Q(c) ∈ ℝⁿ for all c ∈ C
```
Each dimension must produce a real number, not just categorical labels.

**Property 2: Determinism**
```
Q(c₁) = Q(c₂) whenever c₁ = c₂
```
The same code state must always produce the same quality vector. This is the "pure function" requirement.

**Property 3: Local Continuity**
```
∀ε > 0, ∃δ > 0: d(c₁, c₂) < δ ⟹ ||Q(c₁) - Q(c₂)|| < ε
```
Small changes in code should produce small changes in quality. This requires defining a distance metric on code space-typically edit distance or AST difference.

### 2.3 The Descent Condition

When these properties hold, a quality space admits **descent**: there exist transformation sequences that monotonically improve Q.

**Theorem (Informal)**: If Q satisfies Properties 1-3, then for most code states c where Q(c) is not at a local minimum, there exists a neighborhood N(c) containing states c' with Q(c') < Q(c) (assuming minimization).

## 3. Stochastic Agents as Optimizers

### 3.1 The LLM as Stochastic Search

An LLM coding agent can be modeled as a stochastic function:

```
A: C × Feedback → Distribution(C)
```

Given a code state and feedback, the agent produces a distribution over possible next states.

### 3.2 The SGD Analogy

In continuous SGD:
```
θₜ₊₁ = θₜ - η∇L(θₜ) + noise
```

In quality-guided descent:
```
cₜ₊₁ ~ A(cₜ, feedback(Q(cₜ)))
```

The correspondence:
| SGD Component | Quality Descent Analog |
|--------|------------|
| Parameter θ | Code state c |
| Loss L | Quality function Q |
| Gradient ∇L | Quality feedback (which metrics fail) |
| Learning rate η | Agent responsiveness |
| Mini-batch noise | LLM stochasticity |

### 3.3 Why This Works

1. **Gradient from feedback**: The quality function tells the agent *what* is wrong (high bug count, low coverage). This provides direction.

2. **Exploration from stochasticity**: The LLM generates diverse fixes for the same problem. This prevents getting stuck in local minima.

3. **Descent from rejection**: When code fails quality gates, the agent must try again. This creates pressure toward better states.

## 4. Geometric Properties

### 4.1 Smoothness

A quality dimension qᵢ has **smoothness** inversely proportional to its sensitivity:

```
smoothness(qᵢ) ≈ 1 / E[|Δqᵢ| per atomic code change]
```

High smoothness (small changes per edit) creates gradual gradients.
Low smoothness (large jumps) creates cliff-like discontinuities.

**Design principle**: Prefer dimensions with high smoothness as optimization objectives.

### 4.2 Correlation Structure

Quality dimensions may be correlated:
- Positive: Improving coverage often reduces bug count
- Negative: Reducing complexity may reduce coverage (removing code)
- Independent: Line count vs. naming conventions

The correlation structure affects optimization difficulty. Positively correlated objectives are easier to jointly optimize.

### 4.3 Constraint Surfaces

Hard constraints (floors and ceilings) define feasible regions:

```
Feasible(c) = { c ∈ C : qᵢ(c) ≥ floorᵢ ∧ qⱼ(c) ≤ ceilingⱼ }
```

Optimization occurs within this region. Constraints with low smoothness (e.g., "zero blockers") act as hard boundaries rather than gradient sources.

### 4.4 Target-Space Gradients

The gradient defined in Section 4.1 operates in **dimension-space**:

```
∇Q = [∂Q/∂q₁, ∂Q/∂q₂, ..., ∂Q/∂qₙ]
```

This tells us which dimension to improve but not *where* in code-space.

**Discrete differentiability** extends this to **target-space**:

```
∇ₜQ = [∂Q/∂t₁, ∂Q/∂t₂, ..., ∂Q/∂tₘ]
```

Where each tᵢ is a code location (file, symbol) with computable expected ΔQ.

Key properties:
1. **Cross-dimension aggregation**: One target may affect multiple dimensions
2. **Enumerable moves**: Each target represents a discrete, actionable change
3. **Computable impact**: ΔQ(t) = Σ weight(d) × impact(t, d) for affected dimensions

This transforms priority ordering into actual gradient computation over discrete targets.

**See [DIFFERENTIABILITY.md](./DIFFERENTIABILITY.md) for full treatment.**

## 5. Implications for Topology Design

The geometry framework suggests principles for choosing specific metrics:

1. **Use smooth dimensions as objectives** - They provide useful gradients
2. **Use discrete dimensions as constraints** - They define boundaries, not directions
3. **Normalize to improve continuity** - Per-SLOC metrics are smoother than raw counts
4. **Consider correlation** - Avoid negatively correlated objectives in the same optimization

## 6. Open Questions

The geometry framework raises questions for future investigation:

1. **Optimal topology**: What metric combinations create the best descent landscapes?
2. **Local minima**: How prevalent are local minima in real quality spaces?
3. **Metric design**: Can we design new metrics specifically for LLM optimization?
4. **Transfer**: Do topologies optimized for one codebase transfer to others?
5. **Target granularity**: Does file-level or symbol-level targeting improve convergence rate?
6. **Cross-dimension value**: Are multi-dimension targets inherently more valuable?
7. **Granularity trade-offs**: What is the optimal granularity for different agent types?

## 7. Conclusion

Quality Geometry provides a tool-agnostic framework for understanding why deterministic quality gates create optimization behavior in stochastic agents. The specific choice of metrics (topology) is a separate design problem that can be studied empirically.

The key insight: **The structure exists independent of our measurement choices.** We are discovering properties of the quality space, not inventing them.

--

## Further Reading

- **[DIFFERENTIABILITY.md](./DIFFERENTIABILITY.md)** - Target-space gradients and discrete differentiability
- **[TOPOLOGY.md](./TOPOLOGY.md)** - Our specific metric instantiation
- **[CONVERGENCE.md](./CONVERGENCE.md)** - Formal convergence theorem and proofs
- **[CLAIMS.md](./CLAIMS.md)** - Citation inventory and validation requirements
- **[../CONCEPT.md](../CONCEPT.md)** - Practical application guide
