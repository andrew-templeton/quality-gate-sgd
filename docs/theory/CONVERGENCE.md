# Convergence Theory: Formal Foundations

> **Working Draft** - This document presents preliminary theoretical work. Claims marked `[NOVEL]` await empirical validation. Citations marked `[PENDING]` are being compiled. See [CLAIMS.md](./CLAIMS.md) for full status.

> Rigorous treatment of why quality-guided iteration converges

## 1. Problem Setup

### 1.1 Code Space

Let **C** be the space of all syntactically valid code states for a project. While |C| is astronomically large (effectively infinite for practical purposes), we operate on it through a finite measurement space.

### 1.2 Quality Function

A **quality function** maps code to measurements:

```
Q: C → M ⊆ ℝⁿ
```

Where M is a finite-granularity measurement space. Key properties:

- **Finite granularity**: Coverage is reported to 0.01% precision, counts are integers
- **Bounded range**: Coverage ∈ [0, 100], counts ∈ [0, max_reasonable]
- **|M| << |C|**: Many code states map to the same measurement

### 1.3 Equivalence Classes

Q induces equivalence classes on C:

```
c₁ ~ c₂  ⟺  Q(c₁) = Q(c₂)
```

Let [c] denote the equivalence class containing c. The quality function operates on equivalence classes, not individual code states.

### 1.4 Quality Ordering

Define a partial order on measurements:

```
m₁ ≺ m₂  ⟺  m₁ is "worse" than m₂ (for minimization objectives)
```

For our metrics:
- Lower coverage is worse: coverage(m₁) < coverage(m₂) → m₁ ≺ m₂
- Higher error count is worse: errors(m₁) > errors(m₂) → m₁ ≺ m₂

### 1.5 Target Set

Define the **target set** T ⊆ M as measurements that satisfy all quality constraints:

```
T = { m ∈ M : m satisfies all floors, ceilings, and constraints }
```

**Goal**: Starting from Q(c₀) ∉ T, reach some c* such that Q(c*) ∈ T.

--

## 2. The Agent Model

### 2.1 Feedback Function

Given current measurements Q(c), the **feedback function** F identifies what's wrong:

```
F: M → Feedback
F(m) = { failing constraints, their severity, remediation hints }
```

This is deterministic: same measurements → same feedback.

### 2.2 LLM Agent as Stochastic Proposer

The LLM agent A takes current code and feedback, proposes a modification:

```
A: C × Feedback → Distribution(C)
```

Given (c, F(Q(c))), the agent samples a new code state c' ~ A(c, F(Q(c))).

**Key assumption**: A is NOT a uniform sampler. It's biased by the feedback.

### 2.3 The Biased Proposer Property

**Definition (Biased Proposer)**: An agent A is a **biased proposer** with parameter p > 0.5 if:

```
P(Q(c') ≻ Q(c) | c' ~ A(c, F(Q(c)))) ≥ p
```

That is: given feedback about failing metrics, the agent proposes improvements with probability at least p.

**Claim**: Modern LLMs (GPT-4, Claude) are biased proposers for code quality tasks.

**Justification**: When told "fix this type error at line 42", the LLM:
- Understands the error semantics
- Proposes targeted fixes
- Does NOT propose random code changes

This is empirically testable (see Section 5).

--

## 3. The Convergence Theorem

### 3.1 Setup

Consider the iterative process:

```
c₀ → c₁ → c₂ → ... → c*
```

Where at each step:
1. Compute Q(cₜ) and F(Q(cₜ))
2. If Q(cₜ) ∈ T, terminate (success)
3. Otherwise, sample c' ~ A(cₜ, F(Q(cₜ)))
4. If Q(c') ≻ Q(cₜ) (improvement), set cₜ₊₁ = c'
5. Otherwise, reject and resample (go to step 3)

### 3.2 Theorem Statement

**Theorem (Finite Expected Convergence)**:

Let:
- Q: C → M be a quality function with finite |M|
- T ⊆ M be a non-empty target set
- A be a biased proposer with parameter p > 0.5
- The quality ordering ≺ have no infinite descending chains in M \ T

Then starting from any c₀ with Q(c₀) ∉ T:

```
E[τ] < ∞
```

Where τ = inf{t : Q(cₜ) ∈ T} is the stopping time.

### 3.3 Proof Sketch

**Step 1**: M is finite and ≺ has no infinite descending chains, so there's a maximum distance d(m) from any m to T.

**Step 2**: At each step, with probability ≥ p, we improve (move closer to T).

**Step 3**: This is a random walk with drift toward an absorbing set.

**Step 4**: By standard results on biased random walks [cite: Feller, Ross], absorption occurs in finite expected time.

**Step 5**: Expected number of proposals per accepted step is 1/p (geometric distribution).

**Step 6**: E[τ] ≤ d_max / p < ∞.

∎

### 3.4 Convergence Rate

**Corollary**: If d_max is the maximum distance from any m ∈ M \ T to T, then:

```
E[τ] ≤ d_max · (1 + (1-p)/p) = d_max / p
```

**Interpretation**:
- Smoother metrics (larger |M|) may increase d_max but provide finer feedback
- Higher p (better biased proposer) reduces expected iterations
- This explains why metric design (topology) matters

### 3.5 Target Granularity and Convergence Rate

The feedback function F can operate at different granularities:

| Granularity | Feedback Example | Information Content |
|-------|---------|-----------|
| Dimension | "improve coverage" | Low (entire codebase) |
| File | "fix src/payment.ts" | Medium (one file) |
| Symbol | "fix processPayment()" | High (one function) |

**Conjecture**: Finer granularity increases the bias parameter p.

**Rationale**: More specific feedback reduces agent search space:
- "Improve coverage" → agent must search entire codebase
- "Fix processPayment()" → agent focuses on one function

**Formal statement**: Let p_dim, p_file, p_symbol be bias parameters at each granularity.

**Hypothesis**: p_symbol > p_file > p_dim

If true, this implies: τ_symbol < τ_file < τ_dim (faster convergence with finer targets).

**See [DIFFERENTIABILITY.md](./DIFFERENTIABILITY.md)** for the mathematical framework of target-space gradients.

--

## 4. Local Continuity and Root-Cause Measurement

### 4.1 The Continuity Problem

**Naive measurement**: Q(c) = (coverage%, error_count, ...)

**Problem**: Fixing one root cause may fix N cascading errors.
- Example: Add missing type → fixes 10 downstream type errors
- This violates local continuity: small change → large metric jump

### 4.2 Root-Cause Measurement

**Solution**: Measure distinct root causes, not symptoms.

**Definition**: Two errors e₁, e₂ share a **root cause** if:
- They map to the same address_id (from the addressing scheme) and diagnostic code, OR
- They have the same (file, diagnostic_code, line_range) when address_id is unavailable, OR
- One error is a transitive consequence of the other

**Refined measurement**:
```
Q_root(c) = count of distinct root causes
```

### 4.3 Restored Continuity

With root-cause measurement:
- One fix → one root cause resolved → one unit of improvement
- Local continuity holds: small code change → small metric change
- The biased proposer property remains valid

### 4.4 Implementation

For TypeScript errors:
```typescript
function countRootCauses(errors: Diagnostic[]): number {
  const rootCauses = new Set<string>();
  for (const err of errors) {
    const addressId = getAddressId(err) ?? getLineRange(err);
    const key = `${err.file}:${err.code}:${addressId}`;
    rootCauses.add(key);
  }
  return rootCauses.size;
}
```

For SonarQube:
- Group by (address_id, rule) with file/line fallback
- Cascading issues share the same address_id

--

## 5. Empirical Validation Design

### 5.1 Biased Proposer Validation

**Experiment**: Measure P(improvement | feedback) for LLM agents.

**Protocol**:
1. Collect N code states with known quality issues
2. For each state cᵢ, generate feedback F(Q(cᵢ))
3. Ask LLM to propose fix c'ᵢ
4. Measure: did Q(c'ᵢ) ≻ Q(cᵢ)?
5. Compute p̂ = (# improvements) / N

**Hypothesis**: p̂ > 0.5 with statistical significance.

**Required sample size**: For 95% confidence that p > 0.5 when true p = 0.7:
- N ≈ 100 samples (power analysis)

### 5.2 Convergence Rate Validation

**Experiment**: Measure iterations to convergence.

**Protocol**:
1. Use SWE-bench or similar benchmark
2. Treatment: quality-gate-sgd with feedback
3. Baseline: LLM without quality feedback
4. Measure: iterations to pass, success rate

**Metrics**:
- Mean iterations to convergence
- Success rate at iteration cap
- Trajectory smoothness (monotonicity ratio)

--

## 6. Relationship to Classical Optimization

### 6.1 What This IS

| SGD Property | Our Analog |
|-------|------|
| Loss function L | Quality function Q |
| Gradient ∇L | Feedback F (priority ordering) |
| Step θ := θ - η∇L | Agent proposal c' ~ A(c, F) |
| Mini-batch noise | LLM stochasticity |
| Learning rate η | Agent responsiveness |

### 6.2 What This IS NOT

- **Not differentiable**: Q is discrete, no true gradient
- **Not continuous domain**: C is discrete code space
- **Not gradient computation**: F provides direction, not magnitude

### 6.3 The Valid Analogy

Both SGD and quality-guided iteration share:
1. **Descent in expectation**: E[Q(cₜ₊₁)] < E[Q(cₜ)] when not at optimum
2. **Stochastic exploration**: Noise prevents getting stuck
3. **Convergence under bias**: Drift toward optimum implies finite-time arrival

The analogy is valid for **behavioral properties**, not computational implementation.

--

## 7. Formal Assumptions Summary

For the convergence theorem to hold, we assume:

| Assumption | Justification | Testable? |
|------|--------|------|
| Finite |M| | Metric precision is bounded | Trivially true |
| Non-empty T | Achievable quality targets | By construction |
| Biased proposer (p > 0.5) | LLMs understand feedback | Yes (Section 5.1) |
| No infinite descending chains | Quality metrics have floors | By construction |

All assumptions are either trivially satisfied or empirically testable.

--

## 8. References

[To be populated with formal citations]

- Random walk convergence: Feller, "An Introduction to Probability Theory"
- Biased random walks: Ross, "Stochastic Processes"
- RLHF as feedback mechanism: Ouyang et al., "Training language models to follow instructions"
- Code quality metrics: ISO/IEC 25010, SonarQube documentation
- LLM code generation: Chen et al., "Evaluating Large Language Models Trained on Code"

--

## 9. Conclusion

Quality-guided iteration converges in finite expected time under the biased proposer assumption. This is not merely an analogy to SGD - it's a formally equivalent random walk with drift, applied to discrete code space through finite-granularity quality measurements.

The key contributions:
1. **Formal convergence theorem** with stated assumptions
2. **Root-cause measurement** to restore local continuity
3. **Testable biased proposer hypothesis** for empirical validation

The "SGD metaphor" is justified not as implementation equivalence, but as behavioral equivalence in the properties that matter: descent in expectation and finite-time convergence.
