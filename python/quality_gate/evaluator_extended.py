# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Extended Quality Gate Evaluation with 8 Dimensions

Integrates the original 5 Bayesian dimensions with 3 new implementation dimensions:
  Group A (Reasoning - 80%): Prior, Hypothesis, Evidence, Solution, Outcome
  Group B (Implementation - 20%): Documentation, Algebraic, Bijective

All scores are 0-1 scalars (not 0-100).
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# Import existing 5-dimension evaluator
from .evaluator import (
    PatchProposalReasoning,
    PatchQualityMetrics,
    evaluate_patch_quality as evaluate_5_dimensions
)

# Import new dimensions
from .dimension_documentation import (
    evaluate_documentation_completeness,
    DocumentationCompletenessResult
)
from .dimension_algebraic import (
    evaluate_algebraic_completeness,
    AlgebraicCompletenessResult
)
from .dimension_bijective import (
    evaluate_bijective_requirements,
    BijectiveRequirementsResult
)
from .dimension_overfitting import (
    evaluate_overfitting,
    OverfittingResult
)

# Import cache
from .cache import get_cache


@dataclass
class ExtendedQualityMetrics:
    """Quality metrics for all 9 dimensions (0-1 scalars)."""
    # Group A: Reasoning (existing 5 dimensions)
    prior_clarity: float
    hypothesis_coherence: float
    evidence_alignment: float
    solution_consistency: float
    outcome_observability: float

    # Group B: Implementation (4 dimensions)
    documentation_completeness: float
    algebraic_completeness: float
    bijective_requirements: float
    overfitting_resistance: float  # NEW: catches example-specific patches

    # Overall scores
    reasoning_score: float
    implementation_score: float
    overall_quality: float


@dataclass
class ExtendedQualityGateConfig:
    """Configuration for extended quality gate."""
    # Overall threshold
    min_overall_quality: float = 0.70

    # Group thresholds
    min_reasoning_quality: float = 0.70
    min_implementation_quality: float = 0.70

    # Individual dimension thresholds
    min_dimension_scores: Dict[str, float] = field(default_factory=lambda: {
        "hypothesis_coherence": 0.60,
        "evidence_alignment": 0.60,
        "documentation_completeness": 0.70,
        "algebraic_completeness": 0.70,
        "bijective_requirements": 0.70,
        "overfitting_resistance": 0.60,  # Block patches that overfit to examples
    })

    # Dimension weights (must sum to 1.0)
    dimension_weights: Dict[str, float] = field(default_factory=lambda: {
        # Group A: Reasoning (70% total)
        "prior_clarity": 0.12,
        "hypothesis_coherence": 0.18,
        "evidence_alignment": 0.18,
        "solution_consistency": 0.12,
        "outcome_observability": 0.10,

        # Group B: Implementation (30% total)
        "documentation_completeness": 0.05,
        "algebraic_completeness": 0.05,
        "bijective_requirements": 0.05,
        "overfitting_resistance": 0.15,  # High weight - overfitting is critical
    })

    # Feature flags
    enable_documentation_completeness: bool = True
    enable_algebraic_completeness: bool = False  # Expensive, default OFF
    enable_bijective_requirements: bool = False  # Expensive, default OFF
    enable_overfitting_resistance: bool = True   # Cheap, catches critical issues

    # LLM configuration
    documentation_use_llm: bool = False
    algebraic_model: str = "gpt-5-mini"
    bijective_model: str = "gpt-5-mini"

    # Cache configuration
    cache_file: str = ".quality-dimension-cache.json"
    cache_max_age_days: int = 90
    max_dimension_cost_per_eval: float = 1.0  # USD

    @classmethod
    def from_env(cls) -> 'ExtendedQualityGateConfig':
        """Create config from environment variables."""
        return cls(
            enable_documentation_completeness=os.getenv('ENABLE_DOCUMENTATION_COMPLETENESS', 'true').lower() == 'true',
            enable_algebraic_completeness=os.getenv('ENABLE_ALGEBRAIC_COMPLETENESS', 'false').lower() == 'true',
            enable_bijective_requirements=os.getenv('ENABLE_BIJECTIVE_REQUIREMENTS', 'false').lower() == 'true',
            documentation_use_llm=os.getenv('DOCUMENTATION_USE_LLM_VALIDATION', 'false').lower() == 'true',
            algebraic_model=os.getenv('ALGEBRAIC_COMPLETION_MODEL', 'gpt-5-mini'),
            bijective_model=os.getenv('BIJECTIVE_REQUIREMENTS_MODEL', 'gpt-5-mini'),
            cache_file=os.getenv('QUALITY_DIMENSION_CACHE_FILE', '.quality-dimension-cache.json'),
            cache_max_age_days=int(os.getenv('QUALITY_DIMENSION_CACHE_MAX_AGE_DAYS', '90')),
            max_dimension_cost_per_eval=float(os.getenv('MAX_DIMENSION_COST_PER_EVAL', '1.0')),
        )


@dataclass
class ExtendedQualityGateResult:
    """Result of extended quality gate evaluation."""
    passes: bool
    quality: ExtendedQualityMetrics

    # Detailed results from each dimension
    documentation_result: Optional[DocumentationCompletenessResult] = None
    algebraic_result: Optional[AlgebraicCompletenessResult] = None
    bijective_result: Optional[BijectiveRequirementsResult] = None
    overfitting_result: Optional[OverfittingResult] = None

    failures: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)

    # Cost tracking
    total_cost_usd: float = 0.0
    cache_hit: bool = False


def evaluate_extended_quality_gate(
    reasoning: PatchProposalReasoning,
    diff: str,
    file_contents: Dict[str, str],
    requirements: str = "",
    config: Optional[ExtendedQualityGateConfig] = None
) -> ExtendedQualityGateResult:
    """
    Evaluate extended quality gate with all 8 dimensions.

    Args:
        reasoning: Patch reasoning (for 5 Bayesian dimensions)
        diff: Git diff string
        file_contents: Map of file paths to their full content
        requirements: Requirements/issue description (visible problem statement only)
        config: Configuration (default: from environment)

    Returns:
        ExtendedQualityGateResult with scores in [0, 1]

    Note:
        This function deliberately does NOT accept test_code parameter to avoid
        overfitting to hidden FAIL_TO_PASS tests. The dimensions should discover
        missing requirements through structural completeness analysis (category theory,
        intent documentation, etc.) without seeing the hidden acceptance criteria.
    """
    if config is None:
        config = ExtendedQualityGateConfig.from_env()

    cache = get_cache(config.cache_file, config.cache_max_age_days)
    total_cost = 0.0

    # Step 1: Evaluate existing 5 Bayesian dimensions (0-100 scale)
    basic_quality = evaluate_5_dimensions(reasoning)

    # Convert to 0-1 scale
    prior_clarity = basic_quality.prior_clarity / 100.0
    hypothesis_coherence = basic_quality.hypothesis_coherence / 100.0
    evidence_alignment = basic_quality.evidence_alignment / 100.0
    solution_consistency = basic_quality.solution_consistency / 100.0
    outcome_observability = basic_quality.outcome_observability / 100.0

    # Step 2: Sequential evaluation of new dimensions (early exit for speed)

    # Dimension 6: Documentation Completeness (cheap, always run if enabled)
    documentation_score = 1.0  # Default: neutral
    documentation_result = None
    if config.enable_documentation_completeness:
        # Check cache first
        cached = cache.get('documentation', diff, str(file_contents))
        if cached:
            documentation_score = cached.score
            documentation_result = DocumentationCompletenessResult(
                score=cached.score,
                violations=cached.violations,
                recommendations=cached.recommendations,
                metrics=None,  # Not stored in cache
                symbol_ratio=0,
                file_ratio=0,
                directory_ratio=0
            )
        else:
            # Evaluate
            documentation_result = evaluate_documentation_completeness(
                diff,
                file_contents,
                use_llm_validation=config.documentation_use_llm
            )
            documentation_score = documentation_result.score

            # Cache result
            cache.put(
                'documentation',
                diff,
                str(file_contents),
                "",
                score=documentation_score,
                violations=documentation_result.violations,
                recommendations=documentation_result.recommendations,
                cost_usd=0.0  # Deterministic, no cost
            )

    # Early exit if documentation fails (optional optimization)
    # if documentation_score < config.min_dimension_scores.get('documentation_completeness', 0.70):
    #     return _build_failure_result(config, ...)

    # Dimension 7: Algebraic Completeness (expensive, check feature flag)
    algebraic_score = 1.0  # Default: neutral
    algebraic_result = None
    if config.enable_algebraic_completeness:
        # Check cache
        cached = cache.get('algebraic', diff, str(file_contents))
        if cached:
            algebraic_score = cached.score
            total_cost += cached.cost_usd
        else:
            # Evaluate
            algebraic_result = evaluate_algebraic_completeness(
                diff,
                file_contents,
                use_llm=True  # Use LLM for domain-specific patterns
            )
            algebraic_score = algebraic_result.score

            # Estimate cost (simplified)
            llm_cost = 0.10  # ~$0.10 per evaluation
            total_cost += llm_cost

            # Cache result
            cache.put(
                'algebraic',
                diff,
                str(file_contents),
                "",
                score=algebraic_score,
                violations=algebraic_result.violations,
                recommendations=algebraic_result.recommendations,
                model_used=config.algebraic_model,
                cost_usd=llm_cost
            )

    # Dimension 8: Bijective Requirements (most expensive)
    bijective_score = 1.0  # Default: neutral
    bijective_result = None
    if config.enable_bijective_requirements:
        # Check cache
        cached = cache.get('bijective', diff, str(file_contents), requirements)
        if cached:
            bijective_score = cached.score
            total_cost += cached.cost_usd
        else:
            # Evaluate (no test_code - use only visible requirements)
            bijective_result = evaluate_bijective_requirements(
                requirements,
                diff,
                file_contents,
                use_llm=True
            )
            bijective_score = bijective_result.score

            # Estimate cost
            llm_cost = 0.25  # ~$0.25 per evaluation
            total_cost += llm_cost

            # Cache result
            cache.put(
                'bijective',
                diff,
                str(file_contents),
                requirements,
                score=bijective_score,
                violations=bijective_result.violations if bijective_result else [],
                recommendations=bijective_result.recommendations if bijective_result else [],
                model_used=config.bijective_model,
                cost_usd=llm_cost
            )

    # Dimension 9: Overfitting Resistance (cheap, catches critical issues)
    overfitting_score = 1.0  # Default: neutral
    overfitting_result = None
    if config.enable_overfitting_resistance:
        # Check cache
        cached = cache.get('overfitting', diff, requirements)
        if cached:
            overfitting_score = cached.score
        else:
            # Evaluate - uses problem statement (requirements) and diff
            overfitting_result = evaluate_overfitting(
                problem_statement=requirements,
                diff=diff
            )
            overfitting_score = overfitting_result.score

            # Cache result (deterministic, no LLM cost)
            cache.put(
                'overfitting',
                diff,
                requirements,
                "",
                score=overfitting_score,
                violations=overfitting_result.feedback,
                recommendations=[],
                cost_usd=0.0
            )

    # Step 3: Compute overall scores
    # Group A: Reasoning (70% total weight)
    reasoning_weight_sum = sum([
        config.dimension_weights["prior_clarity"],
        config.dimension_weights["hypothesis_coherence"],
        config.dimension_weights["evidence_alignment"],
        config.dimension_weights["solution_consistency"],
        config.dimension_weights["outcome_observability"],
    ])
    reasoning_score = (
        config.dimension_weights["prior_clarity"] * prior_clarity +
        config.dimension_weights["hypothesis_coherence"] * hypothesis_coherence +
        config.dimension_weights["evidence_alignment"] * evidence_alignment +
        config.dimension_weights["solution_consistency"] * solution_consistency +
        config.dimension_weights["outcome_observability"] * outcome_observability
    ) / reasoning_weight_sum  # Normalize to [0, 1]

    # Group B: Implementation (30% total weight)
    implementation_weight_sum = sum([
        config.dimension_weights["documentation_completeness"],
        config.dimension_weights["algebraic_completeness"],
        config.dimension_weights["bijective_requirements"],
        config.dimension_weights["overfitting_resistance"],
    ])
    implementation_score = (
        config.dimension_weights["documentation_completeness"] * documentation_score +
        config.dimension_weights["algebraic_completeness"] * algebraic_score +
        config.dimension_weights["bijective_requirements"] * bijective_score +
        config.dimension_weights["overfitting_resistance"] * overfitting_score
    ) / implementation_weight_sum  # Normalize to [0, 1]

    overall_quality = reasoning_weight_sum * reasoning_score + implementation_weight_sum * implementation_score

    # Step 4: Build metrics
    metrics = ExtendedQualityMetrics(
        prior_clarity=prior_clarity,
        hypothesis_coherence=hypothesis_coherence,
        evidence_alignment=evidence_alignment,
        solution_consistency=solution_consistency,
        outcome_observability=outcome_observability,
        documentation_completeness=documentation_score,
        algebraic_completeness=algebraic_score,
        bijective_requirements=bijective_score,
        overfitting_resistance=overfitting_score,
        reasoning_score=reasoning_score,
        implementation_score=implementation_score,
        overall_quality=overall_quality
    )

    # Step 5: Check thresholds and generate failures/suggestions
    failures = []
    suggestions = []

    # Overall quality check
    if overall_quality < config.min_overall_quality:
        failures.append(
            f"Overall quality {overall_quality:.2f} below threshold {config.min_overall_quality:.2f}"
        )

    # Individual dimension checks
    dimension_scores = {
        "prior_clarity": prior_clarity,
        "hypothesis_coherence": hypothesis_coherence,
        "evidence_alignment": evidence_alignment,
        "solution_consistency": solution_consistency,
        "outcome_observability": outcome_observability,
        "documentation_completeness": documentation_score,
        "algebraic_completeness": algebraic_score,
        "bijective_requirements": bijective_score,
        "overfitting_resistance": overfitting_score,
    }

    for dimension, threshold in config.min_dimension_scores.items():
        score = dimension_scores.get(dimension, 1.0)
        if score < threshold:
            failures.append(
                f"{dimension}: {score:.2f} below threshold {threshold:.2f}"
            )

    # Collect suggestions from dimension-specific results
    if documentation_result and documentation_result.recommendations:
        suggestions.extend(documentation_result.recommendations)

    if algebraic_result and algebraic_result.recommendations:
        suggestions.extend(algebraic_result.recommendations)

    if bijective_result and bijective_result.recommendations:
        suggestions.extend(bijective_result.recommendations)

    if overfitting_result and overfitting_result.feedback:
        suggestions.extend(overfitting_result.feedback)

    passes = len(failures) == 0

    return ExtendedQualityGateResult(
        passes=passes,
        quality=metrics,
        documentation_result=documentation_result,
        algebraic_result=algebraic_result,
        bijective_result=bijective_result,
        overfitting_result=overfitting_result,
        failures=failures,
        suggestions=suggestions,
        total_cost_usd=total_cost
    )
