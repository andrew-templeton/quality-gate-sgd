"""
Quality Gate Feedback Generation

Provides actionable feedback when reasoning fails quality checks.
"""

from .evaluator import QualityGateResult, PatchQualityMetrics


def generate_quality_feedback(gate_result: QualityGateResult) -> str:
    """
    Generate actionable feedback for failed quality gate.

    Returns human-readable feedback explaining what needs improvement.
    """
    if gate_result.passes:
        return "Quality gate passed. Reasoning meets all thresholds."

    parts = ["Quality gate rejected. Please address the following:"]
    parts.append("")

    # Add failures
    if gate_result.failures:
        parts.append("Failures:")
        for failure in gate_result.failures:
            parts.append(f"  • {failure}")
        parts.append("")

    # Add specific suggestions
    quality = gate_result.quality

    if quality.prior_clarity < 60:
        parts.append("Prior Clarity (Low):")
        parts.append("  - Provide clearer bug description (what's broken)")
        parts.append("  - Distinguish current vs expected behavior")
        parts.append("  - State confidence level in understanding")
        parts.append("")

    if quality.hypothesis_coherence < 60:
        parts.append("Hypothesis Coherence (Low):")
        parts.append("  - Identify root cause more precisely")
        parts.append("  - Build causal chain: cause → effect → fix")
        parts.append("  - Explain why this fix should work")
        parts.append("")

    if quality.evidence_alignment < 60:
        parts.append("Evidence Alignment (Low):")
        parts.append("  - Reference specific files and line numbers")
        parts.append("  - Cite observations from code analysis")
        parts.append("  - Explain how evidence supports hypothesis")
        parts.append("")

    if quality.solution_consistency < 60:
        parts.append("Solution Consistency (Low):")
        parts.append("  - Describe the proposed change clearly")
        parts.append("  - Explain how it addresses the root cause")
        parts.append("  - Justify why this is the minimal change")
        parts.append("")

    if quality.outcome_observability < 60:
        parts.append("Outcome Observability (Low):")
        parts.append("  - Predict which tests should pass/fail")
        parts.append("  - List observable effects of the change")
        parts.append("  - Provide verification plan")
        parts.append("")

    # Add general suggestions
    if gate_result.suggestions:
        parts.append("Suggestions:")
        for suggestion in gate_result.suggestions:
            parts.append(f"  • {suggestion}")

    return "\n".join(parts)


def format_quality_summary(metrics: PatchQualityMetrics, threshold: float = 70.0) -> str:
    """
    Format a compact summary of quality metrics.

    Returns single-line status for logging.
    """
    status = "✓ PASS" if metrics.overall_quality >= threshold else "✗ FAIL"

    return (
        f"{status} | "
        f"Overall: {metrics.overall_quality:4.1f} | "
        f"Prior: {metrics.prior_clarity:4.1f} | "
        f"Hyp: {metrics.hypothesis_coherence:4.1f} | "
        f"Evid: {metrics.evidence_alignment:4.1f} | "
        f"Soln: {metrics.solution_consistency:4.1f} | "
        f"Outc: {metrics.outcome_observability:4.1f}"
    )
