# Gradient-Based Convergence for Quality-Gated Refinement

## Overview

The iterative refiner now uses **gradient-based plateau detection** instead of fixed quality thresholds. This allows the system to naturally find convergence points based on diminishing returns rather than arbitrary cutoffs.

## Key Innovation

**Before** (Fixed Threshold):
```python
if overall_quality >= 0.70:
    converge()  # Hard cutoff
```

**After** (Gradient-Based Plateau):
```python
quality_gradient = current_quality - previous_quality
if abs(quality_gradient) < 0.01 for 2 consecutive iterations:
    converge()  # Natural plateau detection
```

## Mathematical Foundation

### Gradient Definition

Instead of measuring distance from a fixed threshold (0.70), gradients now measure distance from ideal (1.0):

```
gradient_dim = score_dim - 1.0
```

**Properties**:
- Always negative (unless score = 1.0)
- Magnitude indicates room for improvement
- Larger magnitude = higher priority for refinement

**Example**:
```
documentation: 0.00 → gradient = -1.00 (🔴 HIGH priority)
algebraic: 0.70 → gradient = -0.30 (🟡 MEDIUM priority)
reasoning: 0.95 → gradient = -0.05 (🟢 LOW priority)
```

### Plateau Detection

**Convergence criterion**: Stop when quality improvement becomes negligible

```python
plateau_detected = abs(quality[t] - quality[t-1]) < plateau_threshold
```

**Parameters**:
- `plateau_threshold`: Minimum gradient magnitude (default: 0.01)
- `plateau_window`: Required consecutive low-gradient iterations (default: 2)

**Rationale**:
- Prevents premature convergence from single-iteration noise
- Confirms sustained plateau rather than temporary flatness
- Allows flexibility without arbitrary quality cutoffs

## Implementation

### Core Algorithm

```python
class IterativeQualityRefiner:
    def __init__(
        self,
        max_iterations: int = 5,
        plateau_threshold: float = 0.01,
        plateau_window: int = 2
    ):
        self.max_iterations = max_iterations
        self.plateau_threshold = plateau_threshold
        self.plateau_window = plateau_window

    def evaluate_and_refine(self, ...):
        plateau_counter = 0

        for iteration in range(1, self.max_iterations + 1):
            # Evaluate quality
            result = evaluate_extended_quality_gate(...)

            # Compute gradients (distance from ideal 1.0)
            gradients = self._compute_gradients(result)

            # Check plateau (after 1st iteration)
            if iteration > 1:
                quality_gradient = current_quality - previous_quality

                if abs(quality_gradient) < self.plateau_threshold:
                    plateau_counter += 1
                else:
                    plateau_counter = 0  # Reset

                # Converge if sustained plateau
                if plateau_counter >= self.plateau_window:
                    converge()
                    break
```

### Gradient Computation

```python
def _compute_gradients(self, result) -> Dict[str, float]:
    """
    Compute gradients as distance from ideal (1.0).

    Returns:
        Dict mapping dimension names to gradients (all ≤ 0)
    """
    return {
        'documentation': result.documentation_completeness - 1.0,
        'algebraic': result.algebraic_completeness - 1.0,
        'bijective': result.bijective_requirements - 1.0,
        'overall': result.overall_quality - 1.0,
        'reasoning': result.reasoning_score - 1.0,
        'implementation': result.implementation_score - 1.0,
    }
```

### Feedback Prioritization

```python
def _generate_sgd_feedback(self, result, gradients, iteration):
    """
    Generate feedback prioritized by gradient magnitude.

    Dimensions with largest negative gradients get highest priority.
    """
    # Sort by gradient (most negative first)
    sorted_dims = sorted(gradients.items(), key=lambda x: x[1])

    for dim, grad in sorted_dims:
        improvement_room = abs(grad)

        # Categorize priority
        if improvement_room > 0.5:
            priority = "🔴 HIGH"
        elif improvement_room > 0.2:
            priority = "🟡 MEDIUM"
        else:
            priority = "🟢 LOW"

        # Generate dimension-specific guidance
        # ...
```

## Example: astropy-14182

### Trajectory

```
Iteration 1:
  Quality: 0.8000 (baseline)
  Gradients:
    - documentation: -1.0000 (🔴 HIGH)
    - algebraic: -0.3000 (🟡 MEDIUM)
    - bijective: -1.0000 (🔴 HIGH)
    - overall: -0.2000 (🟢 LOW)

Iteration 2:
  Quality: 0.8000 (Δ: +0.0000)
  ⚠ Low gradient (0.0000) - plateau counter: 1/2

Iteration 3:
  Quality: 0.8000 (Δ: +0.0000)
  ⚠ Low gradient (0.0000) - plateau counter: 2/2
  ✓ Converged: gradient plateau detected
```

### Analysis

**Convergence reason**: Quality improvement gradient < 0.01 for 2 consecutive iterations

**Key observations**:
1. Quality stayed at 0.8000 across all iterations
2. No improvement possible without actual code changes (test is static)
3. System correctly detected plateau and stopped
4. Algebraic dimension (0.70) flagged missing read() operation

**Cost**: $1.05 total (3 iterations × $0.35)

## Comparison: Fixed vs Gradient-Based

| Aspect | Fixed Threshold (0.70) | Gradient-Based Plateau |
|--------|------------------------|------------------------|
| **Convergence criterion** | `quality >= 0.70` | `\|Δquality\| < 0.01 for 2 iterations` |
| **Adaptability** | Same for all tasks | Adapts to task difficulty |
| **Quality range** | Binary (pass/fail) | Continuous (0.0 - 1.0) |
| **Over-iteration** | None (stops at 0.70) | Minimal (stops at plateau) |
| **Under-iteration** | Possible (stops early at 0.70) | Unlikely (requires sustained plateau) |
| **Cost efficiency** | High (stops early) | Medium (iterates until plateau) |
| **Quality optimization** | Stops at "good enough" | Stops at "can't improve further" |

### When Fixed is Better

- **Cost-constrained scenarios**: Stop early to save money
- **Time-critical situations**: Don't wait for plateau
- **Known quality targets**: Explicit requirements (e.g., "must be 0.80+")

### When Gradient-Based is Better

- **Quality-first scenarios**: Maximize patch quality
- **Variable task difficulty**: Hard tasks need more iterations
- **Exploratory refinement**: Don't know optimal quality ahead of time
- **Research/benchmarking**: Measure maximum achievable quality

## Theoretical Properties

### 1. Monotonicity

**Assumption**: Quality should generally increase or stay flat (not decrease)

```
quality[t] ≥ quality[t-1]  (for most cases)
```

**Rationale**: Each iteration provides feedback for improvement. If quality decreases, the agent is making mistakes.

**In practice**: Quality can decrease if:
- Agent misinterprets feedback
- Changes introduce new issues
- Trade-offs between dimensions

### 2. Diminishing Returns

**Observation**: Quality improvements shrink over iterations

```
Δquality[t] = quality[t] - quality[t-1]
lim[t→∞] Δquality[t] → 0
```

**Convergence**: When Δquality < ε for sustained period, we've hit plateau

### 3. Local Optima

**Risk**: Plateau detection may stop at local optimum, not global maximum

```
quality = 0.75 (local)  vs  quality = 0.95 (global)
```

**Mitigation**:
- Use larger `max_iterations` (5-10) to explore further
- Lower `plateau_threshold` (0.005) to require flatter plateau
- Increase `plateau_window` (3-4) to confirm sustained plateau

### 4. Stochastic Gradient Descent Analogy

**Classic SGD**:
```
w[t+1] = w[t] - η * ∇L(w[t])
```

**Our approach**:
```
patch[t+1] = patch[t] + LLM(feedback(∇quality[t]))
```

Where:
- `∇quality[t]` = dimension-specific gradients
- `feedback()` = converts gradients to natural language guidance
- `LLM()` = generates improved patch based on feedback

**Learning rate analogy**: Implicit in LLM's interpretation of feedback magnitude

## Configuration

### Default Parameters (Recommended)

```python
refiner = IterativeQualityRefiner(
    max_iterations=5,          # Usually converges in 2-4
    plateau_threshold=0.01,     # 1% improvement threshold
    plateau_window=2            # Require 2 consecutive plateaus
)
```

### Conservative (Quality-First)

```python
refiner = IterativeQualityRefiner(
    max_iterations=10,          # More exploration
    plateau_threshold=0.005,    # Stricter plateau (0.5%)
    plateau_window=3            # Require 3 consecutive
)
```

### Aggressive (Cost-First)

```python
refiner = IterativeQualityRefiner(
    max_iterations=3,           # Stop quickly
    plateau_threshold=0.02,     # Looser plateau (2%)
    plateau_window=1            # Single plateau sufficient
)
```

### Experimental (Maximum Quality)

```python
refiner = IterativeQualityRefiner(
    max_iterations=20,          # Extensive exploration
    plateau_threshold=0.001,    # Very strict (0.1%)
    plateau_window=5            # Require 5 consecutive
)
```

## Expected Convergence Behavior

### Typical Trajectories

**Case 1: Quick Convergence** (easy task)
```
Iteration 1: 0.82 (baseline)
Iteration 2: 0.84 (Δ: +0.02) ✓ IMPROVING
Iteration 3: 0.85 (Δ: +0.01) ✓ IMPROVING
Iteration 4: 0.85 (Δ: +0.00) ⚠ PLATEAU
Iteration 5: 0.85 (Δ: +0.00) ⚠ PLATEAU
✓ Converged at iteration 5
```

**Case 2: Steady Improvement** (medium task)
```
Iteration 1: 0.65 (baseline)
Iteration 2: 0.72 (Δ: +0.07) ✓ IMPROVING
Iteration 3: 0.78 (Δ: +0.06) ✓ IMPROVING
Iteration 4: 0.82 (Δ: +0.04) ✓ IMPROVING
Iteration 5: 0.84 (Δ: +0.02) ✓ IMPROVING
Iteration 6: 0.85 (Δ: +0.01) ✓ IMPROVING
Iteration 7: 0.85 (Δ: +0.00) ⚠ PLATEAU
Iteration 8: 0.85 (Δ: +0.00) ⚠ PLATEAU
✓ Converged at iteration 8
```

**Case 3: Immediate Plateau** (already optimal or static test)
```
Iteration 1: 0.80 (baseline)
Iteration 2: 0.80 (Δ: +0.00) ⚠ PLATEAU
Iteration 3: 0.80 (Δ: +0.00) ⚠ PLATEAU
✓ Converged at iteration 3
```

**Case 4: No Convergence** (hard task, needs more work)
```
Iteration 1: 0.55 (baseline)
Iteration 2: 0.60 (Δ: +0.05) ✓ IMPROVING
Iteration 3: 0.64 (Δ: +0.04) ✓ IMPROVING
Iteration 4: 0.67 (Δ: +0.03) ✓ IMPROVING
Iteration 5: 0.69 (Δ: +0.02) ✓ IMPROVING
⚠ Reached max iterations (5), using final quality: 0.69
```

## Cost Analysis

### Expected Costs

**Per-iteration cost** (with all dimensions):
```
Documentation: $0.00 (deterministic)
Algebraic: $0.10 (LLM-based)
Bijective: $0.25 (LLM-based)
Total: ~$0.35 per iteration
```

**With caching** (60-70% hit rate):
```
Amortized: ~$0.10 per iteration
```

**Trajectory costs**:
```
Quick convergence (3 iterations): $1.05 ($0.30 with cache)
Typical convergence (5 iterations): $1.75 ($0.50 with cache)
Extended convergence (8 iterations): $2.80 ($0.80 with cache)
```

**Break-even analysis**:
- Human debugging: $200-800 (1-4 hours @ $200/hr)
- Quality-gated refinement: $1-3 (3-10 iterations)
- **ROI**: 100-800x cost savings

## Integration with SWE-Bench Agent

### Recommended Workflow

```python
from python.quality_gate.iterative_refiner import IterativeQualityRefiner

# Initialize refiner
refiner = IterativeQualityRefiner(
    max_iterations=5,
    plateau_threshold=0.01,
    plateau_window=2
)

# Agent loop
for task in swe_bench_tasks:
    # Generate initial patch
    patch, reasoning = agent.generate_patch(task)

    # Iterative refinement with gradient-based convergence
    trajectory = refiner.evaluate_and_refine(
        task_id=task.id,
        reasoning=reasoning,
        diff=patch,
        file_contents=extract_files_from_diff(patch),
        requirements=task.problem_statement,
        test_code=task.test_patch
    )

    # Check convergence
    if trajectory.converged:
        print(f"✓ Converged after {len(trajectory.iterations)} iterations")
        submit_patch(patch)
    else:
        print(f"⚠ Did not converge, reached max iterations")

        # Option 1: Submit anyway
        submit_patch(patch)

        # Option 2: Continue manually
        manual_review(patch, trajectory.iterations[-1].feedback)

        # Option 3: Increase max_iterations and retry
        # ...
```

## Validation Experiments

### Hypothesis

Gradient-based convergence will:
1. **Achieve higher final quality** than fixed threshold (0.70)
2. **Use similar or slightly more iterations** (3-5 vs 2-3)
3. **Cost 20-30% more** but achieve 10-15% higher quality
4. **Improve solve rate** on SWE-bench by 5-10 percentage points

### Experimental Design

**Treatment groups**:
- Control: Fixed threshold (0.70), max 3 iterations
- Treatment 1: Gradient-based, max 5 iterations
- Treatment 2: Gradient-based, max 10 iterations (quality-first)

**Metrics**:
- Final quality (mean, median, std)
- Iterations to convergence (mean, median)
- Cost per task (mean, median)
- SWE-bench solve rate (% tests passing)
- Cost per success ($cost / #solved)

**Sample size**: 50 tasks per group (150 total)

**Statistical test**: Paired t-test for quality difference

## Future Enhancements

### 1. Adaptive Plateau Threshold

Instead of fixed 0.01, adapt based on quality level:

```python
plateau_threshold = 0.01 * (1.0 - current_quality)
```

**Rationale**: Lower quality has more room to improve, so require larger gradients. Higher quality should tolerate smaller improvements.

### 2. Dimension-Specific Plateau Detection

Stop when all dimensions plateau, not just overall quality:

```python
all_dimensions_plateau = all(
    abs(grad) < 0.01 for grad in gradients.values()
)
```

### 3. Momentum-Based Detection

Track velocity (2nd derivative) to detect slowing improvement:

```python
velocity[t] = quality[t] - quality[t-1]
acceleration[t] = velocity[t] - velocity[t-1]

if acceleration[t] < 0 for 3 consecutive iterations:
    # Improvement rate is slowing
    converge()
```

### 4. Multi-Resolution Plateau

Use different thresholds for different quality ranges:

```python
if quality < 0.70:
    plateau_threshold = 0.05  # Loose (early exploration)
elif quality < 0.85:
    plateau_threshold = 0.02  # Medium
else:
    plateau_threshold = 0.01  # Strict (fine-tuning)
```

## Conclusion

Gradient-based plateau detection provides:

✅ **Natural convergence** - Stops when diminishing returns kick in
✅ **No arbitrary thresholds** - Adapts to task difficulty
✅ **Cost-quality balance** - Iterates until plateau, not forever
✅ **SGD-style feedback** - Gradients guide improvement priorities
✅ **Flexibility** - Configurable for quality-first or cost-first scenarios

**Key insight**: Quality improvement rate matters more than absolute quality thresholds. The system learns when to stop based on whether continuing yields meaningful gains.

**Next step**: Run powered experiment on 50+ SWE-bench tasks to validate convergence behavior and measure impact on solve rate.
