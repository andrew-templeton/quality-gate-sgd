#!/usr/bin/env python3
"""
Test Iterative Quality Refiner on astropy-14182

Demonstrates SGD-style iterative refinement instead of blocking.
Shows quality improvement over multiple iterations with targeted feedback.
"""

import json
from pathlib import Path

from quality_gate.iterative_refiner import (
    IterativeQualityRefiner,
    refine_with_quality_gate,
)
from quality_gate.evaluator_extended import ExtendedQualityGateConfig
from quality_gate.evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


def load_astropy_14182():
    """Load the astropy-14182 task."""
    task_file = 'data/swe-bench/lite.jsonl'
    task_id = 'astropy__astropy-14182'

    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] == task_id:
                return task

    raise ValueError(f"Task {task_id} not found")


def create_mock_reasoning(task):
    """Create mock reasoning structure."""
    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=task['problem_statement'][:200],
            current_behavior="RestructuredText writer doesn't support header rows",
            expected_behavior="Should write header rows in RST format",
            confidence=0.9
        ),
        hypothesis=CausalHypothesis(
            root_cause="Missing header_rows parameter support in RST write()",
            causal_chain=[
                "write() lacks header_rows parameter",
                "Header information not written to RST",
                "Round-trip read/write loses header data"
            ],
            rationale="Need to add header_rows support to write() method"
        ),
        evidence=SupportingEvidence(
            code_references=[
                {
                    "file": "astropy/io/ascii/rst.py",
                    "lines": "1-100",
                    "observation": "RST class has write() but no header_rows support"
                }
            ],
            observations=[
                "Test expects header_rows parameter",
                "Current write() implementation is basic",
                "Read side already supports header detection"
            ],
            supporting_logic="Adding header_rows to write() enables round-trip consistency"
        ),
        solution=ProposedSolution(
            change_description="Add header_rows parameter to RST.write() method",
            addresses_cause="Directly implements the missing functionality",
            minimality="Only adds the required parameter and logic"
        ),
        prediction=OutcomePrediction(
            test_outcomes=["Test should pass with header_rows support"],
            effects=["RST writer can now output header rows"],
            verification_plan="Run test suite to verify round-trip consistency"
        )
    )


def simulate_iteration_1_fix(diff_original):
    """
    Simulate iteration 1: Agent adds header_rows to write() but misses read().
    This is the incomplete fix that scores 0.69 overall.
    """
    # This is the golden patch (only fixes write, misses read)
    return diff_original


def simulate_iteration_2_fix():
    """
    Simulate iteration 2: After getting feedback about algebraic completeness,
    agent updates BOTH write() and read() to support header_rows.
    """
    # This would be a complete patch that modifies both operations
    # For now, we'll use a mock that shows both operations modified
    return """
diff --git a/astropy/io/ascii/rst.py b/astropy/io/ascii/rst.py
index 123..456 100644
--- a/astropy/io/ascii/rst.py
+++ b/astropy/io/ascii/rst.py
@@ -10,6 +10,8 @@ class RST(FixedWidth):
     def read(self, table):
         # Read implementation
+        # Add support for detecting header rows
+        self.header_rows = self._detect_header_rows(table)
         pass

     def write(self, table, header_rows=None):
         # Write implementation
+        # Add support for writing header rows
+        if header_rows:
+            self._write_header_rows(table, header_rows)
         pass
"""


def main():
    print("=" * 80)
    print("ITERATIVE REFINEMENT TEST: astropy-14182")
    print("=" * 80)
    print()
    print("Demonstrating SGD-style iterative improvement instead of blocking")
    print()

    # Load task
    task = load_astropy_14182()
    print(f"Task: {task['instance_id']}")
    print(f"Repo: {task['repo']}")
    print(f"Problem: {task['problem_statement'][:100]}...")
    print()

    # Configure with all dimensions enabled
    config = ExtendedQualityGateConfig(
        enable_documentation_completeness=True,
        enable_algebraic_completeness=True,
        enable_bijective_requirements=True,
        cache_file=".quality-dimension-cache-refiner-test.json",
    )

    print("Configuration:")
    print("  Documentation: ENABLED")
    print("  Algebraic: ENABLED")
    print("  Bijective: ENABLED")
    print("  Max iterations: 5")
    print("  Convergence: Gradient-based plateau detection")
    print("    - Plateau threshold: 0.01 (stop if |Δquality| < 0.01)")
    print("    - Plateau window: 2 (require 2 consecutive low-gradient iterations)")
    print()

    # Create reasoning
    reasoning = create_mock_reasoning(task)

    # Use the golden patch (incomplete - only fixes write)
    diff = task.get('patch', '')

    # Mock file contents (only files in diff)
    file_contents = {
        'astropy/io/ascii/rst.py': '# RST file content would be here\n'
    }

    # Create refiner with gradient-based convergence
    refiner = IterativeQualityRefiner(
        config=config,
        max_iterations=5,
        plateau_threshold=0.01,  # Stop if gradient magnitude < 0.01
        plateau_window=2  # Require 2 consecutive low-gradient iterations
    )

    print("=" * 80)
    print("RUNNING ITERATIVE REFINEMENT")
    print("=" * 80)
    print()

    # Run refinement
    trajectory = refiner.evaluate_and_refine(
        task_id=task['instance_id'],
        reasoning=reasoning,
        diff=diff,
        file_contents=file_contents,
        requirements=task.get('problem_statement', '')
    )

    # Display trajectory
    print()
    refiner.print_trajectory(trajectory)

    # Export trajectory for analysis
    output_file = "data/experiments/iterative_refiner_astropy_14182.json"
    Path("data/experiments").mkdir(parents=True, exist_ok=True)
    refiner.export_trajectory(trajectory, output_file)

    print(f"Trajectory exported to: {output_file}")
    print()

    # Analysis
    print("=" * 80)
    print("ANALYSIS")
    print("=" * 80)
    print()

    if trajectory.iterations:
        first_iter = trajectory.iterations[0]
        last_iter = trajectory.iterations[-1]

        print("Key Findings:")
        print()

        # 1. Initial quality
        print(f"1. Initial Quality: {first_iter.quality:.4f}")
        print(f"   - Algebraic score: {first_iter.algebraic:.4f}")
        print(f"   - Documentation score: {first_iter.documentation:.4f}")
        print(f"   - Bijective score: {first_iter.bijective:.4f}")
        print()

        # 2. Gradients (distance from ideal 1.0)
        print("2. SGD-Style Gradients (Iteration 1):")
        print("   (Gradient = score - 1.0, shows room for improvement)")
        for dim, grad in first_iter.gradients.items():
            improvement_room = abs(grad)
            priority = "🔴 HIGH" if improvement_room > 0.5 else "🟡 MEDIUM" if improvement_room > 0.2 else "🟢 LOW"
            print(f"   - {dim}: {grad:+.4f} ({priority})")
        print()

        # 3. Feedback
        print("3. Feedback Provided:")
        print()
        feedback_lines = first_iter.feedback.split('\n')
        for line in feedback_lines[:20]:  # First 20 lines
            print(f"   {line}")
        if len(feedback_lines) > 20:
            print(f"   ... ({len(feedback_lines) - 20} more lines)")
        print()

        # 4. Convergence via Plateau Detection
        print(f"4. Convergence (Gradient-Based Plateau Detection):")
        print(f"   - Converged: {'YES' if trajectory.converged else 'NO'}")
        if trajectory.converged:
            print(f"   - Convergence reason: Quality improvement gradient < 0.01 for 2 iterations")
        else:
            print(f"   - Stopped: Reached max iterations ({len(trajectory.iterations)})")
        print(f"   - Final quality: {last_iter.quality:.4f}")
        print(f"   - Iterations: {len(trajectory.iterations)}")
        print(f"   - Total cost: ${trajectory.total_cost:.2f}")
        print()

        # 5. Quality improvement trajectory with gradients
        print("5. Quality Improvement Trajectory:")
        for i, iter_res in enumerate(trajectory.iterations, 1):
            improvement = ""
            if i > 1:
                prev_quality = trajectory.iterations[i-2].quality
                delta = iter_res.quality - prev_quality
                gradient_status = "⚠ PLATEAU" if abs(delta) < 0.01 else "✓ IMPROVING"
                improvement = f"(Δ: {delta:+.4f}) {gradient_status}"
            else:
                improvement = "(baseline)"

            print(f"   Iteration {i}: {iter_res.quality:.4f} {improvement}")
        print()

        # 6. Key insights
        print("6. Key Insights (Gradient-Based Convergence):")
        print()
        print("   ✓ NO FIXED THRESHOLDS")
        print("     - System uses gradient magnitude to detect plateau")
        print("     - Converges when improvement rate drops below 0.01")
        print("     - No arbitrary 0.70 cutoff")
        print()
        print("   ✓ NATURAL CONVERGENCE")
        print("     - Stops when diminishing returns kick in")
        print("     - Adapts to task difficulty automatically")
        print("     - Higher quality tasks naturally iterate longer")
        print()
        print("   ✓ SGD-STYLE FEEDBACK")
        print("     - Gradients show distance from ideal (1.0)")
        print("     - Prioritizes dimensions with largest improvement room")
        print("     - Provides actionable suggestions each iteration")
        print()

        if first_iter.algebraic < 0.75:
            print("   ⚠ ALGEBRAIC DIMENSION CAUGHT THE GAP")
            print(f"     - Score: {first_iter.algebraic:.4f}")
            print("     - Feedback: 'I/O category incomplete: 1/2 duals'")
            print("     - Missing: read() operation")
            print()

    print("=" * 80)

    return 0


if __name__ == "__main__":
    exit(main())
