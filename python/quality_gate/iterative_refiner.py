# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Iterative Quality-Gated Refinement Agent

Uses quality dimensions as SGD-style gradients to guide iterative improvement.
Does NOT block - instead provides feedback for the next iteration.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import json

from .evaluator_extended import (
    evaluate_extended_quality_gate,
    ExtendedQualityGateConfig,
    ExtendedQualityGateResult,
)
from .evaluator import PatchProposalReasoning


@dataclass
class IterationResult:
    """Result of a single iteration."""
    iteration: int
    quality: float
    reasoning_score: float
    implementation_score: float

    # Individual dimension scores
    documentation: float
    algebraic: float
    bijective: float

    # Feedback for next iteration
    feedback: str
    suggestions: List[str]

    # Gradient-style signals
    gradients: Dict[str, float]  # Which dimensions to improve

    # Cost tracking
    cost: float

    # Whether we've converged (all dimensions > threshold)
    converged: bool


@dataclass
class RefinementTrajectory:
    """Complete refinement trajectory."""
    task_id: str
    iterations: List[IterationResult] = field(default_factory=list)
    total_cost: float = 0.0
    converged: bool = False
    final_quality: float = 0.0


class IterativeQualityRefiner:
    """
    Iterative refiner that uses quality dimensions as SGD-style gradients.

    Key insight: Quality dimensions provide signals about WHERE to improve,
    not binary BLOCK/PASS decisions.
    """

    def __init__(
        self,
        config: Optional[ExtendedQualityGateConfig] = None,
        max_iterations: int = 5,
        plateau_threshold: float = 0.01,  # Stop if gradient magnitude < 0.01
        plateau_window: int = 2,  # Require plateau for N consecutive iterations
    ):
        """
        Initialize refiner with gradient-based convergence.

        Args:
            config: Quality gate configuration
            max_iterations: Maximum number of refinement iterations
            plateau_threshold: Stop if gradient magnitude < this value
            plateau_window: Number of consecutive low-gradient iterations to confirm plateau
        """
        self.config = config or ExtendedQualityGateConfig.from_env()
        self.max_iterations = max_iterations
        self.plateau_threshold = plateau_threshold
        self.plateau_window = plateau_window

    def evaluate_and_refine(
        self,
        task_id: str,
        reasoning: PatchProposalReasoning,
        diff: str,
        file_contents: Dict[str, str],
        requirements: str = "",
    ) -> RefinementTrajectory:
        """
        Evaluate quality and generate refinement trajectory.

        Uses gradient-based plateau detection to determine convergence.
        Stops when the rate of improvement becomes negligible.

        Returns trajectory showing quality improvement over iterations.
        """
        trajectory = RefinementTrajectory(task_id=task_id)
        plateau_counter = 0  # Track consecutive low-gradient iterations

        for iteration in range(1, self.max_iterations + 1):
            # Evaluate current iteration
            result = evaluate_extended_quality_gate(
                reasoning=reasoning,
                diff=diff,
                file_contents=file_contents,
                requirements=requirements,
                config=self.config
            )

            # Compute gradients (which dimensions need improvement)
            gradients = self._compute_gradients(result)

            # Generate feedback for next iteration
            feedback = self._generate_sgd_feedback(result, gradients, iteration)

            # Create iteration result
            iter_result = IterationResult(
                iteration=iteration,
                quality=result.quality.overall_quality,
                reasoning_score=result.quality.reasoning_score,
                implementation_score=result.quality.implementation_score,
                documentation=result.quality.documentation_completeness,
                algebraic=result.quality.algebraic_completeness,
                bijective=result.quality.bijective_requirements,
                feedback=feedback,
                suggestions=result.suggestions,
                gradients=gradients,
                cost=result.total_cost_usd,
                converged=False  # Will be set by plateau detection
            )

            trajectory.iterations.append(iter_result)
            trajectory.total_cost += iter_result.cost

            # Gradient-based plateau detection
            if iteration > 1:
                # Calculate quality improvement gradient
                prev_quality = trajectory.iterations[-2].quality
                quality_gradient = iter_result.quality - prev_quality

                # Calculate dimension gradient magnitudes
                gradient_magnitudes = [abs(g) for g in gradients.values()]
                max_gradient_magnitude = max(gradient_magnitudes)

                print(f"\nIteration {iteration}:")
                print(f"  Quality: {iter_result.quality:.4f} (Δ: {quality_gradient:+.4f})")
                print(f"  Max gradient magnitude: {max_gradient_magnitude:.4f}")

                # Check if we're on a plateau
                if abs(quality_gradient) < self.plateau_threshold:
                    plateau_counter += 1
                    print(f"  ⚠ Low gradient ({abs(quality_gradient):.4f}) - plateau counter: {plateau_counter}/{self.plateau_window}")
                else:
                    plateau_counter = 0  # Reset counter

                # If we've been on plateau for required window, converge
                if plateau_counter >= self.plateau_window:
                    trajectory.converged = True
                    trajectory.final_quality = iter_result.quality
                    iter_result.converged = True
                    print(f"✓ Converged at iteration {iteration}: gradient plateau detected")
                    print(f"   Quality improvement < {self.plateau_threshold} for {self.plateau_window} consecutive iterations")
                    break
            else:
                # First iteration - print quality
                print(f"\nIteration {iteration}:")
                print(f"  Quality: {iter_result.quality:.4f}")
                print(f"  Gradients: {', '.join(f'{k}: {v:+.4f}' for k, v in gradients.items())}")

            # If not last iteration, print feedback for next iteration
            if iteration < self.max_iterations and not iter_result.converged:
                print(f"\nFeedback for iteration {iteration + 1}:")
                print(feedback)
                print()

        # Set final quality
        if trajectory.iterations:
            trajectory.final_quality = trajectory.iterations[-1].quality

        # If we didn't converge via plateau, mark as converged anyway (hit max iterations)
        if not trajectory.converged and trajectory.iterations:
            print(f"⚠ Reached max iterations ({self.max_iterations}), using final quality: {trajectory.final_quality:.4f}")

        return trajectory

    def _compute_gradients(self, result: ExtendedQualityGateResult) -> Dict[str, float]:
        """
        Compute gradients: absolute distance from ideal (1.0).

        These gradients indicate how much room for improvement exists.
        Larger magnitude = more room to improve.

        Unlike fixed thresholds, this allows the system to naturally
        find the convergence point based on diminishing returns.
        """
        gradients = {}

        # Individual dimension gradients (distance from perfect 1.0)
        # This naturally prioritizes dimensions furthest from ideal
        if self.config.enable_documentation_completeness:
            gradients['documentation'] = result.quality.documentation_completeness - 1.0

        if self.config.enable_algebraic_completeness:
            gradients['algebraic'] = result.quality.algebraic_completeness - 1.0

        if self.config.enable_bijective_requirements:
            gradients['bijective'] = result.quality.bijective_requirements - 1.0

        # Overall gradient (distance from perfect)
        gradients['overall'] = result.quality.overall_quality - 1.0

        # Group gradients
        gradients['reasoning'] = result.quality.reasoning_score - 1.0
        gradients['implementation'] = result.quality.implementation_score - 1.0

        return gradients

    def _generate_sgd_feedback(
        self,
        result: ExtendedQualityGateResult,
        gradients: Dict[str, float],
        iteration: int
    ) -> str:
        """
        Generate SGD-style feedback: prioritize dimensions with largest negative gradients.

        Gradient magnitudes indicate room for improvement (distance from 1.0).
        """
        feedback_parts = []

        feedback_parts.append(f"=== Iteration {iteration} Quality Assessment ===")
        feedback_parts.append(f"Overall Quality: {result.quality.overall_quality:.4f}")
        feedback_parts.append(f"  Reasoning: {result.quality.reasoning_score:.4f}")
        feedback_parts.append(f"  Implementation: {result.quality.implementation_score:.4f}")
        feedback_parts.append("")

        # Sort dimensions by gradient magnitude (largest = most room to improve)
        dim_gradients = {
            'documentation': gradients.get('documentation', 0),
            'algebraic': gradients.get('algebraic', 0),
            'bijective': gradients.get('bijective', 0),
        }

        # Sort by magnitude (most negative = largest room for improvement)
        sorted_dims = sorted(dim_gradients.items(), key=lambda x: x[1])

        # All dimensions have room for improvement (all < 1.0)
        # Prioritize those with largest negative gradients
        feedback_parts.append("Improvement priorities (by gradient magnitude):")
        feedback_parts.append("")

        for dim, grad in sorted_dims:
            score = grad + 1.0  # Recover original score from gradient
            improvement_room = abs(grad)  # How far from perfect (1.0)

            emoji = "🔴" if improvement_room > 0.5 else "🟡" if improvement_room > 0.2 else "🟢"
            feedback_parts.append(f"{emoji} {dim.upper()}: {score:.4f} (room: {improvement_room:.4f})")

            # Add specific guidance based on dimension
            if dim == 'documentation' and improvement_room > 0.2:
                feedback_parts.append("   → Add header comments to modified files")
                feedback_parts.append("   → Document new functions/classes with docstrings")
                feedback_parts.append("   → Explain WHY changes were made")

            elif dim == 'algebraic' and improvement_room > 0.2:
                if result.algebraic_result and result.algebraic_result.categories:
                    for cat in result.algebraic_result.categories:
                        if cat.completeness_ratio < 1.0:
                            feedback_parts.append(f"   → {cat.category.value} category incomplete: {cat.actual_duals}/{cat.expected_duals} duals")
                            for missing in cat.missing_duals:
                                feedback_parts.append(f"      • Consider updating: {missing}")

            elif dim == 'bijective' and improvement_room > 0.2:
                if result.bijective_result:
                    bij = result.bijective_result
                    if bij.phase3_alignment.score < 0.80:
                        feedback_parts.append(f"   → Test-Code alignment: {bij.phase3_alignment.score:.4f}")
                        feedback_parts.append(f"      • Tests expect {bij.phase3_alignment.forward_total} operations")
                        feedback_parts.append(f"      • Code implements {bij.phase3_alignment.backward_total} operations")

            feedback_parts.append("")

        # Add top actionable suggestions
        if result.suggestions:
            feedback_parts.append("Actionable suggestions:")
            for i, suggestion in enumerate(result.suggestions[:3], 1):
                feedback_parts.append(f"  {i}. {suggestion}")
            feedback_parts.append("")

        return "\n".join(feedback_parts)

    def print_trajectory(self, trajectory: RefinementTrajectory):
        """Print human-readable trajectory summary."""
        print("=" * 80)
        print(f"REFINEMENT TRAJECTORY: {trajectory.task_id}")
        print("=" * 80)
        print()

        print("Iteration Progress:")
        print("-" * 80)
        print(f"{'Iter':<6} {'Quality':<10} {'Reasoning':<12} {'Implementation':<15} {'Doc':<8} {'Alg':<8} {'Bij':<8}")
        print("-" * 80)

        for iter_result in trajectory.iterations:
            print(
                f"{iter_result.iteration:<6} "
                f"{iter_result.quality:<10.2f} "
                f"{iter_result.reasoning_score:<12.2f} "
                f"{iter_result.implementation_score:<15.2f} "
                f"{iter_result.documentation:<8.2f} "
                f"{iter_result.algebraic:<8.2f} "
                f"{iter_result.bijective:<8.2f}"
            )

        print("-" * 80)
        print()

        # Summary
        print("Summary:")
        print(f"  Total iterations: {len(trajectory.iterations)}")
        print(f"  Converged: {'✓ YES' if trajectory.converged else '✗ NO'}")
        print(f"  Final quality: {trajectory.final_quality:.2f}")
        print(f"  Total cost: ${trajectory.total_cost:.2f}")
        print()

        # Quality improvement
        if len(trajectory.iterations) > 1:
            initial = trajectory.iterations[0].quality
            final = trajectory.iterations[-1].quality
            improvement = final - initial
            print(f"  Quality improvement: {improvement:+.2f} ({initial:.2f} → {final:.2f})")

        print()

    def export_trajectory(self, trajectory: RefinementTrajectory, output_file: str):
        """Export trajectory to JSON for analysis."""
        data = {
            'task_id': trajectory.task_id,
            'converged': trajectory.converged,
            'final_quality': trajectory.final_quality,
            'total_cost': trajectory.total_cost,
            'iterations': [
                {
                    'iteration': iter_res.iteration,
                    'quality': iter_res.quality,
                    'reasoning_score': iter_res.reasoning_score,
                    'implementation_score': iter_res.implementation_score,
                    'dimensions': {
                        'documentation': iter_res.documentation,
                        'algebraic': iter_res.algebraic,
                        'bijective': iter_res.bijective,
                    },
                    'gradients': iter_res.gradients,
                    'feedback': iter_res.feedback,
                    'cost': iter_res.cost,
                }
                for iter_res in trajectory.iterations
            ]
        }

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)


# =============================================================================
# Helper Functions
# =============================================================================

def refine_with_quality_gate(
    task_id: str,
    reasoning: PatchProposalReasoning,
    diff: str,
    file_contents: Dict[str, str],
    requirements: str = "",
    max_iterations: int = 3,
    config: Optional[ExtendedQualityGateConfig] = None
) -> RefinementTrajectory:
    """
    Convenience function for iterative refinement.

    Args:
        task_id: Task identifier
        reasoning: Patch reasoning
        diff: Code diff
        file_contents: File contents (only files in diff)
        requirements: Requirements text
        max_iterations: Maximum refinement iterations
        config: Quality gate config

    Returns:
        RefinementTrajectory showing quality improvement
    """
    refiner = IterativeQualityRefiner(
        config=config,
        max_iterations=max_iterations
    )

    return refiner.evaluate_and_refine(
        task_id=task_id,
        reasoning=reasoning,
        diff=diff,
        file_contents=file_contents,
        requirements=requirements
    )
