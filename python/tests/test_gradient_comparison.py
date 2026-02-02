#!/usr/bin/env python3
"""
Visual Comparison: Fixed Threshold vs Gradient-Based Convergence

Demonstrates the difference in convergence behavior between:
1. Fixed threshold (0.70) - stops when quality >= threshold
2. Gradient-based plateau - stops when improvement rate < ε
"""


def simulate_quality_trajectory_easy():
    """Easy task: Quick convergence to high quality."""
    return [0.82, 0.84, 0.85, 0.85, 0.85]


def simulate_quality_trajectory_medium():
    """Medium task: Steady improvement."""
    return [0.65, 0.72, 0.78, 0.82, 0.84, 0.85, 0.85, 0.85]


def simulate_quality_trajectory_hard():
    """Hard task: Slow improvement, doesn't reach high quality."""
    return [0.55, 0.60, 0.64, 0.67, 0.69, 0.71, 0.72, 0.73, 0.73, 0.73]


def simulate_quality_trajectory_plateau():
    """Already optimal: Immediate plateau."""
    return [0.80, 0.80, 0.80, 0.80, 0.80]


def fixed_threshold_convergence(trajectory, threshold=0.70):
    """Fixed threshold: Stop when quality >= threshold."""
    for i, quality in enumerate(trajectory, 1):
        if quality >= threshold:
            return i, quality
    return len(trajectory), trajectory[-1]


def gradient_based_convergence(trajectory, plateau_threshold=0.01, plateau_window=2):
    """Gradient-based: Stop when |Δquality| < ε for N iterations."""
    plateau_counter = 0

    for i in range(1, len(trajectory)):
        gradient = trajectory[i] - trajectory[i-1]

        if abs(gradient) < plateau_threshold:
            plateau_counter += 1
        else:
            plateau_counter = 0

        if plateau_counter >= plateau_window:
            return i + 1, trajectory[i]

    return len(trajectory), trajectory[-1]


def visualize_trajectory(trajectory, name, fixed_iter, gradient_iter):
    """Visualize quality trajectory with convergence points."""
    print(f"\n{name}")
    print("=" * 80)

    # Print trajectory
    print("Iteration | Quality  | Δ Quality | Fixed? | Gradient?")
    print("-" * 80)

    for i, quality in enumerate(trajectory, 1):
        delta = ""
        if i > 1:
            delta = f"{trajectory[i-1] - trajectory[i-2]:+.4f}" if i > 1 else ""

        fixed_marker = "✓ STOP" if i == fixed_iter else ""
        gradient_marker = "✓ STOP" if i == gradient_iter else ""

        print(f"{i:<9} | {quality:<8.4f} | {delta:<9} | {fixed_marker:<6} | {gradient_marker}")

    print("-" * 80)

    # Summary
    fixed_quality = trajectory[fixed_iter - 1]
    gradient_quality = trajectory[gradient_iter - 1]

    print(f"\nFixed Threshold (0.70):")
    print(f"  Converged at iteration {fixed_iter}, quality = {fixed_quality:.4f}")

    print(f"\nGradient-Based Plateau:")
    print(f"  Converged at iteration {gradient_iter}, quality = {gradient_quality:.4f}")

    # Analysis
    print(f"\nComparison:")
    iteration_diff = gradient_iter - fixed_iter
    quality_diff = gradient_quality - fixed_quality

    if iteration_diff > 0:
        print(f"  Gradient-based iterated {iteration_diff} more times")
    elif iteration_diff < 0:
        print(f"  Fixed threshold iterated {abs(iteration_diff)} more times")
    else:
        print(f"  Both converged at same iteration")

    if quality_diff > 0:
        print(f"  Gradient-based achieved {quality_diff:.4f} higher quality")
    elif quality_diff < 0:
        print(f"  Fixed threshold achieved {abs(quality_diff):.4f} higher quality")
    else:
        print(f"  Both achieved same quality")


def main():
    print("=" * 80)
    print("CONVERGENCE COMPARISON: Fixed Threshold vs Gradient-Based Plateau")
    print("=" * 80)

    # Test cases
    cases = [
        ("Case 1: Easy Task (Quick Convergence)", simulate_quality_trajectory_easy()),
        ("Case 2: Medium Task (Steady Improvement)", simulate_quality_trajectory_medium()),
        ("Case 3: Hard Task (Slow Progress)", simulate_quality_trajectory_hard()),
        ("Case 4: Immediate Plateau (Already Optimal)", simulate_quality_trajectory_plateau()),
    ]

    results = []

    for name, trajectory in cases:
        fixed_iter, fixed_quality = fixed_threshold_convergence(trajectory, threshold=0.70)
        gradient_iter, gradient_quality = gradient_based_convergence(
            trajectory,
            plateau_threshold=0.01,
            plateau_window=2
        )

        visualize_trajectory(trajectory, name, fixed_iter, gradient_iter)

        results.append({
            'name': name,
            'fixed_iter': fixed_iter,
            'fixed_quality': fixed_quality,
            'gradient_iter': gradient_iter,
            'gradient_quality': gradient_quality,
        })

    # Overall summary
    print("\n" + "=" * 80)
    print("OVERALL SUMMARY")
    print("=" * 80)

    print("\n| Case | Fixed Iter | Fixed Quality | Gradient Iter | Gradient Quality | Δ Iter | Δ Quality |")
    print("|------|-----------|--------------|--------------|-----------------|--------|-----------|")

    for r in results:
        delta_iter = r['gradient_iter'] - r['fixed_iter']
        delta_quality = r['gradient_quality'] - r['fixed_quality']

        case_short = r['name'].split(':')[0]

        print(
            f"| {case_short:<12} | "
            f"{r['fixed_iter']:<9} | "
            f"{r['fixed_quality']:<12.4f} | "
            f"{r['gradient_iter']:<12} | "
            f"{r['gradient_quality']:<15.4f} | "
            f"{delta_iter:+6} | "
            f"{delta_quality:+9.4f} |"
        )

    # Key insights
    print("\n" + "=" * 80)
    print("KEY INSIGHTS")
    print("=" * 80)

    print("\n1. EASY TASKS (Case 1):")
    print("   - Fixed stops early (iteration 1 at 0.82)")
    print("   - Gradient continues to 0.85 (3 more iterations)")
    print("   - Trade-off: +3 iterations for +0.03 quality")

    print("\n2. MEDIUM TASKS (Case 2):")
    print("   - Fixed stops at 0.72 (iteration 2)")
    print("   - Gradient continues to 0.85 (6 more iterations)")
    print("   - Trade-off: +6 iterations for +0.13 quality")

    print("\n3. HARD TASKS (Case 3):")
    print("   - Fixed stops at 0.71 (iteration 6)")
    print("   - Gradient continues to 0.73 (4 more iterations)")
    print("   - Trade-off: +4 iterations for +0.02 quality")

    print("\n4. PLATEAU TASKS (Case 4):")
    print("   - Fixed stops immediately (iteration 1 at 0.80)")
    print("   - Gradient detects plateau (iteration 3 at 0.80)")
    print("   - Trade-off: +2 unnecessary iterations")

    print("\n" + "=" * 80)
    print("CONCLUSION")
    print("=" * 80)

    print("\n✓ Gradient-based convergence achieves higher quality in most cases")
    print("✓ Cost: 2-6 more iterations on average")
    print("✓ Benefit: 0.02-0.13 higher final quality")
    print("✓ Best for: Variable task difficulty, quality-first scenarios")
    print("✓ Fixed threshold better for: Cost-first, known quality targets")

    print("\n⚠ Recommendation: Use gradient-based for SWE-bench (quality matters)")
    print("⚠ Cost impact: +$0.70 - $2.10 per task (2-6 iterations × $0.35)")
    print("⚠ Quality impact: +0.02 - 0.13 improvement (could mean passing tests)")

    return 0


if __name__ == "__main__":
    exit(main())
