#!/usr/bin/env python3
# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
SWE-agent Quality Gate Experiment

Clean comparison:
  - Control: SWE-agent + Model (zero-shot)
  - Treatment: SWE-agent + Model + Quality Gate feedback loop

Same model, same scaffold - quality gate is the only variable.
"""

import sys
import os
import json
import time
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional
import argparse

# Add paths
sys.path.insert(0, '/Users/andrewtempleton/quality-sgd/python')
sys.path.insert(0, '/tmp/SWE-agent')

from sweagent.run.run import main as sweagent_main
from sweagent.agent.agents import DefaultAgentConfig, get_agent_from_config
from sweagent.agent.hooks.abstract import AbstractAgentHook
from quality_gate_hook import QualityGateHook


# =============================================================================
# Hard Task Selection
# =============================================================================

def get_hard_tasks(n: int = 15) -> List[str]:
    """
    Get the n hardest tasks from SWE-bench lite.

    Selection criteria: Longest patches (proxy for complexity).
    """
    task_file = '/Users/andrewtempleton/quality-sgd/data/swe-bench/lite.jsonl'

    tasks = []
    with open(task_file, 'r') as f:
        for line in f:
            task = json.loads(line)
            patch = task.get('patch', '')
            tasks.append({
                'instance_id': task['instance_id'],
                'repo': task.get('repo', ''),
                'patch_length': len(patch),
                'problem_statement': task.get('problem_statement', ''),
            })

    # Sort by patch length (hardest = longest)
    tasks.sort(key=lambda x: x['patch_length'], reverse=True)

    return [t['instance_id'] for t in tasks[:n]]


# =============================================================================
# Experiment Configuration
# =============================================================================

@dataclass
class ExperimentConfig:
    """Configuration for the experiment."""
    # Model configuration
    model: str = "gpt-4o"  # Will be overridden by user

    # Quality gate settings (treatment only)
    quality_threshold: float = 0.70
    max_refinement_attempts: int = 2

    # SWE-agent settings
    max_steps: int = 30
    timeout: int = 900  # 15 minutes per task

    # Experiment settings
    output_dir: str = "python/experiments/results"

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class TaskResult:
    """Result for a single task."""
    instance_id: str
    condition: str  # 'baseline' or 'treatment'
    model: str

    # Outcome
    success: bool = False
    patch: str = ""
    error: Optional[str] = None

    # Metrics
    steps: int = 0
    duration: float = 0.0
    cost: float = 0.0

    # Quality gate (treatment only)
    quality_scores: List[Dict] = field(default_factory=list)
    refinement_count: int = 0
    final_quality: float = 0.0

    def to_dict(self) -> Dict:
        return asdict(self)


# =============================================================================
# Experiment Runner
# =============================================================================

class ExperimentRunner:
    """Runs the clean SWE-agent experiment."""

    def __init__(self, config: ExperimentConfig):
        self.config = config
        self.results: List[TaskResult] = []

        # Ensure output directory exists
        Path(config.output_dir).mkdir(parents=True, exist_ok=True)

    def run_task(
        self,
        task_id: str,
        condition: str,
        problem_statement: str = "",
    ) -> TaskResult:
        """
        Run a single task in baseline or treatment condition.

        Args:
            task_id: SWE-bench instance ID
            condition: 'baseline' or 'treatment'
            problem_statement: The problem description

        Returns:
            TaskResult with outcome and metrics
        """
        result = TaskResult(
            instance_id=task_id,
            condition=condition,
            model=self.config.model,
        )

        print(f"\n{'='*70}")
        print(f"RUNNING: {task_id}")
        print(f"Condition: {condition.upper()}")
        print(f"Model: {self.config.model}")
        print(f"{'='*70}\n")

        start_time = time.time()

        try:
            # Build SWE-agent command
            cmd_args = [
                "--config", "/tmp/SWE-agent/config/default.yaml",
                "--agent.model.name", self.config.model,
                "--problem_statement.id", task_id,
                "--problem_statement.type", "swe_bench",
            ]

            # Add quality gate hook for treatment
            hooks = []
            if condition == 'treatment':
                hook = QualityGateHook(
                    min_quality=self.config.quality_threshold,
                    max_refinement_attempts=self.config.max_refinement_attempts,
                    problem_statement=problem_statement,
                )
                hooks.append(hook)

            # Run SWE-agent
            # Note: In production, we'd use the proper API
            # For now, simulate the run structure
            print(f"Would run: sweagent run {' '.join(cmd_args)}")
            print(f"With hooks: {[type(h).__name__ for h in hooks]}")

            # Simulate result for demonstration
            # In production, this would be the actual SWE-agent run
            result.success = False  # Would come from actual run
            result.steps = 0

            if condition == 'treatment' and hooks:
                hook_results = hooks[0].get_results()
                result.quality_scores = hook_results.get('quality_scores', [])
                result.refinement_count = hook_results.get('refinement_count', 0)
                if result.quality_scores:
                    result.final_quality = result.quality_scores[-1].get('overall_quality', 0)

        except Exception as e:
            result.error = str(e)
            print(f"Error: {e}")

        result.duration = time.time() - start_time
        self.results.append(result)

        return result

    def run_experiment(
        self,
        task_ids: List[str],
        conditions: List[str] = ['baseline', 'treatment'],
    ) -> Dict:
        """
        Run the full experiment.

        Args:
            task_ids: List of SWE-bench instance IDs
            conditions: Which conditions to run

        Returns:
            Summary statistics
        """
        print(f"\n{'#'*70}")
        print(f"SWE-AGENT QUALITY GATE EXPERIMENT")
        print(f"{'#'*70}")
        print(f"Tasks: {len(task_ids)}")
        print(f"Conditions: {conditions}")
        print(f"Model: {self.config.model}")
        print(f"{'#'*70}\n")

        # Load task metadata
        task_file = '/Users/andrewtempleton/quality-sgd/data/swe-bench/lite.jsonl'
        task_metadata = {}
        with open(task_file, 'r') as f:
            for line in f:
                task = json.loads(line)
                task_metadata[task['instance_id']] = task

        # Run each task in each condition
        for condition in conditions:
            print(f"\n{'='*70}")
            print(f"CONDITION: {condition.upper()}")
            print(f"{'='*70}\n")

            for i, task_id in enumerate(task_ids):
                print(f"\n[{i+1}/{len(task_ids)}] {task_id}")

                meta = task_metadata.get(task_id, {})
                problem = meta.get('problem_statement', '')

                self.run_task(task_id, condition, problem)

        # Compute summary
        summary = self._compute_summary()

        # Save results
        self._save_results(summary)

        return summary

    def _compute_summary(self) -> Dict:
        """Compute summary statistics."""
        baseline = [r for r in self.results if r.condition == 'baseline']
        treatment = [r for r in self.results if r.condition == 'treatment']

        def stats(results: List[TaskResult]) -> Dict:
            if not results:
                return {}
            successes = sum(1 for r in results if r.success)
            return {
                'n': len(results),
                'successes': successes,
                'pass_rate': successes / len(results) if results else 0,
                'avg_duration': sum(r.duration for r in results) / len(results),
                'avg_cost': sum(r.cost for r in results) / len(results),
            }

        baseline_stats = stats(baseline)
        treatment_stats = stats(treatment)

        # Treatment-specific stats
        if treatment:
            treatment_stats['avg_refinements'] = (
                sum(r.refinement_count for r in treatment) / len(treatment)
            )
            treatment_stats['avg_final_quality'] = (
                sum(r.final_quality for r in treatment) / len(treatment)
            )

        return {
            'config': self.config.to_dict(),
            'baseline': baseline_stats,
            'treatment': treatment_stats,
            'improvement': (
                treatment_stats.get('pass_rate', 0) - baseline_stats.get('pass_rate', 0)
                if baseline_stats and treatment_stats else 0
            ),
        }

    def _save_results(self, summary: Dict):
        """Save results to disk."""
        timestamp = time.strftime('%Y%m%d_%H%M%S')

        # Save detailed results
        results_file = Path(self.config.output_dir) / f"results_{timestamp}.jsonl"
        with open(results_file, 'w') as f:
            for r in self.results:
                f.write(json.dumps(r.to_dict()) + '\n')

        # Save summary
        summary_file = Path(self.config.output_dir) / f"summary_{timestamp}.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)

        print(f"\n{'='*70}")
        print("RESULTS SAVED")
        print(f"{'='*70}")
        print(f"Results: {results_file}")
        print(f"Summary: {summary_file}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='SWE-agent Quality Gate Experiment')
    parser.add_argument('--model', default='gpt-4o', help='Model to use')
    parser.add_argument('--tasks', type=int, default=15, help='Number of hard tasks')
    parser.add_argument('--conditions', nargs='+', default=['baseline', 'treatment'],
                        help='Conditions to run')
    parser.add_argument('--quality-threshold', type=float, default=0.70,
                        help='Quality gate threshold (treatment)')
    parser.add_argument('--max-refinements', type=int, default=2,
                        help='Max refinement attempts (treatment)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print what would be run without executing')
    args = parser.parse_args()

    # Configuration
    config = ExperimentConfig(
        model=args.model,
        quality_threshold=args.quality_threshold,
        max_refinement_attempts=args.max_refinements,
    )

    # Get hard tasks
    task_ids = get_hard_tasks(args.tasks)

    print(f"\nSelected {len(task_ids)} hard tasks:")
    for tid in task_ids:
        print(f"  - {tid}")

    if args.dry_run:
        print("\n[DRY RUN] Would run experiment with:")
        print(f"  Model: {config.model}")
        print(f"  Tasks: {len(task_ids)}")
        print(f"  Conditions: {args.conditions}")
        print(f"  Quality threshold: {config.quality_threshold}")
        return 0

    # Run experiment
    runner = ExperimentRunner(config)
    summary = runner.run_experiment(task_ids, args.conditions)

    # Print summary
    print(f"\n{'#'*70}")
    print("EXPERIMENT SUMMARY")
    print(f"{'#'*70}")
    print(json.dumps(summary, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
