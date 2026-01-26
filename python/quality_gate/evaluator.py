"""
Quality Gate Evaluation for Patch Proposal Reasoning

Python port of TypeScript src/experiments/swebench/quality-gate.ts

Evaluates the quality of patch reasoning using 5 Bayesian-style dimensions:
1. Prior Clarity - Understanding of current state
2. Hypothesis Coherence - Well-formed causal hypothesis
3. Evidence Alignment - Code analysis matches reality
4. Solution Consistency - Code aligns with hypothesis
5. Outcome Observability - Predicted outcomes are testable
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class PriorUnderstanding:
    """Prior: What is currently broken and why?"""
    bug_description: str
    current_behavior: str
    expected_behavior: str
    confidence: float  # 0-1


@dataclass
class CausalHypothesis:
    """Hypothesis: Causal chain from root cause to fix"""
    root_cause: str
    causal_chain: List[str]
    rationale: str


@dataclass
class SupportingEvidence:
    """Evidence: Code analysis supporting the hypothesis"""
    code_references: List[Dict[str, str]]  # {file, lines, observation}
    observations: List[str]
    supporting_logic: str


@dataclass
class ProposedSolution:
    """Solution: The proposed change"""
    change_description: str
    addresses_cause: str
    minimality: str


@dataclass
class OutcomePrediction:
    """Prediction: Expected outcomes"""
    test_outcomes: List[str]
    effects: List[str]
    verification_plan: str


@dataclass
class PatchProposalReasoning:
    """Complete reasoning structure for a patch proposal"""
    prior: PriorUnderstanding
    hypothesis: CausalHypothesis
    evidence: SupportingEvidence
    solution: ProposedSolution
    prediction: OutcomePrediction


@dataclass
class PatchQualityMetrics:
    """Quality metrics for patch proposal reasoning (0-100 each)"""
    prior_clarity: float
    hypothesis_coherence: float
    evidence_alignment: float
    solution_consistency: float
    outcome_observability: float
    overall_quality: float


@dataclass
class QualityGateConfig:
    """Configuration for quality gate thresholds"""
    min_overall_quality: float = 70.0
    min_dimension_scores: Dict[str, float] = field(default_factory=lambda: {
        "hypothesis_coherence": 60.0,
        "evidence_alignment": 60.0,
    })


@dataclass
class QualityGateResult:
    """Result of quality gate evaluation"""
    passes: bool
    quality: PatchQualityMetrics
    failures: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)


# =============================================================================
# Quality Dimension Weights
# =============================================================================

DIMENSION_WEIGHTS = {
    "prior_clarity": 0.20,
    "hypothesis_coherence": 0.25,
    "evidence_alignment": 0.25,
    "solution_consistency": 0.20,
    "outcome_observability": 0.10,
}

# Default configuration
DEFAULT_QUALITY_GATE = QualityGateConfig(
    min_overall_quality=70.0,
    min_dimension_scores={
        "hypothesis_coherence": 60.0,
        "evidence_alignment": 60.0,
    }
)


# =============================================================================
# Evaluation Functions
# =============================================================================

def evaluate_patch_quality(reasoning: PatchProposalReasoning) -> PatchQualityMetrics:
    """
    Evaluate the quality of a patch proposal's reasoning.

    Returns PatchQualityMetrics with scores 0-100 for each dimension.
    """
    # 1. Prior Clarity
    prior_clarity = _evaluate_prior_clarity(reasoning.prior)

    # 2. Hypothesis Coherence
    hypothesis_coherence = _evaluate_hypothesis_coherence(reasoning.hypothesis)

    # 3. Evidence Alignment
    evidence_alignment = _evaluate_evidence_alignment(
        reasoning.evidence,
        reasoning.hypothesis
    )

    # 4. Solution Consistency
    solution_consistency = _evaluate_solution_consistency(
        reasoning.solution,
        reasoning.hypothesis
    )

    # 5. Outcome Observability
    outcome_observability = _evaluate_outcome_observability(reasoning.prediction)

    # Compute weighted overall quality
    overall_quality = (
        prior_clarity * DIMENSION_WEIGHTS["prior_clarity"] +
        hypothesis_coherence * DIMENSION_WEIGHTS["hypothesis_coherence"] +
        evidence_alignment * DIMENSION_WEIGHTS["evidence_alignment"] +
        solution_consistency * DIMENSION_WEIGHTS["solution_consistency"] +
        outcome_observability * DIMENSION_WEIGHTS["outcome_observability"]
    )

    return PatchQualityMetrics(
        prior_clarity=prior_clarity,
        hypothesis_coherence=hypothesis_coherence,
        evidence_alignment=evidence_alignment,
        solution_consistency=solution_consistency,
        outcome_observability=outcome_observability,
        overall_quality=overall_quality,
    )


def _evaluate_prior_clarity(prior: PriorUnderstanding) -> float:
    """Evaluate prior understanding clarity (0-100)."""
    score = 0.0

    # Has bug description
    if prior.bug_description and len(prior.bug_description) > 20:
        score += 25

    # Distinguishes current vs expected behavior
    if prior.current_behavior and prior.expected_behavior:
        score += 25

    # Clear behavioral difference
    if (prior.current_behavior and prior.expected_behavior and
        prior.current_behavior != prior.expected_behavior):
        score += 25

    # Confidence appropriately calibrated
    if 0.5 < prior.confidence <= 1.0:
        score += 25
    elif prior.confidence > 0:
        score += 10

    return min(100.0, score)


def _evaluate_hypothesis_coherence(hypothesis: CausalHypothesis) -> float:
    """Evaluate hypothesis coherence (0-100)."""
    score = 0.0

    # Has root cause
    if hypothesis.root_cause and len(hypothesis.root_cause) > 20:
        score += 30

    # Has causal chain
    if hypothesis.causal_chain and len(hypothesis.causal_chain) >= 2:
        score += 30
        # Bonus for detailed causal chain
        if len(hypothesis.causal_chain) >= 3:
            score += 10

    # Has rationale
    if hypothesis.rationale and len(hypothesis.rationale) > 30:
        score += 30

    return min(100.0, score)


def _evaluate_evidence_alignment(
    evidence: SupportingEvidence,
    hypothesis: CausalHypothesis
) -> float:
    """Evaluate evidence alignment (0-100)."""
    score = 0.0

    # Has code references
    if evidence.code_references and len(evidence.code_references) > 0:
        score += 30
        # Bonus for multiple references
        if len(evidence.code_references) >= 2:
            score += 10

    # Has observations
    if evidence.observations and len(evidence.observations) > 0:
        score += 30

    # Has supporting logic
    if evidence.supporting_logic and len(evidence.supporting_logic) > 30:
        score += 30

    return min(100.0, score)


def _evaluate_solution_consistency(
    solution: ProposedSolution,
    hypothesis: CausalHypothesis
) -> float:
    """Evaluate solution consistency (0-100)."""
    score = 0.0

    # Has change description
    if solution.change_description and len(solution.change_description) > 20:
        score += 30

    # Addresses cause
    if solution.addresses_cause and len(solution.addresses_cause) > 20:
        score += 40

        # Check if it references the root cause
        if hypothesis.root_cause:
            root_cause_snippet = hypothesis.root_cause.lower()[:20]
            if root_cause_snippet in solution.addresses_cause.lower():
                score += 10

    # Discusses minimality
    if solution.minimality and len(solution.minimality) > 10:
        score += 20

    return min(100.0, score)


def _evaluate_outcome_observability(prediction: OutcomePrediction) -> float:
    """Evaluate outcome observability (0-100)."""
    score = 0.0

    # Has test outcomes
    if prediction.test_outcomes and len(prediction.test_outcomes) > 0:
        score += 40

    # Has effects
    if prediction.effects and len(prediction.effects) > 0:
        score += 30

    # Has verification plan
    if prediction.verification_plan and len(prediction.verification_plan) > 20:
        score += 30

    return min(100.0, score)


# =============================================================================
# Quality Gate Decision
# =============================================================================

def evaluate_quality_gate(
    reasoning: PatchProposalReasoning,
    config: Optional[QualityGateConfig] = None
) -> QualityGateResult:
    """
    Determine if reasoning passes quality gate.

    Returns QualityGateResult with pass/fail and specific failures.
    """
    if config is None:
        config = DEFAULT_QUALITY_GATE

    quality = evaluate_patch_quality(reasoning)
    failures = []
    suggestions = []

    # Check overall quality
    if quality.overall_quality < config.min_overall_quality:
        failures.append(
            f"Overall quality {quality.overall_quality:.1f} below threshold {config.min_overall_quality:.1f}"
        )
        suggestions.append("Strengthen reasoning across all dimensions")

    # Check individual dimensions
    dimension_scores = {
        "prior_clarity": quality.prior_clarity,
        "hypothesis_coherence": quality.hypothesis_coherence,
        "evidence_alignment": quality.evidence_alignment,
        "solution_consistency": quality.solution_consistency,
        "outcome_observability": quality.outcome_observability,
    }

    for dimension, threshold in config.min_dimension_scores.items():
        score = dimension_scores.get(dimension, 0)
        if score < threshold:
            failures.append(
                f"{dimension}: {score:.1f} below threshold {threshold:.1f}"
            )
            suggestions.append(f"Improve {dimension.replace('_', ' ')}")

    passes = len(failures) == 0

    return QualityGateResult(
        passes=passes,
        quality=quality,
        failures=failures,
        suggestions=suggestions,
    )


# =============================================================================
# Utility Functions
# =============================================================================

def format_quality_metrics(metrics: PatchQualityMetrics) -> str:
    """Format quality metrics for display."""
    return f"""Quality Metrics:
  Prior Clarity:         {metrics.prior_clarity:5.1f}
  Hypothesis Coherence:  {metrics.hypothesis_coherence:5.1f}
  Evidence Alignment:    {metrics.evidence_alignment:5.1f}
  Solution Consistency:  {metrics.solution_consistency:5.1f}
  Outcome Observability: {metrics.outcome_observability:5.1f}
  ─────────────────────────────────
  Overall Quality:       {metrics.overall_quality:5.1f}
"""
