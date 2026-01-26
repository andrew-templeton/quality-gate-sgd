"""
Quality Gate Evaluation for Patch Proposal Reasoning

Python port of TypeScript quality-gate.ts for scientific experiments.
"""

from .evaluator import (
    PatchProposalReasoning,
    PatchQualityMetrics,
    QualityGateConfig,
    QualityGateResult,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
    evaluate_patch_quality,
    evaluate_quality_gate,
    DEFAULT_QUALITY_GATE,
)

from .feedback import generate_quality_feedback, format_quality_summary

from .reasoning import extract_reasoning_from_trajectory

__version__ = "0.1.0"

__all__ = [
    "PatchProposalReasoning",
    "PatchQualityMetrics",
    "QualityGateConfig",
    "QualityGateResult",
    "PriorUnderstanding",
    "CausalHypothesis",
    "SupportingEvidence",
    "ProposedSolution",
    "OutcomePrediction",
    "evaluate_patch_quality",
    "evaluate_quality_gate",
    "generate_quality_feedback",
    "format_quality_summary",
    "extract_reasoning_from_trajectory",
    "DEFAULT_QUALITY_GATE",
]
