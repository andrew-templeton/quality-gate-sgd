# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Quality-Gated Agent for SWE-bench

End-to-end loop that:
1. Generates patches using LLM
2. Evaluates with quality gate (including overfitting/test-gaming detection)
3. Feeds back violations to LLM for regeneration
4. Repeats until quality gate passes or max iterations
"""

import json
import os
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from openai import OpenAI

# Import quality gate
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quality_gate.dimension_overfitting import evaluate_overfitting
from quality_gate.evaluator_extended import (
    evaluate_extended_quality_gate,
    ExtendedQualityGateConfig,
    ExtendedQualityGateResult,
)
from quality_gate.evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


@dataclass
class AgentIteration:
    """Single iteration of the agent."""
    iteration: int
    patch: str
    quality_score: float
    overfitting_score: float
    passes_gate: bool
    feedback: List[str]
    reasoning: Optional[str] = None


@dataclass
class AgentResult:
    """Result of quality-gated agent run."""
    task_id: str
    success: bool = False
    iterations: List[AgentIteration] = field(default_factory=list)
    final_patch: str = ""
    total_iterations: int = 0


SYSTEM_PROMPT = """You are an expert software engineer fixing bugs in open-source projects.

CRITICAL RULES:
1. FIX THE SOURCE CODE, NOT THE TESTS. Tests define expected behavior.
2. NEVER delete, skip, or modify tests to make your patch "pass"
3. NEVER hardcode example-specific values from the problem statement
4. Your solution must be GENERAL and work for ALL inputs, not just the example
5. Use proper algorithms and data structures, not hardcoded mappings

When you encounter a bug:
1. Understand the GENERAL problem, not just the specific example
2. Identify the root cause in the implementation
3. Fix the implementation to handle ALL cases correctly
4. The fix should make existing tests pass WITHOUT modifying them

Output format:
<reasoning>
Your analysis of the bug and proposed fix
</reasoning>

<patch>
Your unified diff patch (only source files, never test files)
</patch>
"""

REFINEMENT_PROMPT = """Your previous patch was REJECTED by the quality gate.

VIOLATIONS DETECTED:
{feedback}

CRITICAL: You must fix these issues:
- If "TEST DELETION" or "TEST GAMING": You modified tests. REVERT ALL TEST CHANGES. Fix the SOURCE CODE only.
- If "OVERFITTING": You hardcoded example values. Make your solution GENERAL.
- If "ALGORITHM MISSING": Use proper data structures, not hardcoded maps.

Generate a NEW patch that:
1. Only modifies SOURCE CODE (never test files)
2. Uses a GENERAL algorithm that works for ALL inputs
3. Does NOT contain any strings from the problem statement examples

<reasoning>
Your corrected analysis
</reasoning>

<patch>
Your corrected unified diff (source files ONLY)
</patch>
"""


def call_llm(
    client: OpenAI,
    messages: List[Dict[str, str]],
    model: str = "gpt-5-mini"
) -> str:
    """Call OpenAI-compatible LLM."""
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_completion_tokens=4096,
    )
    return response.choices[0].message.content


def extract_patch(response: str) -> str:
    """Extract patch from LLM response."""
    import re

    # Try to find <patch> tags
    match = re.search(r'<patch>(.*?)</patch>', response, re.DOTALL)
    if match:
        return match.group(1).strip()

    # Try to find diff blocks
    match = re.search(r'```diff\n(.*?)```', response, re.DOTALL)
    if match:
        return match.group(1).strip()

    # Try to find any diff content
    match = re.search(r'(diff --git.*?)(?=\n\n[^-+@]|\Z)', response, re.DOTALL)
    if match:
        return match.group(1).strip()

    return ""


def extract_reasoning(response: str) -> str:
    """Extract reasoning from LLM response."""
    import re
    match = re.search(r'<reasoning>(.*?)</reasoning>', response, re.DOTALL)
    if match:
        return match.group(1).strip()
    return response[:500]


def evaluate_patch(
    problem_statement: str,
    patch: str,
    config: Optional[ExtendedQualityGateConfig] = None
) -> tuple[float, float, bool, List[str]]:
    """
    Evaluate patch quality with focus on overfitting/test gaming.

    Returns: (quality_score, overfitting_score, passes, feedback_list)
    """
    if config is None:
        config = ExtendedQualityGateConfig(
            enable_documentation_completeness=False,
            enable_algebraic_completeness=False,
            enable_bijective_requirements=False,
            enable_overfitting_resistance=True,
            min_dimension_scores={
                "overfitting_resistance": 0.60,
            }
        )

    # Quick overfitting check (the main gate for this experiment)
    overfit_result = evaluate_overfitting(problem_statement, patch)

    # Build feedback
    feedback = overfit_result.feedback.copy()

    # Check if patch modifies test files
    if 'test' in patch.lower() and ('def test_' in patch or '-    def test_' in patch):
        if '-    def test_' in patch or '-        self.assert' in patch:
            feedback.insert(0,
                "🚨 CRITICAL: You are modifying TEST FILES. This is FORBIDDEN. "
                "Your job is to fix the SOURCE CODE so tests pass, NOT to change tests. "
                "Generate a new patch that ONLY modifies implementation files."
            )

    passes = overfit_result.score >= 0.60 and len(feedback) == 0

    # If feedback is empty but score is low, add generic feedback
    if not passes and not feedback:
        feedback.append(
            f"Quality score {overfit_result.score:.2f} below threshold 0.60. "
            "Ensure your solution is general and doesn't overfit to examples."
        )

    return overfit_result.score, overfit_result.score, passes, feedback


def run_quality_gated_agent(
    task_id: str,
    problem_statement: str,
    repo_context: str = "",
    max_iterations: int = 5,
    model: str = "gpt-5-mini",
    api_key: Optional[str] = None,
) -> AgentResult:
    """
    Run quality-gated agent on a task.

    Args:
        task_id: SWE-bench task ID
        problem_statement: The bug report / issue description
        repo_context: Optional context about the repository
        max_iterations: Max refinement iterations
        model: LLM model to use
        api_key: OpenAI API key (or from env)

    Returns:
        AgentResult with iterations and final patch
    """
    client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))

    result = AgentResult(task_id=task_id)

    # Initial prompt
    user_prompt = f"""Fix this bug:

{problem_statement}

{repo_context}

Generate a patch that fixes this bug. Remember:
- Fix the SOURCE CODE, not tests
- Solution must be GENERAL, not example-specific
- Use proper algorithms, not hardcoded values
"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    for iteration in range(1, max_iterations + 1):
        print(f"\n{'='*60}")
        print(f"Iteration {iteration}/{max_iterations}")
        print('='*60)

        # Call LLM
        print("Calling LLM...")
        response = call_llm(client, messages, model)

        # Extract patch
        patch = extract_patch(response)
        reasoning = extract_reasoning(response)

        if not patch:
            print("WARNING: No patch extracted from response")
            print(f"Response preview: {response[:500]}...")
            # Add to messages and retry
            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content":
                "I couldn't find a valid patch in your response. "
                "Please provide a unified diff patch in <patch>...</patch> tags."
            })
            continue

        print(f"Extracted patch ({len(patch)} chars)")

        # Evaluate quality
        print("Evaluating patch quality...")
        quality, overfit, passes, feedback = evaluate_patch(problem_statement, patch)

        print(f"Quality Score: {quality:.3f}")
        print(f"Overfitting Score: {overfit:.3f}")
        print(f"Passes Gate: {passes}")

        # Record iteration
        iter_result = AgentIteration(
            iteration=iteration,
            patch=patch,
            quality_score=quality,
            overfitting_score=overfit,
            passes_gate=passes,
            feedback=feedback,
            reasoning=reasoning,
        )
        result.iterations.append(iter_result)

        if passes:
            print("\n✓ PATCH PASSES QUALITY GATE")
            result.success = True
            result.final_patch = patch
            result.total_iterations = iteration
            return result

        # Print feedback
        print("\nQuality Gate Feedback:")
        for fb in feedback:
            print(f"  - {fb}")

        # Add to conversation for refinement
        messages.append({"role": "assistant", "content": response})
        messages.append({"role": "user", "content":
            REFINEMENT_PROMPT.format(feedback="\n".join(f"- {fb}" for fb in feedback))
        })

    # Reached max iterations
    print(f"\n⚠ Reached max iterations ({max_iterations})")
    result.success = False
    result.total_iterations = max_iterations
    if result.iterations:
        # Use best patch (highest quality)
        best = max(result.iterations, key=lambda x: x.quality_score)
        result.final_patch = best.patch

    return result


def main():
    """Test the quality-gated agent on django__django-11019."""

    problem_statement = """
Merging 3 or more media objects can throw unnecessary MediaOrderConflictWarnings

Description

Consider the following form definition, where text-editor-extras.js depends on text-editor.js but all other JS files are independent:

from django import forms

class ColorPicker(forms.Widget):
    class Media:
        js = ['color-picker.js']

class SimpleTextWidget(forms.Widget):
    class Media:
        js = ['text-editor.js']

class FancyTextWidget(forms.Widget):
    class Media:
        js = ['text-editor.js', 'text-editor-extras.js', 'color-picker.js']

class MyForm(forms.Form):
    background_color = forms.CharField(widget=ColorPicker())
    intro = forms.CharField(widget=SimpleTextWidget())
    body = forms.CharField(widget=FancyTextWidget())

Django should be able to resolve the JS dependencies for a MyForm instance in a single unique order. However, depending on the order of the fields, various MediaOrderConflictWarnings are raised.

The merge function in django/forms/widgets.py needs to be fixed to properly handle this case without false warnings.
"""

    repo_context = """
Repository: django/django
File to modify: django/forms/widgets.py
Function: Media.merge(list_1, list_2) - static method that merges two media lists

The current implementation walks list_2 in reverse and warns if elements appear in a different relative order. This causes false positives when merging 3+ media objects.

Key insight: The warning should only fire when there's a GENUINE conflict that cannot be resolved, not when elements from different sources happen to appear in different orders.
"""

    print("="*60)
    print("Quality-Gated Agent Test: django__django-11019")
    print("="*60)

    result = run_quality_gated_agent(
        task_id="django__django-11019",
        problem_statement=problem_statement,
        repo_context=repo_context,
        max_iterations=5,
        model="gpt-5-mini",
    )

    print("\n" + "="*60)
    print("FINAL RESULT")
    print("="*60)
    print(f"Success: {result.success}")
    print(f"Total Iterations: {result.total_iterations}")
    print(f"Final Patch Length: {len(result.final_patch)} chars")

    if result.final_patch:
        print("\nFinal Patch:")
        print("-"*60)
        print(result.final_patch[:2000])
        if len(result.final_patch) > 2000:
            print("... (truncated)")

    # Save result
    output_file = f"quality_gated_result_{result.task_id}.json"
    with open(output_file, 'w') as f:
        json.dump({
            'task_id': result.task_id,
            'success': result.success,
            'total_iterations': result.total_iterations,
            'final_patch': result.final_patch,
            'iterations': [
                {
                    'iteration': it.iteration,
                    'quality_score': it.quality_score,
                    'overfitting_score': it.overfitting_score,
                    'passes_gate': it.passes_gate,
                    'feedback': it.feedback,
                    'patch_length': len(it.patch),
                }
                for it in result.iterations
            ]
        }, f, indent=2)
    print(f"\nResult saved to {output_file}")

    return result


if __name__ == "__main__":
    main()
