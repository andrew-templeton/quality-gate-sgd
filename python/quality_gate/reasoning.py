"""
Reasoning Extraction from Agent Trajectories

Extracts structured reasoning from mini-swe-agent message history.
"""

import re
from typing import List, Dict, Optional

from .evaluator import (
    PatchProposalReasoning,
    PriorUnderstanding,
    CausalHypothesis,
    SupportingEvidence,
    ProposedSolution,
    OutcomePrediction,
)


def extract_reasoning_from_trajectory(messages: List[Dict[str, any]]) -> Optional[PatchProposalReasoning]:
    """
    Extract reasoning from mini-swe-agent trajectory.

    Mini-swe-agent includes THOUGHT sections before each bash action.
    We aggregate these to reconstruct the reasoning structure.

    Args:
        messages: List of message dicts with 'role' and 'content'

    Returns:
        PatchProposalReasoning or None if insufficient reasoning found
    """
    thoughts = []
    actions = []

    # Extract THOUGHT sections and actions from assistant messages
    for msg in messages:
        if msg.get("role") != "assistant":
            continue

        content = msg.get("content", "")

        # Extract THOUGHT section
        thought_match = re.search(r"THOUGHT:?\s*(.+?)(?=```|$)", content, re.IGNORECASE | re.DOTALL)
        if thought_match:
            thoughts.append(thought_match.group(1).strip())

        # Extract bash action
        action_match = re.search(r"```bash\s*\n(.*?)\n```", content, re.DOTALL)
        if action_match:
            actions.append(action_match.group(1).strip())

    if not thoughts:
        return None

    # Reconstruct reasoning from thoughts
    all_thoughts = "\n\n".join(thoughts)

    # Heuristic extraction (simplified for MVP)
    # In production, could use LLM to parse thoughts into structured format

    # Prior: Extract from early thoughts
    bug_description = thoughts[0][:200] if thoughts else ""

    # Hypothesis: Look for problem/issue mentions
    root_cause = next(
        (t for t in thoughts if "issue" in t.lower() or "problem" in t.lower()),
        "Root cause identified through exploration"
    )

    # Evidence: Extract file references from actions
    code_references = []
    for i, action in enumerate(actions[:5]):
        if any(cmd in action for cmd in ["cat", "grep", "find", "nl"]):
            code_references.append({
                "file": action,
                "lines": f"action_{i}",
                "observation": thoughts[i] if i < len(thoughts) else "",
            })

    # Solution: Last few thoughts describe the fix
    change_description = " ".join(thoughts[-3:]) if len(thoughts) >= 3 else all_thoughts[:200]

    # Prediction: Look for test mentions
    test_outcomes = []
    for thought in thoughts:
        if "test" in thought.lower():
            test_outcomes.append(thought[:100])

    # Build structured reasoning
    return PatchProposalReasoning(
        prior=PriorUnderstanding(
            bug_description=bug_description,
            current_behavior="Identified from exploration",
            expected_behavior="Described in task",
            confidence=0.7,  # Default moderate confidence
        ),
        hypothesis=CausalHypothesis(
            root_cause=root_cause[:200],
            causal_chain=thoughts[:3],
            rationale=all_thoughts[:500],
        ),
        evidence=SupportingEvidence(
            code_references=code_references,
            observations=thoughts[:5],
            supporting_logic=all_thoughts[:500],
        ),
        solution=ProposedSolution(
            change_description=change_description[:300],
            addresses_cause="Based on iterative code exploration",
            minimality="Minimal change principle followed",
        ),
        prediction=OutcomePrediction(
            test_outcomes=test_outcomes if test_outcomes else ["Tests should pass after fix"],
            effects=["Issue resolved", "No regressions expected"],
            verification_plan="Run test suite to verify fix",
        ),
    )


def extract_reasoning_from_llm_response(response: str) -> Optional[PatchProposalReasoning]:
    """
    Extract reasoning from direct LLM JSON response.

    For cases where LLM is asked to provide structured reasoning directly
    (like in the TypeScript quality-gated agent).

    Args:
        response: JSON string with reasoning structure

    Returns:
        PatchProposalReasoning or None if parsing fails
    """
    import json

    try:
        # Handle markdown code blocks
        if response.strip().startswith("```"):
            lines = response.strip().split("\n")
            start_idx = next(i for i, l in enumerate(lines) if l.startswith("```json") or l == "```") + 1
            end_idx = next((i for i, l in enumerate(lines[start_idx:], start_idx) if l.startswith("```")), None)
            json_text = "\n".join(lines[start_idx:end_idx])
        else:
            json_text = response

        data = json.loads(json_text)

        # Convert dict to structured reasoning
        return PatchProposalReasoning(
            prior=PriorUnderstanding(**data["prior"]),
            hypothesis=CausalHypothesis(**data["hypothesis"]),
            evidence=SupportingEvidence(**data["evidence"]),
            solution=ProposedSolution(**data["solution"]),
            prediction=OutcomePrediction(**data["prediction"]),
        )
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"Failed to parse reasoning JSON: {e}")
        return None


def format_reasoning_for_display(reasoning: PatchProposalReasoning) -> str:
    """Format reasoning structure for human reading."""
    lines = []

    lines.append("=" * 80)
    lines.append("PATCH PROPOSAL REASONING")
    lines.append("=" * 80)

    lines.append("\n1. PRIOR UNDERSTANDING")
    lines.append(f"   Bug: {reasoning.prior.bug_description[:100]}...")
    lines.append(f"   Current: {reasoning.prior.current_behavior[:80]}...")
    lines.append(f"   Expected: {reasoning.prior.expected_behavior[:80]}...")
    lines.append(f"   Confidence: {reasoning.prior.confidence:.2f}")

    lines.append("\n2. HYPOTHESIS")
    lines.append(f"   Root Cause: {reasoning.hypothesis.root_cause[:100]}...")
    lines.append(f"   Causal Chain: {len(reasoning.hypothesis.causal_chain)} steps")
    for i, step in enumerate(reasoning.hypothesis.causal_chain[:3], 1):
        lines.append(f"     {i}. {step[:60]}...")

    lines.append("\n3. EVIDENCE")
    lines.append(f"   Code References: {len(reasoning.evidence.code_references)}")
    for ref in reasoning.evidence.code_references[:3]:
        lines.append(f"     - {ref['file'][:40]}...")
    lines.append(f"   Observations: {len(reasoning.evidence.observations)}")

    lines.append("\n4. SOLUTION")
    lines.append(f"   Change: {reasoning.solution.change_description[:100]}...")
    lines.append(f"   Addresses Cause: {reasoning.solution.addresses_cause[:80]}...")

    lines.append("\n5. PREDICTION")
    lines.append(f"   Test Outcomes: {len(reasoning.prediction.test_outcomes)}")
    for outcome in reasoning.prediction.test_outcomes[:3]:
        lines.append(f"     - {outcome[:60]}...")

    lines.append("\n" + "=" * 80)

    return "\n".join(lines)
