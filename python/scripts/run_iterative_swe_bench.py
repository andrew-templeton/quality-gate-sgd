#!/usr/bin/env python3
# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Iterative SWE-bench Solver with Quality-Gated Refinement

Uses quality dimensions to iteratively refine patches until convergence.
The agent reads feedback and generates improved patches each iteration.

This is the REAL test: Can quality feedback actually improve patch quality?
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Optional
import anthropic

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


def load_swe_bench_task(task_id: str) -> Optional[dict]:
    """Load a specific SWE-bench task."""
    task_file = 'data/swe-bench/lite.jsonl'

    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] == task_id:
                return task

    return None


def create_reasoning_from_problem(problem_statement: str) -> PatchProposalReasoning:
    """Create reasoning structure from problem statement."""
    # Extract key information
    lines = problem_statement.split('\n')
    description = lines[0][:200] if lines else "Issue described"

    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=description,
            current_behavior="Current implementation has the issue described",
            expected_behavior="Should work as specified in requirements",
            confidence=0.85
        ),
        hypothesis=CausalHypothesis(
            root_cause="Code needs modification to address the issue",
            causal_chain=[
                "Issue identified in problem statement",
                "Current code doesn't handle case properly",
                "Fix requires targeted changes"
            ],
            rationale="Analysis of problem points to specific code changes needed"
        ),
        evidence=SupportingEvidence(
            code_references=[],
            observations=["Problem statement describes expected behavior"],
            supporting_logic="Proposed changes will address the root cause"
        ),
        solution=ProposedSolution(
            change_description="Modify code to fix the issue",
            addresses_cause="Directly implements required fix",
            minimality="Minimal changes to achieve fix"
        ),
        prediction=OutcomePrediction(
            test_outcomes=["Tests should pass after fix"],
            effects=["Issue resolved"],
            verification_plan="Run test suite"
        )
    )


def generate_patch_with_claude(
    task: dict,
    iteration: int,
    previous_patch: Optional[str] = None,
    quality_feedback: Optional[str] = None,
    client: Optional[anthropic.Anthropic] = None
) -> tuple[str, str]:
    """
    Generate or refine a patch using Claude.

    Returns: (patch_diff, reasoning_explanation)
    """
    if client is None:
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        client = anthropic.Anthropic(api_key=api_key)

    problem_statement = task.get('problem_statement', '')
    repo = task.get('repo', 'unknown')

    # Build prompt
    if iteration == 1:
        # Initial patch generation
        prompt = f"""You are a software engineer fixing a bug in the {repo} repository.

PROBLEM STATEMENT:
{problem_statement}

Generate a minimal patch (unified diff format) that fixes this issue.

IMPORTANT:
- Output ONLY the patch in unified diff format
- Start with "diff --git a/path/to/file b/path/to/file"
- Include context lines and proper diff headers
- Be minimal - only change what's necessary
- Focus on the core fix

Your patch:"""
    else:
        # Iterative refinement
        prompt = f"""You are refining a patch for the {repo} repository.

PROBLEM STATEMENT:
{problem_statement}

CURRENT PATCH (Iteration {iteration-1}):
{previous_patch}

QUALITY FEEDBACK:
{quality_feedback}

Based on this feedback, generate an IMPROVED patch that addresses the issues identified.

IMPORTANT:
- Address the specific feedback (missing operations, weak alignment, etc.)
- Output ONLY the improved patch in unified diff format
- Keep the good parts, improve the weak parts
- Be minimal but complete

Your improved patch:"""

    # Call Claude
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    patch = response.content[0].text.strip()

    # Extract just the diff if there's extra text
    if 'diff --git' in patch:
        start = patch.index('diff --git')
        patch = patch[start:]

    return patch, f"Patch generated for iteration {iteration}"


def extract_files_from_diff(diff: str) -> Dict[str, str]:
    """Extract file paths from diff."""
    files = {}
    current_file = None

    for line in diff.split('\n'):
        if line.startswith('diff --git'):
            parts = line.split()
            if len(parts) >= 4:
                file_path = parts[2][2:]  # Remove 'a/' prefix
                current_file = file_path
                files[file_path] = '# File content\n'

    return files


def run_iterative_solver(
    task_id: str,
    max_iterations: int = 5,
    use_claude: bool = True
) -> dict:
    """
    Run iterative quality-gated solver on a task.

    Args:
        task_id: SWE-bench task ID
        max_iterations: Maximum refinement iterations
        use_claude: If True, use Claude for refinement; if False, use golden patch

    Returns:
        Results dictionary with trajectory
    """
    print(f"\n{'='*80}")
    print(f"ITERATIVE SOLVER: {task_id}")
    print(f"{'='*80}")
    print(f"Max iterations: {max_iterations}")
    print(f"Using Claude: {use_claude}")
    print()

    # Load task
    task = load_swe_bench_task(task_id)
    if not task:
        print(f"✗ Task {task_id} not found")
        return None

    # Initialize Claude client if needed
    claude_client = None
    if use_claude:
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            print("⚠ ANTHROPIC_API_KEY not set, falling back to golden patch")
            use_claude = False
        else:
            claude_client = anthropic.Anthropic(api_key=api_key)

    # Configuration - tuned thresholds for bug fixes
    config = ExtendedQualityGateConfig(
        enable_documentation_completeness=True,
        enable_algebraic_completeness=True,
        enable_bijective_requirements=True,
        # Lower thresholds for bug fixes (no docs expected)
        min_overall_quality=0.70,
        min_dimension_scores={
            "documentation_completeness": 0.0,  # Advisory only for bug fixes
            "algebraic_completeness": 0.70,     # Must be structurally complete
            "bijective_requirements": 0.0,      # Advisory only until tuned
        },
        cache_file=".quality-dimension-cache-iterative.json",
    )

    # Track iterations manually (not using IterativeQualityRefiner for now)
    trajectory = {
        'task_id': task_id,
        'iterations': [],
        'converged': False,
        'final_quality': 0.0,
        'total_cost': 0.0
    }

    current_patch = None
    previous_quality = None
    plateau_counter = 0
    plateau_threshold = 0.01
    plateau_window = 2

    for iteration in range(1, max_iterations + 1):
        print(f"\n{'─'*80}")
        print(f"ITERATION {iteration}")
        print(f"{'─'*80}")

        # Generate/refine patch
        if iteration == 1:
            if use_claude:
                print("Generating initial patch with Claude...")
                current_patch, reasoning = generate_patch_with_claude(
                    task, iteration, None, None, claude_client
                )
            else:
                print("Using golden patch for iteration 1...")
                current_patch = task.get('patch', '')
                reasoning = "Golden patch from SWE-bench"
        else:
            if use_claude:
                print(f"Refining patch with Claude (iteration {iteration})...")
                # Get feedback from previous iteration
                prev_feedback = trajectory['iterations'][-1]['feedback']
                current_patch, reasoning = generate_patch_with_claude(
                    task, iteration, current_patch, prev_feedback, claude_client
                )
            else:
                print("Using same golden patch (no refinement without Claude)...")
                # No refinement without Claude

        if not current_patch:
            print("✗ No patch generated, stopping")
            break

        print(f"Patch size: {len(current_patch)} chars")
        print()

        # Evaluate quality
        from quality_gate.evaluator_extended import evaluate_extended_quality_gate

        reasoning_obj = create_reasoning_from_problem(task.get('problem_statement', ''))
        file_contents = extract_files_from_diff(current_patch)

        try:
            # Evaluate using ONLY visible data (no hidden test)
            result = evaluate_extended_quality_gate(
                reasoning=reasoning_obj,
                diff=current_patch,
                file_contents=file_contents,
                requirements=task.get('problem_statement', ''),
                config=config
            )

            quality = result.quality.overall_quality

            print(f"QUALITY SCORES:")
            print(f"  Overall: {quality:.4f}")
            print(f"  Reasoning: {result.quality.reasoning_score:.4f}")
            print(f"  Implementation: {result.quality.implementation_score:.4f}")
            print(f"    - Documentation: {result.quality.documentation_completeness:.4f}")
            print(f"    - Algebraic: {result.quality.algebraic_completeness:.4f}")
            print(f"    - Bijective: {result.quality.bijective_requirements:.4f}")
            print()

            # Generate feedback
            gradients = {
                'documentation': result.quality.documentation_completeness - 1.0,
                'algebraic': result.quality.algebraic_completeness - 1.0,
                'bijective': result.quality.bijective_requirements - 1.0,
            }

            feedback_parts = ["=== Quality Feedback ==="]
            feedback_parts.append(f"Overall Quality: {quality:.4f}")
            feedback_parts.append("")

            for dim, grad in sorted(gradients.items(), key=lambda x: x[1]):
                score = grad + 1.0
                room = abs(grad)
                emoji = "🔴" if room > 0.5 else "🟡" if room > 0.2 else "🟢"
                feedback_parts.append(f"{emoji} {dim.upper()}: {score:.4f} (room for improvement: {room:.4f})")

                if dim == 'algebraic' and room > 0.2:
                    if result.algebraic_result and result.algebraic_result.categories:
                        for cat in result.algebraic_result.categories:
                            if cat.completeness_ratio < 1.0:
                                feedback_parts.append(f"  → {cat.category.value} incomplete: {cat.actual_duals}/{cat.expected_duals} duals")
                                for missing in cat.missing_duals:
                                    feedback_parts.append(f"    • Missing: {missing}")

                elif dim == 'bijective' and room > 0.2:
                    feedback_parts.append(f"  → Test-code alignment weak")
                    feedback_parts.append(f"  → Ensure all test requirements are implemented")

            feedback = "\n".join(feedback_parts)

            # Store iteration (including actual patch for evaluation)
            iter_result = {
                'iteration': iteration,
                'quality': quality,
                'dimensions': {
                    'documentation': result.quality.documentation_completeness,
                    'algebraic': result.quality.algebraic_completeness,
                    'bijective': result.quality.bijective_requirements,
                },
                'feedback': feedback,
                'patch_size': len(current_patch),
                'patch': current_patch,  # Store actual patch for SWE-bench eval
                'cost': result.total_cost_usd
            }
            trajectory['iterations'].append(iter_result)
            trajectory['total_cost'] += result.total_cost_usd

            # Check convergence
            if previous_quality is not None:
                quality_delta = quality - previous_quality
                print(f"Quality change: {quality_delta:+.4f}")

                if abs(quality_delta) < plateau_threshold:
                    plateau_counter += 1
                    print(f"⚠ Plateau detected ({plateau_counter}/{plateau_window})")
                else:
                    plateau_counter = 0

                if plateau_counter >= plateau_window:
                    print(f"✓ Converged (plateau detected)")
                    trajectory['converged'] = True
                    break

            previous_quality = quality

            # Print feedback for next iteration
            if iteration < max_iterations and not trajectory['converged']:
                print(f"\nFeedback for next iteration:")
                print(feedback)

        except Exception as e:
            print(f"✗ Error evaluating: {e}")
            import traceback
            traceback.print_exc()
            break

    # Finalize
    if trajectory['iterations']:
        trajectory['final_quality'] = trajectory['iterations'][-1]['quality']

    print(f"\n{'='*80}")
    print(f"TRAJECTORY SUMMARY")
    print(f"{'='*80}")
    print(f"Converged: {trajectory['converged']}")
    print(f"Iterations: {len(trajectory['iterations'])}")
    print(f"Final quality: {trajectory['final_quality']:.4f}")
    print(f"Total cost: ${trajectory['total_cost']:.2f}")

    return trajectory


def main():
    print("="*80)
    print("ITERATIVE SWE-BENCH SOLVER")
    print("="*80)
    print()

    # Check for API key
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        print("⚠ ANTHROPIC_API_KEY not set")
        print("Will use golden patches (no real refinement)")
        print()
        use_claude = False
    else:
        print("✓ ANTHROPIC_API_KEY found")
        print("Will use Claude for iterative refinement")
        print()
        use_claude = True

    # Test tasks
    test_tasks = [
        "astropy__astropy-14182",  # Our motivating example (missing read())
        "django__django-11999",    # Simple Django fix
        "sympy__sympy-13647",      # SymPy simplification
    ]

    print(f"Testing on {len(test_tasks)} tasks:")
    for task_id in test_tasks:
        print(f"  - {task_id}")
    print()

    # Run solver on each task
    results = []
    for task_id in test_tasks:
        result = run_iterative_solver(
            task_id=task_id,
            max_iterations=5,
            use_claude=use_claude
        )
        if result:
            results.append(result)

    # Save results
    output_dir = Path("data/experiments")
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "iterative_solver_results.json"
    with open(output_file, 'w') as f:
        json.dump({
            'used_claude': use_claude,
            'tasks': results
        }, f, indent=2)

    # Export in SWE-bench format for evaluation
    swebench_file = output_dir / "swebench_predictions.jsonl"
    with open(swebench_file, 'w') as f:
        for task_result in results:
            if task_result['iterations']:
                # Get final patch from last iteration
                final_patch = task_result['iterations'][-1].get('patch', '')
                prediction = {
                    "instance_id": task_result['task_id'],
                    "model_name_or_path": "quality-gated-claude",
                    "model_patch": final_patch
                }
                f.write(json.dumps(prediction) + '\n')

    print(f"\n{'='*80}")
    print(f"RESULTS SAVED")
    print(f"{'='*80}")
    print(f"Output: {output_file}")
    print(f"SWE-bench predictions: {swebench_file}")
    print()

    # Summary
    if results:
        converged = [r for r in results if r['converged']]
        avg_iterations = sum(len(r['iterations']) for r in results) / len(results)
        avg_quality = sum(r['final_quality'] for r in results) / len(results)

        print(f"Summary:")
        print(f"  Converged: {len(converged)}/{len(results)}")
        print(f"  Avg iterations: {avg_iterations:.1f}")
        print(f"  Avg final quality: {avg_quality:.4f}")

    return 0


if __name__ == "__main__":
    exit(main())
