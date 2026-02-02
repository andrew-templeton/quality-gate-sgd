#!/usr/bin/env python3
"""
Test that quality dimensions work WITHOUT hidden test data.

This validates the emergent completeness property: dimensions should discover
missing requirements through structural analysis (category theory, algebraic
duals) WITHOUT seeing the hidden FAIL_TO_PASS tests.

Test case: astropy-14182
- Problem: Add support for header_rows parameter in RST output
- Golden patch: Adds write() method with header_rows
- Hidden test: Tests read() method with header_rows (which is missing!)
- Expected: Algebraic/bijective dimensions should catch missing read()
  through category theory completeness, WITHOUT seeing the hidden test
"""

import json
from pathlib import Path
from quality_gate.evaluator_extended import evaluate_extended_quality_gate
from quality_gate.evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


def load_task(instance_id: str) -> dict:
    """Load a task from SWE-bench lite."""
    lite_path = Path('data/swe-bench/lite.jsonl')

    with open(lite_path) as f:
        for line in f:
            task = json.loads(line)
            if task['instance_id'] == instance_id:
                return task

    raise ValueError(f"Task {instance_id} not found")


def create_reasoning_from_problem(problem_statement: str) -> PatchProposalReasoning:
    """Create minimal reasoning object for testing."""
    lines = problem_statement.split('\n')
    description = lines[0][:200] if lines else "Issue described"

    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=description,
            current_behavior="RST output doesn't support header_rows parameter",
            expected_behavior="Should support header_rows in RST output like other formats",
            confidence=0.85
        ),
        hypothesis=CausalHypothesis(
            root_cause="RST writer missing header_rows parameter support",
            causal_chain=[
                "QTable supports header_rows for other formats",
                "RST format doesn't implement header_rows",
                "Need to add parameter to RST writer"
            ],
            rationale="Adding header_rows support requires both read and write operations"
        ),
        evidence=SupportingEvidence(
            code_references=["astropy/io/ascii/rst.py"],
            observations=["Other formats support header_rows", "RST format is missing it"],
            supporting_logic="Symmetry suggests both read/write need the parameter"
        ),
        solution=ProposedSolution(
            change_description="Add header_rows parameter to RST read/write methods",
            addresses_cause="Directly implements missing functionality",
            minimality="Minimal changes to add header_rows support"
        ),
        prediction=OutcomePrediction(
            test_outcomes=["Tests with header_rows should pass"],
            effects=["RST format supports header_rows parameter"],
            verification_plan="Test read/write with header_rows"
        )
    )


def extract_files_from_diff(diff: str) -> dict:
    """Extract file contents from diff (simplified for testing)."""
    # For this test, we just need to signal that files exist
    return {"astropy/io/ascii/rst.py": "# File content from diff"}


def main():
    print("="*80)
    print("TESTING: Quality Dimensions WITHOUT Hidden Test Data")
    print("="*80)
    print()

    # Load the astropy-14182 task
    task = load_task('astropy__astropy-14182')

    print(f"Task: {task['instance_id']}")
    print(f"Problem (visible): {task['problem_statement'][:200]}...")
    print()

    # Get the golden patch (we use this as the candidate to test)
    golden_patch = task['patch']

    print("CRITICAL: We are NOT using test_patch (hidden FAIL_TO_PASS test)")
    print("CRITICAL: Dimensions should catch gaps through structural completeness only")
    print()

    # Create reasoning and file contents
    reasoning = create_reasoning_from_problem(task['problem_statement'])
    file_contents = extract_files_from_diff(golden_patch)

    # Evaluate quality using ONLY visible data
    # NO test_code parameter - this is the fix!
    print("Evaluating with ONLY visible data (no hidden test)...")

    # Import config to enable expensive dimensions
    from quality_gate.evaluator_extended import ExtendedQualityGateConfig
    config = ExtendedQualityGateConfig(
        enable_algebraic_completeness=True,  # Enable to test emergent completeness!
        enable_bijective_requirements=True   # Enable to test assumed spec!
    )

    result = evaluate_extended_quality_gate(
        reasoning=reasoning,
        diff=golden_patch,
        file_contents=file_contents,
        requirements=task['problem_statement'],  # Only visible problem statement
        config=config
        # NOTE: No test_code parameter - we don't use hidden test_patch!
    )

    print()
    print("="*80)
    print("RESULTS")
    print("="*80)
    print()

    print(f"Overall Quality: {result.quality.overall_quality:.4f}")
    print()

    print("Dimension Scores:")
    print(f"  Algebraic:      {result.quality.algebraic_completeness:.4f}")
    print(f"  Bijective:      {result.quality.bijective_requirements:.4f}")
    print(f"  Documentation:  {result.quality.documentation_completeness:.4f}")
    print(f"  Reasoning:      {result.quality.reasoning_score:.4f}")
    print(f"  Implementation: {result.quality.implementation_score:.4f}")
    print()

    # Check if algebraic dimension caught the missing read()
    print("="*80)
    print("VALIDATION: Did dimensions catch missing read() without seeing hidden test?")
    print("="*80)
    print()

    if result.quality.algebraic_completeness < 1.0:
        print("✓ PASS: Algebraic dimension detected incompleteness!")
        print(f"  Score: {result.quality.algebraic_completeness:.4f} < 1.0")
        print("  This proves emergent completeness works:")
        print("  - Golden patch adds write(header_rows)")
        print("  - Category theory says write requires dual read")
        print("  - Algebraic dimension caught missing read() WITHOUT seeing hidden test")
    else:
        print("✗ FAIL: Algebraic dimension did not detect incompleteness")
        print(f"  Score: {result.quality.algebraic_completeness:.4f}")
        print("  Expected: < 1.0 due to missing read() dual")

    print()

    if result.quality.bijective_requirements < 1.0:
        print("✓ PASS: Bijective dimension detected misalignment!")
        print(f"  Score: {result.quality.bijective_requirements:.4f} < 1.0")
        print("  The assumed spec (from category completeness) includes read(),")
        print("  but code only implements write(), causing misalignment")
    else:
        print("✗ FAIL: Bijective dimension did not detect misalignment")
        print(f"  Score: {result.quality.bijective_requirements:.4f}")

    print()
    print("="*80)
    print("EMERGENT COMPLETENESS VALIDATION")
    print("="*80)
    print()

    if result.quality.algebraic_completeness < 1.0 or result.quality.bijective_requirements < 1.0:
        print("✓ SUCCESS: Dimensions discovered missing requirements WITHOUT hidden test!")
        print()
        print("This validates the core hypothesis:")
        print("  1. Requirements mention 'support header_rows in RST output'")
        print("  2. Category theory expands to: write(header_rows) + read(header_rows)")
        print("  3. Golden patch only implements write(header_rows)")
        print("  4. Algebraic/bijective dimensions catch missing read() as dual")
        print("  5. NO HIDDEN TEST DATA was used in this detection")
        print()
        print("The system exhibits emergent completeness through pure structural analysis!")
    else:
        print("✗ WARNING: Dimensions did not catch the gap")
        print("This may indicate that category expansion needs tuning")

    print()
    print("="*80)
    print(f"Total Cost: ${result.total_cost_usd:.4f}")
    print("="*80)


if __name__ == '__main__':
    main()
