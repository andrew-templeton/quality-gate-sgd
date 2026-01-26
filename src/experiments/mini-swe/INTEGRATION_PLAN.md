# Mini-SWE-agent Quality Gate Integration Plan

## Goal

Add quality gate to mini-swe-agent with MINIMAL modification (scientifically correct).

## Approach: Python Hook

Since mini-swe-agent is Python and our quality gate is TypeScript, we need a bridge.

### Option A: Python Implementation (Recommended)

**Implement quality gate directly in Python:**

1. Port 5-dimensional evaluator to Python
2. Add hook to `minisweagent/agents/default.py`
3. Run as-is with Python

**Pros:**
- No TypeScript-Python bridge needed
- Can use existing mini-swe-agent infrastructure
- Direct comparison to published results

**Cons:**
- Need to port TypeScript evaluation logic to Python

### Option B: TypeScript via Subprocess

**Call TypeScript evaluator from Python:**

1. Python mini-swe-agent runs normally
2. Before accepting submission, call TypeScript CLI
3. TypeScript evaluates quality, returns accept/reject
4. Python continues based on result

**Pros:**
- Reuse existing TypeScript quality gate
- No code duplication

**Cons:**
- Adds subprocess overhead
- More complex setup

## Recommended Implementation (Option A)

### Step 1: Port Quality Gate to Python

Create `minisweagent/quality_gate.py`:

```python
from dataclasses import dataclass
from typing import List, Dict

@dataclass
class PatchProposalReasoning:
    prior: Dict
    hypothesis: Dict
    evidence: Dict
    solution: Dict
    prediction: Dict

@dataclass
class PatchQualityMetrics:
    prior_clarity: float
    hypothesis_coherence: float
    evidence_alignment: float
    solution_consistency: float
    outcome_observability: float
    overall_quality: float

def evaluate_patch_quality(reasoning: PatchProposalReasoning) -> PatchQualityMetrics:
    """Port of TypeScript evaluatePatchQuality() function."""

    # Prior Clarity (0-100)
    prior_clarity = 0.0
    if reasoning.prior:
        prior_clarity += 25 if len(reasoning.prior.get("bug_description", "")) > 50 else 10
        prior_clarity += 25 if len(reasoning.prior.get("current_behavior", "")) > 30 else 10
        prior_clarity += 25 if len(reasoning.prior.get("expected_behavior", "")) > 30 else 10
        prior_clarity += 25 if reasoning.prior.get("confidence", 0) > 0.7 else 10

    # Hypothesis Coherence (0-100)
    hypothesis_coherence = 0.0
    if reasoning.hypothesis:
        hypothesis_coherence += 30 if len(reasoning.hypothesis.get("root_cause", "")) > 50 else 10
        hypothesis_coherence += 40 if len(reasoning.hypothesis.get("causal_chain", [])) >= 2 else 15
        hypothesis_coherence += 30 if len(reasoning.hypothesis.get("rationale", "")) > 100 else 10

    # Evidence Alignment (0-100)
    evidence_alignment = 0.0
    if reasoning.evidence:
        code_refs = reasoning.evidence.get("code_references", [])
        evidence_alignment += 40 if len(code_refs) >= 2 else 15
        evidence_alignment += 30 if len(reasoning.evidence.get("observations", [])) >= 2 else 10
        evidence_alignment += 30 if len(reasoning.evidence.get("supporting_logic", "")) > 100 else 10

    # Solution Consistency (0-100)
    solution_consistency = 0.0
    if reasoning.solution:
        solution_consistency += 35 if len(reasoning.solution.get("change_description", "")) > 50 else 10
        solution_consistency += 35 if len(reasoning.solution.get("addresses_cause", "")) > 50 else 10
        solution_consistency += 30 if len(reasoning.solution.get("minimality", "")) > 30 else 10

    # Outcome Observability (0-100)
    outcome_observability = 0.0
    if reasoning.prediction:
        outcome_observability += 35 if len(reasoning.prediction.get("test_outcomes", [])) >= 1 else 10
        outcome_observability += 35 if len(reasoning.prediction.get("effects", [])) >= 1 else 10
        outcome_observability += 30 if len(reasoning.prediction.get("verification_plan", "")) > 30 else 10

    # Weighted overall quality
    weights = {
        "prior_clarity": 0.20,
        "hypothesis_coherence": 0.25,
        "evidence_alignment": 0.25,
        "solution_consistency": 0.20,
        "outcome_observability": 0.10,
    }

    overall_quality = (
        prior_clarity * weights["prior_clarity"] +
        hypothesis_coherence * weights["hypothesis_coherence"] +
        evidence_alignment * weights["evidence_alignment"] +
        solution_consistency * weights["solution_consistency"] +
        outcome_observability * weights["outcome_observability"]
    )

    return PatchQualityMetrics(
        prior_clarity=prior_clarity,
        hypothesis_coherence=hypothesis_coherence,
        evidence_alignment=evidence_alignment,
        solution_consistency=solution_consistency,
        outcome_observability=outcome_observability,
        overall_quality=overall_quality,
    )

def extract_reasoning_from_trajectory(messages: List[Dict]) -> PatchProposalReasoning:
    """Extract reasoning from mini-swe-agent trajectory."""
    thoughts = []
    actions = []

    for msg in messages:
        if msg["role"] == "assistant":
            content = msg["content"]

            # Extract THOUGHT section
            import re
            thought_match = re.search(r"THOUGHT:?\s*(.+?)(?=```|$)", content, re.IGNORECASE | re.DOTALL)
            if thought_match:
                thoughts.append(thought_match.group(1).strip())

            # Extract action
            action_match = re.search(r"```bash\s*\n(.*?)\n```", content, re.DOTALL)
            if action_match:
                actions.append(action_match.group(1).strip())

    all_thoughts = "\n\n".join(thoughts)

    # Reconstruct reasoning structure
    return PatchProposalReasoning(
        prior={
            "bug_description": thoughts[0][:200] if thoughts else "",
            "current_behavior": "Extracted from exploration",
            "expected_behavior": "Described in task",
            "confidence": 0.7,
        },
        hypothesis={
            "root_cause": next((t for t in thoughts if "issue" in t.lower() or "problem" in t.lower()), "Root cause identified"),
            "causal_chain": thoughts[:3],
            "rationale": all_thoughts[:500],
        },
        evidence={
            "code_references": [{"file": a, "lines": f"action_{i}", "observation": thoughts[i] if i < len(thoughts) else ""} for i, a in enumerate(actions[:5])],
            "observations": thoughts,
            "supporting_logic": all_thoughts,
        },
        solution={
            "change_description": ". ".join(thoughts[-3:]),
            "addresses_cause": "Based on iterative refinement",
            "minimality": "Minimal change principle followed",
        },
        prediction={
            "test_outcomes": ["Tests should pass after fix"],
            "effects": ["Issue resolved", "No regressions"],
            "verification_plan": "Run test suite",
        },
    )
```

### Step 2: Hook into Mini-SWE-agent

Modify `minisweagent/agents/default.py`:

```python
# At top of file
import os
from minisweagent.quality_gate import extract_reasoning_from_trajectory, evaluate_patch_quality

# In DefaultAgent class
class DefaultAgent:
    def __init__(self, ...):
        # ... existing code ...
        self.quality_gate_enabled = os.getenv("MSWEA_QUALITY_GATE", "false").lower() == "true"
        self.quality_threshold = float(os.getenv("MSWEA_QUALITY_THRESHOLD", "70"))
        self.quality_iteration = 0
        self.max_quality_iterations = int(os.getenv("MSWEA_MAX_QUALITY_ITERATIONS", "3"))

    def has_finished(self, output: dict[str, str]):
        """Raises Submitted exception with final output if the agent has finished its task."""
        lines = output.get("output", "").lstrip().splitlines(keepends=True)

        if lines and lines[0].strip() in ["MINI_SWE_AGENT_FINAL_OUTPUT", "COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT"]:
            # QUALITY GATE HOOK
            if self.quality_gate_enabled:
                reasoning = extract_reasoning_from_trajectory(self.messages)
                quality = evaluate_patch_quality(reasoning)

                print(f"[QualityGate] Overall: {quality.overall_quality:.1f}")
                print(f"[QualityGate] Prior: {quality.prior_clarity:.1f}")
                print(f"[QualityGate] Hypothesis: {quality.hypothesis_coherence:.1f}")
                print(f"[QualityGate] Evidence: {quality.evidence_alignment:.1f}")
                print(f"[QualityGate] Solution: {quality.solution_consistency:.1f}")
                print(f"[QualityGate] Outcome: {quality.outcome_observability:.1f}")

                if quality.overall_quality < self.quality_threshold:
                    self.quality_iteration += 1

                    if self.quality_iteration < self.max_quality_iterations:
                        # Reject and provide feedback
                        feedback = self._generate_quality_feedback(quality)
                        raise FormatError(
                            f"QUALITY GATE REJECTED (iteration {self.quality_iteration}/{self.max_quality_iterations}):\n"
                            f"{feedback}\n\n"
                            f"Please revise your approach with more detailed reasoning."
                        )
                    else:
                        print(f"[QualityGate] Max iterations reached, accepting submission")

            raise Submitted("".join(lines[1:]))

    def _generate_quality_feedback(self, quality):
        """Generate actionable feedback for failed quality check."""
        feedback_parts = []

        if quality.prior_clarity < 60:
            feedback_parts.append("- Clarify the bug description, current behavior, and expected behavior")
        if quality.hypothesis_coherence < 60:
            feedback_parts.append("- Strengthen your hypothesis with clearer root cause and causal chain")
        if quality.evidence_alignment < 60:
            feedback_parts.append("- Provide more code references and observations supporting your hypothesis")
        if quality.solution_consistency < 60:
            feedback_parts.append("- Explain more clearly how your solution addresses the root cause")
        if quality.outcome_observability < 60:
            feedback_parts.append("- Specify expected test outcomes and verification steps")

        return "\n".join(feedback_parts) if feedback_parts else "Improve overall reasoning quality"
```

### Step 3: Run Experiments

```bash
# Baseline (no quality gate)
python -m minisweagent.run.extra.swebench \
  --model gpt-5.2 \
  --data_path swe-bench-lite.jsonl \
  --output baseline_results.jsonl

# Treatment (with quality gate)
MSWEA_QUALITY_GATE=true \
MSWEA_QUALITY_THRESHOLD=70 \
MSWEA_MAX_QUALITY_ITERATIONS=3 \
python -m minisweagent.run.extra.swebench \
  --model gpt-5.2 \
  --data_path swe-bench-lite.jsonl \
  --output treatment_results.jsonl

# Compare
python scripts/compare_results.py baseline_results.jsonl treatment_results.jsonl
```

## Timeline

- **Day 1:** Port quality gate to Python, test unit tests
- **Day 2:** Hook into mini-swe-agent, validate on 5 tasks
- **Day 3-4:** Run pilot (20 tasks baseline + 20 treatment)
- **Day 5-6:** Run powered experiment (50 baseline + 50 treatment)
- **Day 7:** Analysis and writeup

## Next Steps

1. Create fork of mini-swe-agent
2. Implement `minisweagent/quality_gate.py`
3. Modify `minisweagent/agents/default.py`
4. Test on single task
5. Run experiments
