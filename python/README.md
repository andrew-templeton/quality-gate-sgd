# Quality-Gated Reasoning: Python Scientific Module

This module provides **scientifically rigorous** validation of quality-gated reasoning for research and publication.

## Purpose

While the TypeScript package (`npm install quality-sgd`) provides production-ready quality measurement, this Python module enables:

1. **Causal Inference**: A/B testing with minimal confounds
2. **Benchmark Comparisons**: Direct comparison to SWE-bench leaderboard
3. **Publication**: Peer-reviewed paper with reproducible experiments

## Architecture

### Dual-Track Strategy

```
TypeScript (NPM)          →  Industrial Use
  ├─ Full harness              (Production quality measurement)
  ├─ Docker integration        (Real project evaluation)
  └─ Exploratory analysis      (Solo entrepreneurship)

Python (Research)         →  Scientific Validation
  ├─ Mini-SWE-agent            (Standard benchmark harness)
  ├─ Quality gate hook         (Minimal instrumentation)
  └─ Statistical analysis      (Publishable results)
```

## Modules

### `quality_gate/`
Port of TypeScript quality evaluator to Python.

- **evaluator.py**: 5-dimensional reasoning scorer
- **reasoning.py**: Reasoning extraction from trajectories
- **feedback.py**: Actionable feedback generation

### `mini_swe_integration/`
Integration with mini-swe-agent for SWE-bench experiments.

- **quality_gated_agent.py**: Modified mini-swe-agent with quality gate
- **hooks.py**: Submission interception logic

### `experiments/`
Experiment runners for baseline vs treatment.

- **run_baseline.py**: Control group (standard mini-swe-agent)
- **run_treatment.py**: Treatment group (+ quality gate)
- **analyze.py**: Statistical comparison (t-test, correlation)

## Installation

```bash
cd python
pip install -e .
```

## Usage

### Quick Start

```python
from quality_gate import evaluate_patch_quality, extract_reasoning
from mini_swe_integration import QualityGatedAgent

# Run single task with quality gate
agent = QualityGatedAgent(
    model="gpt-5.2",
    quality_threshold=70,
    max_quality_iterations=3
)

result = agent.run(task)
print(f"Success: {result.success}, Quality: {result.quality_score}")
```

### Run Experiments

```bash
# Baseline (no quality gate)
python -m experiments.run_baseline \
    --model gpt-5.2 \
    --tasks 50 \
    --output results/baseline.jsonl

# Treatment (with quality gate)
python -m experiments.run_treatment \
    --model gpt-5.2 \
    --tasks 50 \
    --quality-threshold 70 \
    --output results/treatment.jsonl

# Analyze
python -m experiments.analyze \
    results/baseline.jsonl \
    results/treatment.jsonl \
    --output paper/results.md
```

## Scientific Methodology

### Minimal Instrumentation

The quality gate is added as a **single hook** in mini-swe-agent:

```python
def has_finished(self, output):
    if output.startswith("COMPLETE_TASK"):
        # ONLY ADDITION: Quality gate evaluation
        if QUALITY_GATE_ENABLED:
            reasoning = extract_reasoning(self.messages)
            quality = evaluate_quality(reasoning)

            if quality.overall < THRESHOLD:
                feedback = generate_feedback(quality)
                raise FormatError(f"Quality gate rejected: {feedback}")

        # Everything else unchanged
        raise Submitted(output)
```

This preserves:
- ✅ Bash tools
- ✅ Iteration patterns
- ✅ System prompts
- ✅ Model behavior

**Result**: Any difference in pass rate is attributable to the quality gate.

### Baselines

Direct comparison to published results:

| Harness | Model | Pass Rate | Source |
|---------|-------|-----------|--------|
| Mini-SWE-agent | GPT-4o | 74% | [GitHub](https://github.com/SWE-agent/mini-swe-agent) |
| SWE-agent | GPT-5.2 | 75.4% | [Leaderboard](https://www.swebench.com/) |
| Custom | Claude Opus 4.5 | 80.9% | [Anthropic](https://www.anthropic.com/news/claude-opus-4-5) |

### Hypothesis

**H1**: Quality-gated reasoning improves pass rate by ≥5pp
- Control: Mini-SWE-agent (74%)
- Treatment: Mini-SWE-agent + Quality Gate (79%+?)
- Test: t-test, p < 0.05

**H2**: Quality dimensions predict success
- Correlation: quality_score ~ patch_success
- Test: Pearson ρ > 0.3, p < 0.05

## Development

### Port TypeScript Quality Gate

```bash
# 1. Reference TypeScript implementation
cat ../src/experiments/swebench/quality-gate.ts

# 2. Port to Python
python -m quality_gate.evaluator --test

# 3. Validate equivalence
npm test -- quality-gate.test.ts
python -m pytest tests/test_quality_gate.py
```

### Fork Mini-SWE-agent

```bash
cd /tmp
git clone https://github.com/SWE-agent/mini-swe-agent.git
cd mini-swe-agent

# Create fork for instrumentation
git checkout -b quality-gate-integration

# Copy modified agent
cp ../quality-sgd/python/mini_swe_integration/quality_gated_agent.py \
   src/minisweagent/agents/quality_gated.py
```

## Timeline

- **Day 1**: Port quality gate to Python, unit tests
- **Day 2**: Fork mini-swe-agent, add hooks, validate on 5 tasks
- **Day 3-4**: Run pilot (20 baseline + 20 treatment)
- **Day 5-6**: Powered experiment (50 + 50)
- **Day 7**: Statistical analysis, draft paper

## Publications

Target venues:
- **NeurIPS** (AI/ML conference)
- **ICSE** (Software Engineering conference)
- **arXiv** (preprint)

Title: "Quality-Gated Reasoning: Bayesian Evaluation Improves LLM Software Engineering Performance"

## License

Same as parent project (see root LICENSE).

## References

- [Mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent)
- [SWE-bench Leaderboard](https://www.swebench.com/)
- [TypeScript Implementation](../src/experiments/swebench/quality-gate.ts)
