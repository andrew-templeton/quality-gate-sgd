# Pivot to Scientific Approach: Mini-SWE-agent + Quality Gate

## What Changed

### Previous Approach (Phase 1) ❌
- Custom code extraction from Docker
- Static file context provision
- One-shot reasoning → patch
- Not comparable to leaderboard baselines
- Confounded multiple variables

### New Approach (Scientifically Correct) ✅
- Use proven mini-swe-agent harness
- Preserve bash tools and iteration pattern
- Add ONLY quality gate hook before submission
- Directly comparable to published 74% baseline
- Isolates single treatment variable

## Why This Matters

**Publishability**: Can claim "X% improvement over mini-swe-agent baseline" with direct comparison to [74% published result](https://github.com/SWE-agent/mini-swe-agent).

**Scientific Validity**: Minimal instrumentation principle - only quality gate differs between conditions.

**Reproducibility**: Uses open-source harness with well-documented methodology.

## Current Leaderboard (January 2026)

1. **Claude Opus 4.5**: 80.9% (custom harness, +10pp vs standard)
2. **Gemini 3 Pro**: 77.4% (Live-SWE-agent)
3. **GPT-5.2**: 75.4% (standard harness)
4. **Mini-SWE-agent**: 74% (bash-only, 100 lines)

**Target**: Beat mini-swe-agent's 74% with quality gate, approaching GPT-5.2's 75.4%

## Implementation Status

### ✅ Completed
- Quality gate evaluator (5 Bayesian dimensions)
- Feedback generation
- Statistical analysis tools
- Mini-swe-agent cloned and examined
- Integration plan documented

### 🔄 In Progress
- Python port of quality gate
- Hook into mini-swe-agent submission

### ⏳ Next Steps
1. **Day 1**: Port quality gate to Python, test
2. **Day 2**: Hook into mini-swe-agent, validate on 5 tasks
3. **Day 3-4**: Pilot (20 baseline + 20 treatment)
4. **Day 5-6**: Powered experiment (50 + 50)
5. **Day 7**: Analysis, writeup

## Models to Use

- **Baseline/Treatment**: GPT-5.2 (direct comparison to 75.4% published)
- **Alternative**: Claude Opus 4.5 (if higher performance desired)
- **Budget**: GPT-4o-mini (60x cheaper for iteration)

## Success Criteria

**Minimum Publishable:**
- Δ ≥ 5pp (74% → 79%)
- p < 0.05
- Quality dimensions correlate with success

**Strong Result:**
- Δ ≥ 10pp (74% → 84%)
- p < 0.01
- Approaches Opus 4.5 (80.9%)

**Breakthrough:**
- Δ ≥ 15pp (74% → 89%)
- Exceeds all published results
- Generalizes across models

## Files Created

- `/docs/METHODOLOGY_CORRECTION.md` - Full scientific rationale
- `/src/experiments/mini-swe/quality-gated-mini-agent.ts` - TypeScript wrapper (design)
- `/src/experiments/mini-swe/INTEGRATION_PLAN.md` - Python implementation plan

## Key Insight

You were absolutely right: **"Use the exact harness as leaderboard entries and instrument ONLY the quality gate."**

This is the difference between:
- ❌ "We built a different architecture that might work"
- ✅ "We improved the standard approach by X%"

The former isn't publishable. The latter is a contribution.

## Next Action

Choose path forward:

1. **Python Implementation** (recommended): Port quality gate to Python, fork mini-swe-agent, run experiments
2. **TypeScript Bridge**: Call TypeScript evaluator from Python subprocess
3. **Hybrid**: Use current code extraction for other experiments, Python quality gate for publication

**Recommendation**: Option 1 (Python) - cleanest for publication, no cross-language complexity.
