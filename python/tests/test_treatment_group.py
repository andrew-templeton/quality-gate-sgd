#!/usr/bin/env python3
"""
Test Treatment Group: Evaluate multiple SWE-bench tasks with 8-dimension quality gate

This tests challenging tasks to see if the new dimensions would catch issues
that baseline approaches might miss.
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

from quality_gate.evaluator_extended import (
    evaluate_extended_quality_gate,
    ExtendedQualityGateConfig,
)
from quality_gate.evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


# Test cases: tasks known to be challenging
TEST_TASKS = [
    "astropy__astropy-14182",  # Our verified case
    "django__django-11001",    # Django ORM complexity
    "django__django-11019",    # Django forms
    "sympy__sympy-11870",      # Symbolic math
    "matplotlib__matplotlib-23314",  # Plotting library
]


def load_task(task_file: str, task_id: str) -> Dict[str, Any]:
    """Load a specific task from SWE-bench dataset."""
    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] == task_id:
                return task
    return None


def create_mock_reasoning(task: Dict[str, Any]) -> PatchProposalReasoning:
    """Create mock reasoning from task (simulates what agent would provide)."""
    problem = task.get('problem_statement', '')

    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=problem[:200] if len(problem) > 200 else problem,
            current_behavior="Current code doesn't implement required functionality",
            expected_behavior="Should implement as specified in requirements",
            confidence=0.8
        ),
        hypothesis=CausalHypothesis(
            root_cause="Missing or incomplete implementation",
            causal_chain=["Missing code", "Tests fail", "Feature not working"],
            rationale="Need to add implementation for the requested feature"
        ),
        evidence=SupportingEvidence(
            code_references=[
                {"file": "relevant.py", "lines": "1-100", "observation": "Missing implementation"}
            ],
            observations=["Code lacks required functionality", "Tests define expected behavior"],
            supporting_logic="Tests show what's needed, code doesn't provide it"
        ),
        solution=ProposedSolution(
            change_description="Add missing implementation",
            addresses_cause="Directly implements the required feature",
            minimality="Only adds what's needed"
        ),
        prediction=OutcomePrediction(
            test_outcomes=["Tests should pass after implementation"],
            effects=["Feature now works as expected"],
            verification_plan="Run test suite"
        )
    )


def evaluate_task(
    task_id: str,
    task: Dict[str, Any],
    config: ExtendedQualityGateConfig
) -> Dict[str, Any]:
    """Evaluate a single task with quality gate."""

    # Create reasoning
    reasoning = create_mock_reasoning(task)

    # Get golden patch (what actually fixes it)
    diff = task.get('patch', '')

    # Mock file contents (in real integration, extract from repo)
    file_contents = {}

    # Evaluate using ONLY visible data (no hidden test)
    result = evaluate_extended_quality_gate(
        reasoning=reasoning,
        diff=diff,
        file_contents=file_contents,
        requirements=task.get('problem_statement', ''),
        # NO test_code - evaluates without hidden test data
        config=config
    )

    return {
        'task_id': task_id,
        'repo': task['repo'],
        'overall_quality': result.quality.overall_quality,
        'passes': result.passes,
        'reasoning_score': result.quality.reasoning_score,
        'implementation_score': result.quality.implementation_score,
        'documentation': result.quality.documentation_completeness,
        'algebraic': result.quality.algebraic_completeness,
        'bijective': result.quality.bijective_requirements,
        'failures': result.failures,
        'suggestions': result.suggestions[:3],  # Top 3
        'cost': result.total_cost_usd,
    }


def main():
    task_file = 'data/swe-bench/lite.jsonl'

    print("=" * 80)
    print("TREATMENT GROUP EVALUATION: 8-Dimension Quality Gate")
    print("=" * 80)
    print()
    print("Testing challenging SWE-bench tasks with new dimensions enabled")
    print()

    # Configuration: ALL dimensions enabled (treatment group)
    config = ExtendedQualityGateConfig(
        enable_documentation_completeness=True,
        enable_algebraic_completeness=True,
        enable_bijective_requirements=True,
        cache_file=".quality-dimension-cache-treatment.json",
    )

    print("Configuration:")
    print(f"  Documentation Completeness: {'✓' if config.enable_documentation_completeness else '✗'}")
    print(f"  Algebraic Completeness: {'✓' if config.enable_algebraic_completeness else '✗'}")
    print(f"  Bijective Requirements: {'✓' if config.enable_bijective_requirements else '✗'}")
    print()

    results = []
    total_cost = 0.0

    for task_id in TEST_TASKS:
        print("-" * 80)
        print(f"Task: {task_id}")
        print("-" * 80)

        # Load task
        task = load_task(task_file, task_id)
        if not task:
            print(f"⚠️  Task not found in dataset, skipping...")
            print()
            continue

        print(f"Repo: {task['repo']}")
        problem = task.get('problem_statement', '')
        print(f"Problem: {problem[:100]}...")
        print()

        # Evaluate
        try:
            result = evaluate_task(task_id, task, config)
            results.append(result)
            total_cost += result['cost']

            # Display results
            print(f"Overall Quality: {result['overall_quality']:.2f}")
            print(f"Gate Decision: {'✅ PASS' if result['passes'] else '❌ BLOCK'}")
            print()

            print("Scores:")
            print(f"  Reasoning (Group A): {result['reasoning_score']:.2f}")
            print(f"  Implementation (Group B): {result['implementation_score']:.2f}")
            print(f"    - Documentation: {result['documentation']:.2f}")
            print(f"    - Algebraic: {result['algebraic']:.2f}")
            print(f"    - Bijective: {result['bijective']:.2f}")
            print()

            if result['failures']:
                print("Failures:")
                for failure in result['failures'][:3]:
                    print(f"  - {failure}")
                print()

            if result['suggestions']:
                print("Top Suggestions:")
                for i, suggestion in enumerate(result['suggestions'], 1):
                    print(f"  {i}. {suggestion[:80]}{'...' if len(suggestion) > 80 else ''}")
                print()

            print(f"Cost: ${result['cost']:.3f}")

        except Exception as e:
            print(f"❌ Error evaluating task: {e}")
            import traceback
            traceback.print_exc()

        print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print()

    if results:
        passes = sum(1 for r in results if r['passes'])
        blocks = len(results) - passes

        print(f"Tasks evaluated: {len(results)}")
        print(f"  Passed: {passes} ({passes/len(results)*100:.1f}%)")
        print(f"  Blocked: {blocks} ({blocks/len(results)*100:.1f}%)")
        print()

        print("Average Scores:")
        avg_overall = sum(r['overall_quality'] for r in results) / len(results)
        avg_reasoning = sum(r['reasoning_score'] for r in results) / len(results)
        avg_impl = sum(r['implementation_score'] for r in results) / len(results)
        avg_doc = sum(r['documentation'] for r in results) / len(results)
        avg_alg = sum(r['algebraic'] for r in results) / len(results)
        avg_bij = sum(r['bijective'] for r in results) / len(results)

        print(f"  Overall Quality: {avg_overall:.2f}")
        print(f"  Reasoning: {avg_reasoning:.2f}")
        print(f"  Implementation: {avg_impl:.2f}")
        print(f"    - Documentation: {avg_doc:.2f}")
        print(f"    - Algebraic: {avg_alg:.2f}")
        print(f"    - Bijective: {avg_bij:.2f}")
        print()

        print(f"Total Cost: ${total_cost:.2f}")
        print(f"Average Cost per Task: ${total_cost/len(results):.3f}")
        print()

        # Analysis
        print("Key Insights:")

        # Which dimension blocked most?
        doc_blocks = sum(1 for r in results if not r['passes'] and r['documentation'] < 0.70)
        alg_blocks = sum(1 for r in results if not r['passes'] and r['algebraic'] < 0.70)
        bij_blocks = sum(1 for r in results if not r['passes'] and r['bijective'] < 0.70)

        if doc_blocks > 0:
            print(f"  - Documentation dimension blocked {doc_blocks} tasks")
        if alg_blocks > 0:
            print(f"  - Algebraic dimension blocked {alg_blocks} tasks")
        if bij_blocks > 0:
            print(f"  - Bijective dimension blocked {bij_blocks} tasks")

        if blocks == 0:
            print("  - All tasks passed the quality gate!")
            print("  - This suggests either:")
            print("    1. The golden patches are high quality, or")
            print("    2. Thresholds may need calibration")

        print()
    else:
        print("No results to summarize.")

    print("=" * 80)

    # Save results
    output_file = "treatment_group_results.json"
    with open(output_file, 'w') as f:
        json.dump({
            'config': {
                'documentation': config.enable_documentation_completeness,
                'algebraic': config.enable_algebraic_completeness,
                'bijective': config.enable_bijective_requirements,
            },
            'results': results,
            'summary': {
                'total_tasks': len(results),
                'passes': passes if results else 0,
                'blocks': blocks if results else 0,
                'total_cost': total_cost,
            }
        }, f, indent=2)

    print(f"Results saved to: {output_file}")
    print()

    return 0


if __name__ == "__main__":
    exit(main())
