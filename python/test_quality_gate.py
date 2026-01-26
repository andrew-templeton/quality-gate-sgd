#!/usr/bin/env python3
"""
Test Quality Gate Evaluator

Validates that Python port matches TypeScript behavior.
"""

from quality_gate import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
    evaluate_patch_quality,
    evaluate_quality_gate,
    generate_quality_feedback,
    format_quality_summary,
    DEFAULT_QUALITY_GATE,
)


def test_high_quality_reasoning():
    """Test reasoning that should pass quality gate."""
    print("\n" + "=" * 80)
    print("TEST 1: High Quality Reasoning")
    print("=" * 80)

    reasoning = PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description="The separability_matrix function returns incorrect results for nested CompoundModels",
            current_behavior="Nested compound models show incorrect separability (all True in some blocks)",
            expected_behavior="Nested compound models should maintain proper separability of independent components",
            confidence=0.9,
        ),
        hypothesis=CausalHypothesis(
            root_cause="The separability matrix computation doesn't recursively handle nested CompoundModel structures",
            causal_chain=[
                "CompoundModel nesting creates multi-level structure",
                "Current algorithm only handles flat composition",
                "Result: incorrect separability propagation",
            ],
            rationale="The issue occurs because the separability_matrix function treats nested models as atomic units rather than recursively analyzing their internal structure",
        ),
        evidence=SupportingEvidence(
            code_references=[
                {
                    "file": "astropy/modeling/separable.py",
                    "lines": "50-75",
                    "observation": "Function uses _coord_matrix but doesn't handle nested models",
                },
                {
                    "file": "astropy/modeling/core.py",
                    "lines": "200-250",
                    "observation": "CompoundModel class supports nesting but separability not updated",
                },
            ],
            observations=[
                "separability_matrix works for flat compositions",
                "Breaks when models are nested via & operator",
                "Test case shows m.Pix2Sky_TAN() & cm fails",
            ],
            supporting_logic="Code analysis confirms that _coord_matrix handles composition operators but doesn't recurse into compound model internals",
        ),
        solution=ProposedSolution(
            change_description="Add recursive handling for nested CompoundModel in separability_matrix function",
            addresses_cause="Directly addresses the root cause by recursively analyzing CompoundModel structure",
            minimality="Only adds recursion for CompoundModel type, preserves existing behavior for other models",
        ),
        prediction=OutcomePrediction(
            test_outcomes=[
                "test_nested_compound_model should pass",
                "test_simple_compound_model should still pass (no regression)",
            ],
            effects=[
                "Nested compound models return correct separability matrices",
                "Backward compatible with existing flat compositions",
            ],
            verification_plan="Run pytest tests/modeling/test_separable.py -v",
        ),
    )

    quality = evaluate_patch_quality(reasoning)
    print("\nQuality Metrics:")
    print(f"  Prior Clarity:         {quality.prior_clarity:5.1f}")
    print(f"  Hypothesis Coherence:  {quality.hypothesis_coherence:5.1f}")
    print(f"  Evidence Alignment:    {quality.evidence_alignment:5.1f}")
    print(f"  Solution Consistency:  {quality.solution_consistency:5.1f}")
    print(f"  Outcome Observability: {quality.outcome_observability:5.1f}")
    print(f"  Overall Quality:       {quality.overall_quality:5.1f}")

    gate_result = evaluate_quality_gate(reasoning, DEFAULT_QUALITY_GATE)
    print(f"\nQuality Gate: {'✓ PASS' if gate_result.passes else '✗ FAIL'}")

    if not gate_result.passes:
        print("\nFailures:")
        for failure in gate_result.failures:
            print(f"  - {failure}")

    assert gate_result.passes, "High quality reasoning should pass gate"
    assert quality.overall_quality >= 70, f"Expected >=70, got {quality.overall_quality}"


def test_low_quality_reasoning():
    """Test reasoning that should fail quality gate."""
    print("\n" + "=" * 80)
    print("TEST 2: Low Quality Reasoning")
    print("=" * 80)

    reasoning = PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description="Bug",
            current_behavior="Broken",
            expected_behavior="Fixed",
            confidence=0.3,
        ),
        hypothesis=CausalHypothesis(
            root_cause="It's wrong",
            causal_chain=["Something broke"],
            rationale="Fix it",
        ),
        evidence=SupportingEvidence(
            code_references=[],
            observations=[],
            supporting_logic="",
        ),
        solution=ProposedSolution(
            change_description="Change code",
            addresses_cause="Will fix",
            minimality="Small",
        ),
        prediction=OutcomePrediction(
            test_outcomes=[],
            effects=[],
            verification_plan="",
        ),
    )

    quality = evaluate_patch_quality(reasoning)
    print("\nQuality Metrics:")
    print(f"  Prior Clarity:         {quality.prior_clarity:5.1f}")
    print(f"  Hypothesis Coherence:  {quality.hypothesis_coherence:5.1f}")
    print(f"  Evidence Alignment:    {quality.evidence_alignment:5.1f}")
    print(f"  Solution Consistency:  {quality.solution_consistency:5.1f}")
    print(f"  Outcome Observability: {quality.outcome_observability:5.1f}")
    print(f"  Overall Quality:       {quality.overall_quality:5.1f}")

    gate_result = evaluate_quality_gate(reasoning, DEFAULT_QUALITY_GATE)
    print(f"\nQuality Gate: {'✓ PASS' if gate_result.passes else '✗ FAIL'}")

    if not gate_result.passes:
        print("\nFeedback:")
        feedback = generate_quality_feedback(gate_result)
        print(feedback)

    assert not gate_result.passes, "Low quality reasoning should fail gate"
    assert quality.overall_quality < 70, f"Expected <70, got {quality.overall_quality}"


def test_summary_formatting():
    """Test quality summary formatting."""
    print("\n" + "=" * 80)
    print("TEST 3: Summary Formatting")
    print("=" * 80)

    from quality_gate import PatchQualityMetrics

    metrics = PatchQualityMetrics(
        prior_clarity=85.0,
        hypothesis_coherence=90.0,
        evidence_alignment=80.0,
        solution_consistency=75.0,
        outcome_observability=70.0,
        overall_quality=82.0,
    )

    summary = format_quality_summary(metrics, threshold=70.0)
    print(f"\n{summary}")

    assert "✓ PASS" in summary, "Should show PASS for quality >= threshold"


if __name__ == "__main__":
    print("Quality Gate Evaluator Tests")
    print("=" * 80)

    try:
        test_high_quality_reasoning()
        test_low_quality_reasoning()
        test_summary_formatting()

        print("\n" + "=" * 80)
        print("✓ All tests passed!")
        print("=" * 80)
        print("\nPython quality gate is working correctly.")
        print("Ready to integrate with mini-swe-agent.\n")

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
