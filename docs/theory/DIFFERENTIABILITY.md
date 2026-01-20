# Discrete Differentiability: Target-Space Gradients

> **Working Draft** - This document presents preliminary theoretical work. Claims marked `[NOVEL]` await empirical validation. Citations marked `[PENDING]` are being compiled. See [CLAIMS.md](./CLAIMS.md) for full status.

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

--

## 2. The Insight: Location Data Already Exists

Quality measurement tools already extract precise location information:

| Source | Location Data | Current Usage |
|----|--------|--------|
| coverage-final.json | file, line, branch, function | Aggregated to % |
| TypeScript errors | file:line:column | Counted only |
| ESLint issues | file:line:column:ruleId | Counted only |
| SonarQube issues | file:line:rule:severity | Counted only |

**We have the data to compute gradients over code-space. We just throw it away during aggregation.**

The key realization: instead of computing ∂Q/∂dimension, we can compute ∂Q/∂target where target is a code location.

### 2.1 Addressing Schemes (Shared Coordinates)

Target-space gradients require that all issue sources map into a shared address space. We call this the addressing scheme.

**Definition**: An addressing scheme is a deterministic mapping:

```
Addr: C -> A
Addr(c) = (V, E, μ)
```

Where V is the set of addressable units, E is an optional adjacency relation, and μ assigns a size measure used for normalization.

**Quality coordinate space**: We call A a quality coordinate space if it is:
- Deterministic: same code state yields the same addresses
- Stable: small edits preserve address identity for unchanged units
- Shared: every metric axis can map its issues into V
- Normalizable: each address has a size measure μ for density
- Graphable (optional): E enables weighting and propagation

Each axis provides a locator L_i that maps raw issues to V (with explicit fallback to coarser addresses like file:line). This ensures every issue can be normalized into the shared address space.

For TypeScript, we use the compiler symbol graph (symbols as nodes, edges from calls/imports/extends, μ from symbol span). File:line addressing is simpler but tends to be fragile under refactors, so we use it only as a fallback. For prose domains, paragraph/sentence/word indices or a topic graph can play the same role; for proofs, a claim graph is a natural address space.

This choice is part of the topology, not the geometry.

**Addressing fitness (diagnostics)**: We evaluate whether an address space is fit using measurable proxies:
- Mapping coverage (overall and line-level)
- Address size distribution (median/p90 SLOC per address)
- Call-graph resolution rate (if E is derived)
- Optional address churn under small edits (stability)

Fit spaces preserve identity and cover most issues without fallback. Unfit spaces degrade target-space gradients and should trigger a coarser fallback or a different scheme.

--

## 3. Target-Space Gradients

### 3.1 Definition

Let **T** = V be the set of addressable targets from the addressing scheme, where each target can be represented as a tuple:

```
t = (address_id, span?, issue_cluster)
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

--

## 4. Cross-Dimension Correlation

### 4.1 The Value Multiplier

A target that addresses multiple dimensions simultaneously is more valuable than one addressing a single dimension.

**Example**:
| Target | Coverage ΔQ | TS Errors ΔQ | Smells ΔQ | **Total ΔQ** |
|----|-------|-------|------|-------|
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

--

## 5. Granularity Tiers

### 5.1 The Trade-off

Finer granularity provides more specific guidance but may incur costs:
- Computational: More targets to enumerate and rank
- Cognitive: More specific guidance may overwhelm
- Accuracy: Symbol-level attribution may have errors

### 5.2 Three Tiers

| Tier | Granularity | Target Definition | Use Case |
|---|-------|----------|-----|
| Quick | Dimension | "improve coverage.branches" | Fast triage |
| Standard | File (address) | "fix src/services/payment.ts" | Default workflow |
| Deep | Symbol (address) | "fix processPayment() at line 45" | Precise guidance |

Granularity determines how the address space V is partitioned into targets (file-level buckets vs symbol-level units).

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

--

## 6. Symbol Tables and O(1) Location Mapping

For symbol-level addressing to be practical, we need efficient mapping from issue locations to containing symbols. A naive approach scans all symbols for each issue, yielding O(n × m) complexity for n issues and m symbols.

### 6.1 Definition

**Definition [MATH]**: A **symbol table** S is a data structure providing:
- `symbols`: Map(id → Symbol) - direct access by identifier
- `byFile`: Map(file → Symbol[]) - symbols per file, sorted by line
- `lineIndex`: Map(file:line → Symbol) - O(1) location lookup

### 6.2 Construction

The `lineIndex` is constructed by iterating each symbol's span and recording the innermost containing symbol for each line. This enables O(1) mapping from any issue location to its containing symbol.

**Implementation note**: For TypeScript, we extract symbols using the compiler API, capturing functions, classes, methods, arrow functions, and exported constants. Each symbol has a unique identifier of the form `file.ts::ClassName.methodName`.

### 6.3 Claim

| Claim | Type | Status |
|-------|------|--------|
| O(1) symbol lookup enables practical scaling | `[IMPL]` | Implemented |

--

## 7. Call Graph Weighting

Not all symbols are equally impactful. A utility function called from 50 locations affects more code than an isolated helper. We capture this via call graph analysis.

### 7.1 Definition

**Definition [MATH]**: For a symbol s in call graph G = (V, E):
- `in(s) = |{v : (v, s) ∈ E}|` - number of callers (in-degree)
- `out(s) = |{v : (s, v) ∈ E}|` - number of callees (out-degree)

### 7.2 Weighted ΔQ

High in-degree symbols are *impact multipliers*: fixing them improves code that many other symbols depend on. We weight ΔQ accordingly:

```
ΔQ_weighted(t) = ΔQ(t) × (1 + log₂(in(t) + 1))
```

The logarithmic scaling prevents extreme outliers (e.g., a logging utility called 1000 times) from dominating the priority queue.

### 7.3 Claims

| Claim | Type | Validation Required |
|-------|------|---------------------|
| Call graph in-degree weighting improves prioritization | `[NOVEL]` | Experimental: compare weighted vs unweighted |
| Weighted prioritization yields higher monotonic improvement rate | `[NOVEL]` | Experimental: measure improvement rate |

--

## 8. Fixability Estimation

A target's ΔQ assumes all issues can be fixed. In practice, some issues require architectural changes that cannot be addressed in a single edit session. We introduce *fixability* to model this.

### 8.1 Definitions

**Definition [MATH]**: The **fixability score** φ(t) ∈ [0, 1] is the estimated fraction of issues at target t that can be resolved in a single focused editing session.

**Definition [MATH]**: The **adjusted** quality improvement accounting for fixability is:

```
ΔQ_adj(t) = ΔQ_weighted(t) × φ(t)
```

### 8.2 Estimation Method

We use an LLM to estimate φ(t) by presenting:
1. The source code of the symbol
2. The list of issues (by type and count)
3. Current metrics (coverage gap, issue density)

The LLM returns a score and effort classification (`trivial`, `moderate`, `significant`, `major`).

### 8.3 Conjecture

**Conjecture [NOVEL]**: Prioritizing by ΔQ_adj yields faster convergence than prioritizing by raw ΔQ:

```
E[τ_adj] < E[τ_raw]
```

**Rationale**: Targeting high-fixability symbols reduces wasted iterations where the agent attempts changes that cannot succeed in one pass.

### 8.4 Claims

| Claim | Type | Validation Required |
|-------|------|---------------------|
| LLM fixability scores correlate with actual fix success | `[NOVEL]` | Experimental: Spearman ρ > 0.5 |
| High-fixability symbols have higher fix success rate | `[NOVEL]` | Experimental: compare φ > 0.7 vs φ < 0.3 |
| Adjusted ΔQ outperforms raw ΔQ for prioritization | `[NOVEL]` | Experimental: compare τ_adj vs τ_raw |

--

## 9. Connection to Convergence

### 9.1 Granularity Conjecture

**Conjecture [NOVEL]**: Finer-grained targets lead to faster convergence.

**Rationale**: More specific targets provide more informative feedback:
- "Improve coverage" → agent must search entire codebase
- "Fix src/payment.ts" → agent focuses on one file
- "Fix processPayment()" → agent focuses on one function

### 9.2 Testable Prediction

Let τ_dim, τ_file, τ_symbol be expected iterations to convergence for each granularity.

**Prediction**: τ_symbol < τ_file < τ_dim

This is empirically testable by comparing convergence rates across granularity modes.

### 9.3 Potential Caveats

- Symbol-level may have higher computational overhead
- Very fine granularity may fragment related issues
- Agent may not effectively use fine-grained guidance

--

## 10. Implementation

### 10.1 Data Structures

```typescript
/** A single located issue */
interface LocatedIssue {
  file: string;
  line?: number;
  addressId?: string;    // normalized address (symbol path, paragraph id, etc.)
  addressLabel?: string; // human-readable label
  addressKind?: 'symbol' | 'file' | 'line' | 'paragraph' | 'claim';
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
  addressId: string;
  addressLabel: string;
  file?: string;
  issues: LocatedIssue[];
  impacts: Record<string, number>;  // dimension → total delta
  totalDeltaQ: number;              // cross-dimension sum
  dimensionsAffected: string[];
}
```

### 10.2 Aggregation Algorithm

```
function aggregateToTargets(issues, granularity):
  1. Normalize each issue to addressId (or fallback to file/line)
  2. Group by addressId (or by file for coarse granularity)
  3. For each group:
     a. Sum impacts per dimension
     b. Compute totalDeltaQ using fitness weights
     c. Identify dimensionsAffected
  4. Sort by totalDeltaQ descending
  5. Return ranked targets
```

### 10.3 ΔQ Computation

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

--

## 11. Relationship to Existing Theory

### 11.1 Extension of Quality Geometry

Discrete differentiability extends the quality geometry framework (GEOMETRY.md) by:
1. Preserving location information during measurement
2. Defining gradients over target-space, not just dimension-space
3. Enabling cross-dimension value computation

### 11.2 Implications for Convergence

The convergence theorem (CONVERGENCE.md) establishes E[τ] < ∞ under the biased proposer assumption.

Discrete differentiability suggests a refinement: the convergence rate may depend on feedback granularity. Finer targets provide more informative feedback, potentially increasing the bias parameter p.

### 11.3 Topology Extension

Our topology (TOPOLOGY.md) now includes granularity configuration:
- `-quick`: dimension-level (original behavior)
- default: file-level (new default)
- `-deep`: symbol-level (most specific)

--

## 12. Open Questions

1. **Optimal granularity**: Is there a sweet spot between dimension and symbol levels?

2. **Agent adaptation**: Do different LLMs respond differently to granularity levels?

3. **Cognitive load**: Does symbol-level guidance improve or overwhelm agents?

4. **Computational scaling**: How does target enumeration scale with codebase size?

5. **Addressing fitness**: Which address spaces maximize stability and mapping coverage?

6. **Cross-project transfer**: Do optimal granularity choices transfer across projects?

--

## 13. Conclusion

Discrete differentiability transforms the quality optimization problem from "which metric should I improve?" to "which specific code location should I fix, and how much will it help?"

By computing target-space gradients, we:
1. Provide specific, actionable guidance
2. Surface high-value targets with cross-dimension impact
3. Enable granularity selection based on workflow needs

This is not merely priority ordering-it is actual gradient computation over discrete enumerable moves in code-space.

--

## Further Reading

- **[GEOMETRY.md](./GEOMETRY.md)** - Abstract quality geometry framework
- **[CONVERGENCE.md](./CONVERGENCE.md)** - Formal convergence theorem
- **[TOPOLOGY.md](./TOPOLOGY.md)** - Our metric instantiation
- **[CLAIMS.md](./CLAIMS.md)** - Citation inventory including discrete differentiability claims
