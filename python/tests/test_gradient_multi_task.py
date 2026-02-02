#!/usr/bin/env python3
"""
Multi-Task Gradient-Based Convergence Test

Tests gradient-based plateau detection on 10 diverse SWE-bench tasks
to validate convergence patterns, cost-quality trade-offs, and
dimension performance across varying task difficulties.
"""

import json
from pathlib import Path
from typing import List, Dict
import statistics

from quality_gate.iterative_refiner import IterativeQualityRefiner
from quality_gate.evaluator_extended import ExtendedQualityGateConfig
from quality_gate.evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


def load_swe_bench_tasks(task_ids: List[str]) -> Dict[str, dict]:
    """Load specific SWE-bench tasks by ID."""
    task_file = 'data/swe-bench/lite.jsonl'
    tasks = {}

    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] in task_ids:
                tasks[task['instance_id']] = task

    return tasks


def create_mock_reasoning(task) -> PatchProposalReasoning:
    """Create mock reasoning for a task."""
    problem = task['problem_statement'][:300]

    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=problem,
            current_behavior="Current implementation has issues",
            expected_behavior="Should work correctly per requirements",
            confidence=0.85
        ),
        hypothesis=CausalHypothesis(
            root_cause="Code needs modification to fix issue",
            causal_chain=[
                "Problem identified in requirements",
                "Code doesn't handle case properly",
                "Need to add/modify functionality"
            ],
            rationale="Addressing root cause through targeted changes"
        ),
        evidence=SupportingEvidence(
            code_references=[{"file": "main.py", "lines": "1-50", "observation": "Issue here"}],
            observations=["Test expects different behavior", "Current implementation incomplete"],
            supporting_logic="Changes will fix the issue"
        ),
        solution=ProposedSolution(
            change_description="Modify code to fix issue",
            addresses_cause="Directly implements fix",
            minimality="Minimal changes required"
        ),
        prediction=OutcomePrediction(
            test_outcomes=["Tests should pass"],
            effects=["Issue resolved"],
            verification_plan="Run test suite"
        )
    )


def select_diverse_tasks() -> List[str]:
    """
    Select 10 diverse tasks covering different repos, difficulties, and issue types.

    Based on public SWE-bench results:
    - Easy: Claude Opus 4.5 solved (baseline ~50%+)
    - Medium: Mixed results (baseline ~30-50%)
    - Hard: Most models failed (baseline <30%)
    """
    return [
        # Easy tasks (likely to converge quickly with high quality)
        "astropy__astropy-14182",  # RST header rows (our test case)
        "django__django-11999",     # Simple fix in Django
        "sympy__sympy-13647",      # SymPy simplification

        # Medium tasks (steady improvement expected)
        "matplotlib__matplotlib-23913",  # Matplotlib rendering
        "scikit-learn__scikit-learn-13241",  # Sklearn estimator
        "requests__requests-2148",   # Requests library

        # Hard tasks (slow improvement or may not converge)
        "pylint-dev__pylint-6506",   # Complex pylint issue
        "pytest-dev__pytest-5692",   # Pytest fixture issue
        "sphinx-doc__sphinx-8282",   # Sphinx documentation
        "sympy__sympy-18057",        # Complex SymPy symbolic
    ]


def run_task_evaluation(
    task_id: str,
    task: dict,
    refiner: IterativeQualityRefiner
) -> dict:
    """Run gradient-based refinement on a single task."""
    print(f"\n{'='*80}")
    print(f"TASK: {task_id}")
    print(f"{'='*80}")
    print(f"Repo: {task.get('repo', 'unknown')}")
    print(f"Problem: {task.get('problem_statement', '')[:100]}...")
    print()

    # Create reasoning
    reasoning = create_mock_reasoning(task)

    # Get patch
    diff = task.get('patch', '')
    if not diff:
        print("⚠ No patch available, skipping")
        return None

    # Extract file contents from diff (simplified)
    file_contents = {'main.py': '# Mock file content\n'}

    # Run refinement
    try:
        trajectory = refiner.evaluate_and_refine(
            task_id=task_id,
            reasoning=reasoning,
            diff=diff,
            file_contents=file_contents,
            requirements=task.get('problem_statement', '')
        )

        # Summary
        print(f"\n{'─'*80}")
        print(f"SUMMARY: {task_id}")
        print(f"{'─'*80}")
        print(f"  Converged: {'YES' if trajectory.converged else 'NO'}")
        print(f"  Iterations: {len(trajectory.iterations)}")
        print(f"  Final Quality: {trajectory.final_quality:.4f}")
        print(f"  Cost: ${trajectory.total_cost:.2f}")

        if trajectory.iterations:
            first = trajectory.iterations[0]
            last = trajectory.iterations[-1]
            improvement = last.quality - first.quality

            print(f"  Quality Δ: {improvement:+.4f}")
            print(f"  Dimensions (final):")
            print(f"    - Documentation: {last.documentation:.4f}")
            print(f"    - Algebraic: {last.algebraic:.4f}")
            print(f"    - Bijective: {last.bijective:.4f}")

        return {
            'task_id': task_id,
            'converged': trajectory.converged,
            'iterations': len(trajectory.iterations),
            'final_quality': trajectory.final_quality,
            'initial_quality': trajectory.iterations[0].quality if trajectory.iterations else 0,
            'quality_improvement': improvement if trajectory.iterations else 0,
            'cost': trajectory.total_cost,
            'dimensions': {
                'documentation': last.documentation,
                'algebraic': last.algebraic,
                'bijective': last.bijective,
            } if trajectory.iterations else {},
            'trajectory': trajectory
        }

    except Exception as e:
        print(f"✗ Error evaluating task: {e}")
        import traceback
        traceback.print_exc()
        return None


def analyze_results(results: List[dict]):
    """Analyze and summarize results across all tasks."""
    print("\n" + "="*80)
    print("AGGREGATE ANALYSIS")
    print("="*80)

    valid_results = [r for r in results if r is not None]

    if not valid_results:
        print("No valid results to analyze")
        return

    # Convergence rate
    converged = [r for r in valid_results if r['converged']]
    convergence_rate = len(converged) / len(valid_results) * 100

    print(f"\n1. CONVERGENCE RATE")
    print(f"   {len(converged)}/{len(valid_results)} tasks converged ({convergence_rate:.1f}%)")

    # Iteration statistics
    iterations = [r['iterations'] for r in valid_results]
    print(f"\n2. ITERATIONS")
    print(f"   Mean: {statistics.mean(iterations):.2f}")
    print(f"   Median: {statistics.median(iterations):.1f}")
    print(f"   Range: {min(iterations)}-{max(iterations)}")

    # Quality statistics
    final_qualities = [r['final_quality'] for r in valid_results]
    quality_improvements = [r['quality_improvement'] for r in valid_results]

    print(f"\n3. QUALITY")
    print(f"   Final Quality:")
    print(f"     Mean: {statistics.mean(final_qualities):.4f}")
    print(f"     Median: {statistics.median(final_qualities):.4f}")
    print(f"     Range: {min(final_qualities):.4f}-{max(final_qualities):.4f}")
    print(f"   Improvement:")
    print(f"     Mean: {statistics.mean(quality_improvements):+.4f}")
    print(f"     Median: {statistics.median(quality_improvements):+.4f}")

    # Cost statistics
    costs = [r['cost'] for r in valid_results]
    print(f"\n4. COST")
    print(f"   Mean: ${statistics.mean(costs):.2f}")
    print(f"   Median: ${statistics.median(costs):.2f}")
    print(f"   Total: ${sum(costs):.2f}")
    print(f"   Range: ${min(costs):.2f}-${max(costs):.2f}")

    # Dimension analysis
    print(f"\n5. DIMENSION SCORES (Final)")
    for dim in ['documentation', 'algebraic', 'bijective']:
        scores = [r['dimensions'][dim] for r in valid_results if r['dimensions']]
        if scores:
            print(f"   {dim.capitalize()}:")
            print(f"     Mean: {statistics.mean(scores):.4f}")
            print(f"     Median: {statistics.median(scores):.4f}")
            print(f"     Range: {min(scores):.4f}-{max(scores):.4f}")

    # Task breakdown
    print(f"\n6. TASK BREAKDOWN")
    print(f"   {'Task':<40} {'Conv?':<6} {'Iters':<6} {'Quality':<8} {'Cost':<8}")
    print(f"   {'-'*70}")
    for r in valid_results:
        conv = "YES" if r['converged'] else "NO"
        task_short = r['task_id'][-30:]  # Last 30 chars
        print(f"   {task_short:<40} {conv:<6} {r['iterations']:<6} {r['final_quality']:<8.4f} ${r['cost']:<7.2f}")

    # Export detailed results
    output_dir = Path("data/experiments")
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "gradient_multi_task_results.json"
    export_data = {
        'summary': {
            'total_tasks': len(valid_results),
            'converged': len(converged),
            'convergence_rate': convergence_rate,
            'mean_iterations': statistics.mean(iterations),
            'mean_quality': statistics.mean(final_qualities),
            'mean_cost': statistics.mean(costs),
            'total_cost': sum(costs),
        },
        'tasks': [
            {
                'task_id': r['task_id'],
                'converged': r['converged'],
                'iterations': r['iterations'],
                'final_quality': r['final_quality'],
                'initial_quality': r['initial_quality'],
                'quality_improvement': r['quality_improvement'],
                'cost': r['cost'],
                'dimensions': r['dimensions']
            }
            for r in valid_results
        ]
    }

    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)

    print(f"\n7. EXPORT")
    print(f"   Results saved to: {output_file}")


def main():
    print("="*80)
    print("MULTI-TASK GRADIENT-BASED CONVERGENCE TEST")
    print("="*80)
    print()
    print("Testing gradient-based plateau detection on 10 diverse SWE-bench tasks")
    print()

    # Configuration
    config = ExtendedQualityGateConfig(
        enable_documentation_completeness=True,
        enable_algebraic_completeness=True,
        enable_bijective_requirements=True,
        cache_file=".quality-dimension-cache-multi-task.json",
    )

    refiner = IterativeQualityRefiner(
        config=config,
        max_iterations=5,
        plateau_threshold=0.01,
        plateau_window=2
    )

    print("Configuration:")
    print("  Max iterations: 5")
    print("  Plateau threshold: 0.01")
    print("  Plateau window: 2")
    print("  All dimensions: ENABLED")
    print()

    # Select tasks
    task_ids = select_diverse_tasks()
    print(f"Selected {len(task_ids)} tasks:")
    for tid in task_ids:
        print(f"  - {tid}")
    print()

    # Load tasks
    print("Loading tasks...")
    tasks = load_swe_bench_tasks(task_ids)
    print(f"Loaded {len(tasks)} tasks")
    print()

    # Run evaluations
    results = []
    for task_id in task_ids:
        task = tasks.get(task_id)
        if not task:
            print(f"⚠ Task {task_id} not found, skipping")
            continue

        result = run_task_evaluation(task_id, task, refiner)
        if result:
            results.append(result)

    # Analyze results
    analyze_results(results)

    print("\n" + "="*80)
    print("COMPLETE")
    print("="*80)

    return 0


if __name__ == "__main__":
    exit(main())
