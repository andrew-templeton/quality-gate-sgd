# Discrete Differentiability: Target-Space Gradients

> **Working Draft** — This document presents preliminary theoretical work. Claims marked `[NOVEL]` await empirical validation. Citations marked `[PENDING]` are being compiled. See [CLAIMS.md](./CLAIMS.md) for full status.

> Computing expected fitness change for enumerable optimization moves

## 1. The Problem: Gradient Degeneracy in Discrete Spaces

The standard quality geometry (see [GEOMETRY.md](./GEOMETRY.md)) defines a quality function:

```
Q: C → ℝⁿ
```

The gradient ∇Q tells us which *dimension* to improve:

```
∇Q = [∂Q/∂coverage, ∂Q/∂typescript.errors, ∂Q/∂eslint.errors, ...]
```

This is a **dimension-space gradient**. It answers "what metric should I improve?" but not "where in the codebase should I make changes?"

**The limitation** (noted in CONCEPT.md Section 5.4): "In discrete spaces, the gradient degenerates to priority ordering."

This observation is correct for dimension-space gradients. However, we can do better.

---

## 2. The Insight: Location Data Already Exists

Quality measurement tools already extract precise location information:

| Source | Location Data | Current Usage |
|--------|---------------|---------------|
| coverage-final.json | file, line, branch, function | Aggregated to % |
| TypeScript errors | file:line:column | Counted only |
| ESLint issues | file:line:column:ruleId | Counted only |
| SonarQube issues | file:line:rule:severity | Counted only |

**We have the data to compute gradients over code-space. We just throw it away during aggregation.**

The key realization: instead of computing ∂Q/∂dimension, we can compute ∂Q/∂target where target is a code location.

---

## 3. Target-Space Gradients

### 3.1 Definition

Let **T** = {t₁, t₂, ..., tₙ} be the set of enumerable optimization targets, where each target is a tuple:

```
t = (file, symbol?, line_range?, issue_cluster)
```

The **target-space gradient** is:

```
∇ₜQ = [∂Q/∂t₁, ∂Q/∂t₂, ..., ∂Q/∂tₙ]
```

Where ∂Q/∂tᵢ represents the expected change in fitness if all issues at target tᵢ are resolved.

### 3.2 Computation

For a target t with issues {i₁, i₂, ..., iₖ}, the expected fitness change is:

```
∂Q/∂t = ΔQ(t) = Σⱼ wⱼ × δⱼ(t)
```

Where:
- wⱼ is the weight for dimension j
- δⱼ(t) is the normalized impact on dimension j from fixing issues at target t

### 3.3 The Formula

**For higher-better dimensions** (coverage):
```
ΔQ_dim = weight × Σ(estimated_coverage_gain_per_issue)
```

**For lower-better dimensions** (error counts):
```
ΔQ_dim = weight × Σ(gain_per_error_fixed)
```

Where gain_per_error_fixed ≈ 0.105 × exp(-current_errors/10) for exponential normalization.

### 3.4 Discrete Differentiability

This is **discrete differentiability**: we can compute "if I fix target X, I expect Y improvement" for each enumerable move in target-space.

Unlike continuous gradients that require infinitesimal perturbations, discrete gradients enumerate finite moves and compute their expected effects.

---

## 4. Cross-Dimension Correlation

### 4.1 The Value Multiplier

A target that addresses multiple dimensions simultaneously is more valuable than one addressing a single dimension.

**Example**:
| Target | Coverage ΔQ | TS Errors ΔQ | Smells ΔQ | **Total ΔQ** |
|--------|-------------|--------------|-----------|--------------|
| `processPayment()` | +0.35 | +0.25 | +0.10 | **0.70** |
| `formatDate()` | +0.07 | 0 | 0 | **0.07** |

Both have similar coverage gaps, but `processPayment()` is **10x more valuable** because it addresses three dimensions.

### 4.2 Why Dimension-Level Gradients Miss This

A dimension-level gradient would rank both files similarly for coverage improvement. It cannot see the cross-dimension correlation.

Target-space gradients compute total ΔQ across all affected dimensions, naturally surfacing high-value targets.

### 4.3 Formal Statement

**Claim [MATH]**: Let T be a target affecting dimensions D = {d₁, d₂, ..., dₖ}. The total expected fitness change is:

```
ΔQ(T) = Σᵢ∈D weight(dᵢ) × normalized_impact(T, dᵢ)
```

This is a weighted sum across all affected dimensions, not a maximum or priority selection.

---

## 5. Granularity Tiers

### 5.1 The Trade-off

Finer granularity provides more specific guidance but may incur costs:
- Computational: More targets to enumerate and rank
- Cognitive: More specific guidance may overwhelm
- Accuracy: Symbol-level attribution may have errors

### 5.2 Three Tiers

| Tier | Granularity | Target Definition | Use Case |
|------|-------------|-------------------|----------|
| Quick | Dimension | "improve coverage.branches" | Fast triage |
| Standard | File | "fix src/services/payment.ts" | Default workflow |
| Deep | Symbol | "fix processPayment() at line 45" | Precise guidance |

### 5.3 Mathematical Relationship

Let G_dim, G_file, G_symbol be target sets at each granularity.

```
|G_dim| << |G_file| << |G_symbol|
```

But information content increases with granularity:

```
H(G_dim) < H(G_file) < H(G_symbol)
```

Where H is the entropy of the target ranking distribution.

---

## 6. Connection to Convergence

### 6.1 Conjecture

**Conjecture [NOVEL]**: Finer-grained targets lead to faster convergence.

**Rationale**: More specific targets provide more informative feedback:
- "Improve coverage" → agent must search entire codebase
- "Fix src/payment.ts" → agent focuses on one file
- "Fix processPayment()" → agent focuses on one function

### 6.2 Testable Prediction

Let τ_dim, τ_file, τ_symbol be expected iterations to convergence for each granularity.

**Prediction**: τ_symbol < τ_file < τ_dim

This is empirically testable by comparing convergence rates across granularity modes.

### 6.3 Potential Caveats

- Symbol-level may have higher computational overhead
- Very fine granularity may fragment related issues
- Agent may not effectively use fine-grained guidance

---

## 7. Implementation

### 7.1 Data Structures

```typescript
/** A single located issue */
interface LocatedIssue {
  file: string;
  line?: number;
  symbol?: string;
  source: 'coverage' | 'typescript' | 'eslint' | 'sonarqube';
  dimension: string;
  impact: {
    dimension: string;
    delta: number;
    direction: 'higher-better' | 'lower-better';
  };
}

/** An aggregated optimization target */
interface OptimizationTarget {
  file: string;
  symbol?: string;
  issues: LocatedIssue[];
  impacts: Record<string, number>;  // dimension → total delta
  totalDeltaQ: number;              // cross-dimension sum
  dimensionsAffected: string[];
}
```

### 7.2 Aggregation Algorithm

```
function aggregateToTargets(issues, granularity):
  1. Group issues by (file) or (file, symbol) based on granularity
  2. For each group:
     a. Sum impacts per dimension
     b. Compute totalDeltaQ using fitness weights
     c. Identify dimensionsAffected
  3. Sort by totalDeltaQ descending
  4. Return ranked targets
```

### 7.3 ΔQ Computation

```typescript
function computeTargetDeltaQ(issues: LocatedIssue[]): number {
  // Group by dimension
  const impactsByDim = groupBy(issues, i => i.impact.dimension);

  let totalDeltaQ = 0;
  for (const [dim, dimIssues] of impactsByDim) {
    const weight = getWeight(dim);
    const totalDelta = sum(dimIssues, i => i.impact.delta);

    if (direction === 'higher-better') {
      totalDeltaQ += weight * totalDelta;
    } else {
      // Exponential normalization for error counts
      totalDeltaQ += weight * 0.105 * Math.abs(totalDelta);
    }
  }
  return totalDeltaQ;
}
```

---

## 8. Relationship to Existing Theory

### 8.1 Extension of Quality Geometry

Discrete differentiability extends the quality geometry framework (GEOMETRY.md) by:
1. Preserving location information during measurement
2. Defining gradients over target-space, not just dimension-space
3. Enabling cross-dimension value computation

### 8.2 Implications for Convergence

The convergence theorem (CONVERGENCE.md) establishes E[τ] < ∞ under the biased proposer assumption.

Discrete differentiability suggests a refinement: the convergence rate may depend on feedback granularity. Finer targets provide more informative feedback, potentially increasing the bias parameter p.

### 8.3 Topology Extension

Our topology (TOPOLOGY.md) now includes granularity configuration:
- `--quick`: dimension-level (original behavior)
- default: file-level (new default)
- `--deep`: symbol-level (most specific)

---

## 9. Open Questions

1. **Optimal granularity**: Is there a sweet spot between dimension and symbol levels?

2. **Agent adaptation**: Do different LLMs respond differently to granularity levels?

3. **Cognitive load**: Does symbol-level guidance improve or overwhelm agents?

4. **Computational scaling**: How does target enumeration scale with codebase size?

5. **Cross-project transfer**: Do optimal granularity choices transfer across projects?

---

## 10. Conclusion

Discrete differentiability transforms the quality optimization problem from "which metric should I improve?" to "which specific code location should I fix, and how much will it help?"

By computing target-space gradients, we:
1. Provide specific, actionable guidance
2. Surface high-value targets with cross-dimension impact
3. Enable granularity selection based on workflow needs

This is not merely priority ordering—it is actual gradient computation over discrete enumerable moves in code-space.

---

## Further Reading

- **[GEOMETRY.md](./GEOMETRY.md)** — Abstract quality geometry framework
- **[CONVERGENCE.md](./CONVERGENCE.md)** — Formal convergence theorem
- **[TOPOLOGY.md](./TOPOLOGY.md)** — Our metric instantiation
- **[CLAIMS.md](./CLAIMS.md)** — Citation inventory including discrete differentiability claims
