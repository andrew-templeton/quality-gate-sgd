#!/usr/bin/env python3
# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
SWE-agent Quality Gate Experiment - Clean Implementation

Control: SWE-agent + gpt-4o (zero-shot)
Treatment: SWE-agent + gpt-4o + Quality Gate feedback

Same model, same scaffold - quality gate is the only variable.
"""

import sys
import os
import json
import time
import asyncio
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any

# Set up paths before imports
sys.path.insert(0, '/Users/andrewtempleton/quality-sgd/python')
sys.path.insert(0, '/tmp/SWE-agent')

# Set API key from file
if os.path.exists(os.path.expanduser('~/.openai')):
    with open(os.path.expanduser('~/.openai')) as f:
        os.environ['OPENAI_API_KEY'] = f.read().strip()

from sweagent.agent.agents import DefaultAgent, DefaultAgentConfig
from sweagent.agent.models import GenericAPIModelConfig
from sweagent.environment.swe_env import SWEEnv, EnvironmentConfig
from sweagent.types import AgentRunResult
import yaml

from quality_gate_hook import QualityGateHook


# =============================================================================
# Hard Task Selection
# =============================================================================

HARD_TASKS = [
    "django__django-11019",
    "scikit-learn__scikit-learn-10297",
    "matplotlib__matplotlib-24265",
    "pallets__flask-5063",
    "matplotlib__matplotlib-18869",
    "sympy__sympy-14308",
    "django__django-16820",
    "sphinx-doc__sphinx-7686",
    "sympy__sympy-18199",
    "sympy__sympy-20322",
    "scikit-learn__scikit-learn-25638",
    "sympy__sympy-20049",
    "sympy__sympy-23191",
    "matplotlib__matplotlib-25442",
    "django__django-13265",
]


def load_task_metadata() -> Dict[str, Dict]:
    """Load SWE-bench task metadata."""
    task_file = '/Users/andrewtempleton/quality-sgd/data/swe-bench/lite.jsonl'
    tasks = {}
    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            tasks[task['instance_id']] = task
    return tasks


# =============================================================================
# Result Tracking
# =============================================================================

@dataclass
class TaskResult:
    """Result for a single task run."""
    instance_id: str
    condition: str
    model: str

    # Outcome
    resolved: bool = False
    patch: str = ""
    error: Optional[str] = None

    # Metrics
    steps: int = 0
    duration_seconds: float = 0.0
    cost_usd: float = 0.0

    # Quality gate (treatment only)
    quality_scores: List[Dict] = field(default_factory=list)
    refinement_attempts: int = 0
    final_quality: float = 0.0

    def to_dict(self) -> Dict:
        return asdict(self)


# =============================================================================
# Experiment Runner
# =============================================================================

async def run_single_task(
    task_id: str,
    task_meta: Dict,
    model_name: str,
    condition: str,
    output_dir: Path,
) -> TaskResult:
    """
    Run a single SWE-bench task.

    Args:
        task_id: Instance ID
        task_meta: Task metadata from SWE-bench
        model_name: Model to use (e.g., 'gpt-4o')
        condition: 'baseline' or 'treatment'
        output_dir: Where to save results

    Returns:
        TaskResult with outcome
    """
    result = TaskResult(
        instance_id=task_id,
        condition=condition,
        model=model_name,
    )

    print(f"\n{'='*70}")
    print(f"Task: {task_id}")
    print(f"Condition: {condition.upper()}")
    print(f"Model: {model_name}")
    print(f"{'='*70}")

    start_time = time.time()

    try:
        # Load base config
        config_path = Path('/tmp/SWE-agent/config/default.yaml')
        with open(config_path) as f:
            config_dict = yaml.safe_load(f)

        # Configure model
        config_dict['agent']['model'] = {
            'name': model_name,
            'per_instance_cost_limit': 5.0,
            'temperature': 0.0,
        }

        # Create agent config
        agent_config = DefaultAgentConfig(**config_dict['agent'])

        # Create environment config for SWE-bench task
        env_config = EnvironmentConfig(
            repo={
                'type': 'swe_bench_instance',
                'instance_id': task_id,
            },
            deployment={
                'type': 'docker',
                'docker_args': ['--memory=10g'],
            },
        )

        # Create environment
        env = SWEEnv(env_config)

        # Create agent
        agent = DefaultAgent.from_config(agent_config)

        # Add quality gate hook for treatment condition
        quality_hook = None
        if condition == 'treatment':
            quality_hook = QualityGateHook(
                min_quality=0.70,
                max_refinement_attempts=2,
                problem_statement=task_meta.get('problem_statement', ''),
            )
            agent.add_hook(quality_hook)

        # Setup agent with environment
        await agent.setup(env=env)

        # Run agent
        agent_result: AgentRunResult = await agent.run(
            problem_statement=task_meta.get('problem_statement', ''),
        )

        # Extract results
        result.resolved = agent_result.info.get('resolved', False)
        result.patch = agent_result.info.get('patch', '')
        result.steps = len(agent_result.trajectory)
        result.cost_usd = agent_result.info.get('total_cost', 0.0)

        # Get quality gate results if treatment
        if quality_hook:
            hook_results = quality_hook.get_results()
            result.quality_scores = hook_results.get('quality_scores', [])
            result.refinement_attempts = hook_results.get('refinement_count', 0)
            if result.quality_scores:
                result.final_quality = result.quality_scores[-1].get('overall_quality', 0)

        print(f"\n✓ Task completed")
        print(f"  Resolved: {result.resolved}")
        print(f"  Steps: {result.steps}")
        print(f"  Cost: ${result.cost_usd:.4f}")

    except Exception as e:
        result.error = str(e)
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        result.duration_seconds = time.time() - start_time

    return result


async def run_experiment(
    task_ids: List[str],
    model_name: str = "gpt-4o",
    conditions: List[str] = ['baseline', 'treatment'],
    output_dir: str = "python/experiments/results",
) -> Dict:
    """
    Run the full experiment.

    Args:
        task_ids: SWE-bench instance IDs to run
        model_name: Model to use
        conditions: Conditions to run
        output_dir: Output directory

    Returns:
        Summary statistics
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Load task metadata
    task_metadata = load_task_metadata()

    print(f"\n{'#'*70}")
    print("SWE-AGENT QUALITY GATE EXPERIMENT")
    print(f"{'#'*70}")
    print(f"Tasks: {len(task_ids)}")
    print(f"Conditions: {conditions}")
    print(f"Model: {model_name}")
    print(f"{'#'*70}\n")

    results: List[TaskResult] = []

    for condition in conditions:
        print(f"\n{'='*70}")
        print(f"CONDITION: {condition.upper()}")
        print(f"{'='*70}")

        for i, task_id in enumerate(task_ids):
            print(f"\n[{i+1}/{len(task_ids)}] Running {task_id}...")

            if task_id not in task_metadata:
                print(f"  ⚠ Task {task_id} not found in metadata, skipping")
                continue

            result = await run_single_task(
                task_id=task_id,
                task_meta=task_metadata[task_id],
                model_name=model_name,
                condition=condition,
                output_dir=output_path,
            )
            results.append(result)

            # Save incremental results
            _save_results(results, output_path)

    # Compute summary
    summary = _compute_summary(results, model_name)

    # Save final results
    _save_results(results, output_path, summary)

    return summary


def _compute_summary(results: List[TaskResult], model: str) -> Dict:
    """Compute experiment summary statistics."""
    baseline = [r for r in results if r.condition == 'baseline']
    treatment = [r for r in results if r.condition == 'treatment']

    def stats(rs: List[TaskResult], name: str) -> Dict:
        if not rs:
            return {'n': 0}

        resolved = sum(1 for r in rs if r.resolved)
        return {
            'n': len(rs),
            'resolved': resolved,
            'pass_rate': resolved / len(rs),
            'avg_steps': sum(r.steps for r in rs) / len(rs),
            'avg_duration': sum(r.duration_seconds for r in rs) / len(rs),
            'avg_cost': sum(r.cost_usd for r in rs) / len(rs),
            'errors': sum(1 for r in rs if r.error),
        }

    baseline_stats = stats(baseline, 'baseline')
    treatment_stats = stats(treatment, 'treatment')

    # Treatment-specific metrics
    if treatment:
        treatment_stats['avg_refinements'] = sum(r.refinement_attempts for r in treatment) / len(treatment)
        treatment_stats['avg_final_quality'] = sum(r.final_quality for r in treatment) / len(treatment)

    # Compute improvement
    baseline_rate = baseline_stats.get('pass_rate', 0)
    treatment_rate = treatment_stats.get('pass_rate', 0)
    improvement = treatment_rate - baseline_rate

    return {
        'model': model,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'baseline': baseline_stats,
        'treatment': treatment_stats,
        'improvement_pp': improvement * 100,  # percentage points
    }


def _save_results(results: List[TaskResult], output_dir: Path, summary: Dict = None):
    """Save results to disk."""
    timestamp = time.strftime('%Y%m%d_%H%M%S')

    # Save detailed results
    results_file = output_dir / f"results_{timestamp}.jsonl"
    with open(results_file, 'w') as f:
        for r in results:
            f.write(json.dumps(r.to_dict()) + '\n')

    # Save summary if provided
    if summary:
        summary_file = output_dir / f"summary_{timestamp}.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)

        print(f"\n{'='*70}")
        print("EXPERIMENT COMPLETE")
        print(f"{'='*70}")
        print(f"Results: {results_file}")
        print(f"Summary: {summary_file}")
        print()
        print(json.dumps(summary, indent=2))


# =============================================================================
# Main
# =============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(description='SWE-agent Quality Gate Experiment')
    parser.add_argument('--model', default='gpt-4o', help='Model to use')
    parser.add_argument('--tasks', type=int, default=15, help='Number of tasks (from hard list)')
    parser.add_argument('--conditions', nargs='+', default=['baseline', 'treatment'])
    parser.add_argument('--output', default='python/experiments/results')
    parser.add_argument('--dry-run', action='store_true', help='Show what would run')
    args = parser.parse_args()

    task_ids = HARD_TASKS[:args.tasks]

    print(f"Selected {len(task_ids)} hard tasks:")
    for tid in task_ids:
        print(f"  - {tid}")

    if args.dry_run:
        print(f"\n[DRY RUN]")
        print(f"  Model: {args.model}")
        print(f"  Conditions: {args.conditions}")
        print(f"  Tasks: {len(task_ids)}")
        return 0

    # Run experiment
    summary = asyncio.run(run_experiment(
        task_ids=task_ids,
        model_name=args.model,
        conditions=args.conditions,
        output_dir=args.output,
    ))

    # Print final summary
    print(f"\n{'#'*70}")
    print("FINAL SUMMARY")
    print(f"{'#'*70}")

    baseline_rate = summary['baseline'].get('pass_rate', 0) * 100
    treatment_rate = summary['treatment'].get('pass_rate', 0) * 100
    improvement = summary.get('improvement_pp', 0)

    print(f"Baseline pass rate:  {baseline_rate:.1f}%")
    print(f"Treatment pass rate: {treatment_rate:.1f}%")
    print(f"Improvement:         {improvement:+.1f} percentage points")

    if improvement > 0:
        print(f"\n✓ Quality gate IMPROVED performance")
    elif improvement < 0:
        print(f"\n✗ Quality gate DECREASED performance")
    else:
        print(f"\n= No difference observed")

    return 0


if __name__ == "__main__":
    sys.exit(main())
