#!/usr/bin/env python3
"""
Hard Task Quality Evaluation

Evaluates quality dimensions on SWE-bench tasks known to be difficult.
These are tasks where models typically fail or require complex patches.

Focus: Measure how well quality dimensions identify gaps in incomplete solutions.
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


def load_all_tasks() -> List[dict]:
    """Load all SWE-bench lite tasks."""
    task_file = 'data/swe-bench/lite.jsonl'
    tasks = []

    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            tasks.append(task)

    return tasks


def select_hard_tasks(all_tasks: List[dict], limit: int = 10) -> List[dict]:
    """
    Select hard tasks based on:
    1. Patch complexity (number of files modified, lines changed)
    2. Problem statement complexity (length, mentions of multiple issues)
    3. Tasks from repos known to have complex issues
    """
    scored_tasks = []

    for task in all_tasks:
        patch = task.get('patch', '')
        problem = task.get('problem_statement', '')

        # Calculate complexity score
        num_files = patch.count('diff --git') if patch else 0
        num_lines_added = patch.count('\n+') if patch else 0
        num_lines_removed = patch.count('\n-') if patch else 0
        problem_length = len(problem)

        complexity_score = (
            num_files * 10 +
            num_lines_added * 0.5 +
            num_lines_removed * 0.5 +
            problem_length * 0.01
        )

        scored_tasks.append({
            'task': task,
            'complexity': complexity_score,
            'num_files': num_files,
            'lines_added': num_lines_added,
            'lines_removed': num_lines_removed,
        })

    # Sort by complexity (highest first)
    scored_tasks.sort(key=lambda x: x['complexity'], reverse=True)

    # Return top N hardest tasks
    return [st['task'] for st in scored_tasks[:limit]]


def create_mock_reasoning(task) -> PatchProposalReasoning:
    """Create mock reasoning for a task."""
    problem = task['problem_statement'][:300] if 'problem_statement' in task else "Fix issue"

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


def extract_files_from_diff(diff: str) -> Dict[str, str]:
    """Extract file paths from diff."""
    files = {}
    current_file = None

    for line in diff.split('\n'):
        if line.startswith('diff --git'):
            # Extract file path: diff --git a/path/to/file b/path/to/file
            parts = line.split()
            if len(parts) >= 4:
                file_path = parts[2][2:]  # Remove 'a/' prefix
                current_file = file_path
                files[file_path] = '# File content placeholder\n'

    return files


def evaluate_task(
    task: dict,
    config: ExtendedQualityGateConfig
) -> dict:
    """Evaluate a single task's quality dimensions."""
    task_id = task['instance_id']

    print(f"\n{'='*80}")
    print(f"EVALUATING: {task_id}")
    print(f"{'='*80}")

    # Get patch info
    patch = task.get('patch', '')
    if not patch:
        print("⚠ No patch available, skipping")
        return None

    # Analyze patch complexity
    num_files = patch.count('diff --git')
    num_lines = patch.count('\n')
    lines_added = patch.count('\n+')
    lines_removed = patch.count('\n-')

    print(f"Patch complexity:")
    print(f"  Files modified: {num_files}")
    print(f"  Lines added: {lines_added}")
    print(f"  Lines removed: {lines_removed}")
    print(f"  Total lines: {num_lines}")
    print()

    # Create reasoning
    reasoning = create_mock_reasoning(task)

    # Extract files
    file_contents = extract_files_from_diff(patch)

    # Single evaluation (no iteration)
    from quality_gate.evaluator_extended import evaluate_extended_quality_gate

    try:
        result = evaluate_extended_quality_gate(
            reasoning=reasoning,
            diff=patch,
            file_contents=file_contents,
            requirements=task.get('problem_statement', ''),
            config=config
        )

        print(f"QUALITY SCORES:")
        print(f"  Overall: {result.quality.overall_quality:.4f}")
        print(f"  Reasoning: {result.quality.reasoning_score:.4f}")
        print(f"  Implementation: {result.quality.implementation_score:.4f}")
        print(f"    - Documentation: {result.quality.documentation_completeness:.4f}")
        print(f"    - Algebraic: {result.quality.algebraic_completeness:.4f}")
        print(f"    - Bijective: {result.quality.bijective_requirements:.4f}")
        print()

        # Check for issues caught by dimensions
        issues = []
        if result.quality.algebraic_completeness < 0.80:
            issues.append(f"⚠ Algebraic incomplete ({result.quality.algebraic_completeness:.2f}) - possible missing dual operations")
        if result.quality.bijective_requirements < 0.70:
            issues.append(f"⚠ Bijective weak ({result.quality.bijective_requirements:.2f}) - test-code alignment issues")
        if result.quality.documentation_completeness < 0.20:
            issues.append(f"ℹ Documentation missing ({result.quality.documentation_completeness:.2f}) - no docstrings")

        if issues:
            print("ISSUES IDENTIFIED:")
            for issue in issues:
                print(f"  {issue}")
        else:
            print("✓ No major issues detected")

        print()

        return {
            'task_id': task_id,
            'num_files': num_files,
            'lines_added': lines_added,
            'lines_removed': lines_removed,
            'overall_quality': result.quality.overall_quality,
            'reasoning': result.quality.reasoning_score,
            'implementation': result.quality.implementation_score,
            'documentation': result.quality.documentation_completeness,
            'algebraic': result.quality.algebraic_completeness,
            'bijective': result.quality.bijective_requirements,
            'issues': issues,
            'cost': result.total_cost_usd
        }

    except Exception as e:
        print(f"✗ Error evaluating: {e}")
        import traceback
        traceback.print_exc()
        return None


def analyze_results(results: List[dict]):
    """Analyze results across all tasks."""
    print("\n" + "="*80)
    print("AGGREGATE ANALYSIS: HARD TASKS")
    print("="*80)

    valid_results = [r for r in results if r is not None]

    if not valid_results:
        print("No valid results")
        return

    # Quality statistics
    overall_qualities = [r['overall_quality'] for r in valid_results]
    algebraic_scores = [r['algebraic'] for r in valid_results]
    bijective_scores = [r['bijective'] for r in valid_results]
    documentation_scores = [r['documentation'] for r in valid_results]

    print(f"\n1. QUALITY SCORES")
    print(f"   Overall Quality:")
    print(f"     Mean: {statistics.mean(overall_qualities):.4f}")
    print(f"     Median: {statistics.median(overall_qualities):.4f}")
    print(f"     Range: {min(overall_qualities):.4f} - {max(overall_qualities):.4f}")
    print()
    print(f"   Dimension Scores:")
    print(f"     Documentation - Mean: {statistics.mean(documentation_scores):.4f}, Range: {min(documentation_scores):.4f}-{max(documentation_scores):.4f}")
    print(f"     Algebraic     - Mean: {statistics.mean(algebraic_scores):.4f}, Range: {min(algebraic_scores):.4f}-{max(algebraic_scores):.4f}")
    print(f"     Bijective     - Mean: {statistics.mean(bijective_scores):.4f}, Range: {min(bijective_scores):.4f}-{max(bijective_scores):.4f}")

    # Issue detection
    print(f"\n2. ISSUE DETECTION")
    tasks_with_issues = [r for r in valid_results if r['issues']]
    print(f"   Tasks with issues: {len(tasks_with_issues)}/{len(valid_results)} ({len(tasks_with_issues)/len(valid_results)*100:.1f}%)")

    # Breakdown by dimension
    algebraic_issues = [r for r in valid_results if r['algebraic'] < 0.80]
    bijective_issues = [r for r in valid_results if r['bijective'] < 0.70]

    print(f"   Algebraic issues (< 0.80): {len(algebraic_issues)} tasks")
    print(f"   Bijective issues (< 0.70): {len(bijective_issues)} tasks")

    # Complexity correlation
    print(f"\n3. COMPLEXITY CORRELATION")
    print(f"   {'Task':<40} {'Files':<6} {'Lines+':<8} {'Quality':<8} {'Alg':<6} {'Bij':<6}")
    print(f"   {'-'*75}")
    for r in sorted(valid_results, key=lambda x: x['overall_quality']):
        task_short = r['task_id'][-35:]
        print(f"   {task_short:<40} {r['num_files']:<6} {r['lines_added']:<8} {r['overall_quality']:<8.4f} {r['algebraic']:<6.2f} {r['bijective']:<6.2f}")

    # Export results
    output_dir = Path("data/experiments")
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "hard_tasks_results.json"
    export_data = {
        'summary': {
            'total_tasks': len(valid_results),
            'mean_quality': statistics.mean(overall_qualities),
            'mean_algebraic': statistics.mean(algebraic_scores),
            'mean_bijective': statistics.mean(bijective_scores),
            'tasks_with_issues': len(tasks_with_issues),
            'algebraic_issues': len(algebraic_issues),
            'bijective_issues': len(bijective_issues),
        },
        'tasks': valid_results
    }

    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)

    print(f"\n4. EXPORT")
    print(f"   Results saved to: {output_file}")


def main():
    print("="*80)
    print("HARD TASK QUALITY EVALUATION")
    print("="*80)
    print()
    print("Evaluating quality dimensions on complex SWE-bench tasks")
    print()

    # Load all tasks
    print("Loading SWE-bench lite tasks...")
    all_tasks = load_all_tasks()
    print(f"Loaded {len(all_tasks)} tasks")
    print()

    # Select hardest tasks
    num_tasks = 15
    print(f"Selecting {num_tasks} most complex tasks...")
    hard_tasks = select_hard_tasks(all_tasks, limit=num_tasks)
    print(f"Selected {len(hard_tasks)} hard tasks")
    print()

    # Configuration
    config = ExtendedQualityGateConfig(
        enable_documentation_completeness=True,
        enable_algebraic_completeness=True,
        enable_bijective_requirements=True,
        cache_file=".quality-dimension-cache-hard-tasks.json",
    )

    # Evaluate each task
    results = []
    for i, task in enumerate(hard_tasks, 1):
        print(f"\n[{i}/{len(hard_tasks)}]")
        result = evaluate_task(task, config)
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
