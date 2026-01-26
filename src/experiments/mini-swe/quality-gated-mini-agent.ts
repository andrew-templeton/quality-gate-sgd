/**
 * Quality-Gated Mini-SWE-agent Wrapper
 * =====================================
 * Scientifically correct instrumentation of mini-swe-agent.
 *
 * ONLY adds quality gate hook before submission - everything else identical.
 *
 * Baseline: Mini-SWE-agent with bash tools
 * Treatment: Mini-SWE-agent + Quality gate before submission
 *
 * This allows direct comparison to published mini-swe-agent results (74% on SWE-bench Verified).
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { SWEBenchTask } from '../swebench/types.js';
import type { PatchProposalReasoning, PatchQualityMetrics } from '../swebench/quality-gate.js';
import { evaluatePatchQuality, evaluateQualityGate, generateQualityFeedback, DEFAULT_QUALITY_GATE } from '../swebench/quality-gate.js';

// =============================================================================
// Types
// =============================================================================

export interface QualityGatedMiniAgentConfig {
  /** Model to use (gpt-5.2, claude-opus-4.5, etc.) */
  model: string;
  /** API key */
  apiKey?: string;
  /** Quality gate config */
  qualityGate?: {
    minOverallQuality?: number;
    minDimensionScores?: Record<string, number>;
  };
  /** Max reasoning iterations before accepting suboptimal quality */
  maxReasoningIterations?: number;
  /** Whether to enable quality gate (false = baseline, true = treatment) */
  enableQualityGate?: boolean;
  /** Python path for mini-swe-agent */
  miniSweAgentPath?: string;
  /** Config file (default: mini.yaml) */
  configFile?: string;
  /** Cost limit */
  costLimit?: number;
  /** Step limit */
  stepLimit?: number;
  /** Verbose logging */
  verbose?: boolean;
}

export interface AgentResult {
  success: boolean;
  patch?: string;
  trajectory: AgentMessage[];
  exitStatus: string;
  exitMessage: string;
  qualityScores?: PatchQualityMetrics[];
  iterations: number;
  cost: number;
  error?: string;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  action?: string;
  output?: string;
}

// =============================================================================
// Mini-SWE-agent Wrapper
// =============================================================================

/**
 * Run mini-swe-agent on a task with optional quality gate.
 *
 * This preserves ALL of mini-swe-agent's behavior except adds quality evaluation
 * before accepting the COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT command.
 */
export async function runQualityGatedMiniAgent(
  task: SWEBenchTask,
  config: QualityGatedMiniAgentConfig
): Promise<AgentResult> {
  const {
    model,
    apiKey,
    qualityGate = DEFAULT_QUALITY_GATE,
    maxReasoningIterations = 3,
    enableQualityGate = true,
    miniSweAgentPath = '/tmp/mini-swe-agent',
    configFile = 'mini.yaml',
    costLimit = 3.0,
    stepLimit = 0,
    verbose = false,
  } = config;

  const log = (msg: string) => {
    if (verbose) console.error(`[QualityGatedMini] ${msg}`);
  };

  // Validate mini-swe-agent is available
  if (!fs.existsSync(miniSweAgentPath)) {
    throw new Error(`Mini-SWE-agent not found at ${miniSweAgentPath}. Clone from https://github.com/SWE-agent/mini-swe-agent`);
  }

  // Prepare environment
  const env = {
    ...process.env,
    ...(apiKey && { OPENAI_API_KEY: apiKey }),
    ANTHROPIC_API_KEY: apiKey, // In case using Claude
    PYTHONUNBUFFERED: '1',
  };

  const trajectory: AgentMessage[] = [];
  const qualityScores: PatchQualityMetrics[] = [];
  let iterations = 0;
  let cost = 0;

  // Build command
  const args = [
    'python', '-m', 'minisweagent.run.mini',
    '--model', model,
    '--config', configFile,
    '--cost_limit', costLimit.toString(),
    '--step_limit', stepLimit.toString(),
    '--instance_id', task.instanceId,
    '--data_path', 'swe-bench-lite.jsonl', // Mini-SWE-agent expects this
  ];

  log(`Running: ${args.join(' ')}`);

  // For this MVP, we'll run mini-swe-agent as-is and hook into its output
  // TODO: Full integration requires modifying mini-swe-agent Python code
  // For now, document the approach

  return {
    success: false,
    trajectory,
    exitStatus: 'NotImplemented',
    exitMessage: 'Full integration requires Python interop - see METHODOLOGY_CORRECTION.md',
    qualityScores,
    iterations,
    cost,
    error: 'This is a design document. Implementation requires Python-TypeScript bridge.',
  };
}

// =============================================================================
// Reasoning Extraction from Trajectory
// =============================================================================

/**
 * Extract reasoning from mini-swe-agent trajectory.
 *
 * Mini-swe-agent includes THOUGHT sections before each action.
 * We aggregate these to reconstruct the reasoning.
 */
export function extractReasoningFromTrajectory(
  trajectory: AgentMessage[]
): PatchProposalReasoning | null {
  // Extract all THOUGHT sections from assistant messages
  const thoughts: string[] = [];
  const actions: string[] = [];

  for (const msg of trajectory) {
    if (msg.role === 'assistant' && msg.content) {
      // Parse THOUGHT section
      const thoughtMatch = msg.content.match(/THOUGHT:?\s*(.+?)(?=```|$)/is);
      if (thoughtMatch) {
        thoughts.push(thoughtMatch[1].trim());
      }

      // Parse action
      const actionMatch = msg.content.match(/```bash\s*\n(.*?)\n```/is);
      if (actionMatch) {
        actions.push(actionMatch[1].trim());
      }
    }
  }

  if (thoughts.length === 0) {
    return null;
  }

  // Reconstruct reasoning structure from thoughts
  const allThoughts = thoughts.join('\n\n');

  // Heuristic extraction (this is approximate - real implementation would use LLM)
  return {
    prior: {
      bugDescription: `Issue from trajectory: ${thoughts[0].slice(0, 200)}`,
      currentBehavior: 'Extracted from initial exploration',
      expectedBehavior: 'Described in task',
      confidence: 0.7,
    },
    hypothesis: {
      rootCause: thoughts.find(t => t.toLowerCase().includes('issue') || t.toLowerCase().includes('problem')) || 'Root cause identified',
      causalChain: thoughts.slice(0, 3),
      rationale: allThoughts.slice(0, 500),
    },
    evidence: {
      codeReferences: actions.map((a, i) => ({
        file: a.includes('cat') || a.includes('grep') ? a : 'unknown',
        lines: `action_${i}`,
        observation: thoughts[i] || '',
      })).slice(0, 5),
      observations: thoughts,
      supportingLogic: allThoughts,
    },
    solution: {
      changeDescription: thoughts.slice(-3).join('. '),
      addressesCause: 'Based on iterative refinement',
      minimality: 'Minimal change principle followed',
    },
    prediction: {
      testOutcomes: ['Tests should pass after fix'],
      effects: ['Issue resolved', 'No regressions'],
      verificationPlan: 'Run test suite',
    },
  };
}

// =============================================================================
// Quality Gate Hook (Design)
// =============================================================================

/**
 * This is the hook point for the quality gate.
 *
 * In the full implementation, this would be called from Python:
 *
 * ```python
 * # In minisweagent/agents/default.py
 *
 * def has_finished(self, output: dict[str, str]):
 *     lines = output.get("output", "").lstrip().splitlines(keepends=True)
 *
 *     if lines and lines[0].strip() == "COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT":
 *         # HOOK: Quality gate evaluation
 *         if QUALITY_GATE_ENABLED:
 *             reasoning = extract_reasoning_from_trajectory(self.messages)
 *             quality = evaluate_quality(reasoning)
 *
 *             if quality.overall < THRESHOLD:
 *                 feedback = generate_feedback(quality)
 *                 raise FormatError(f"QUALITY GATE REJECTED: {feedback}")
 *
 *         raise Submitted("".join(lines[1:]))
 * ```
 *
 * This preserves all mini-swe-agent behavior except adds quality check.
 */
export function shouldAcceptSubmission(
  trajectory: AgentMessage[],
  qualityGateConfig: typeof DEFAULT_QUALITY_GATE
): { accept: boolean; feedback?: string; quality?: PatchQualityMetrics } {
  const reasoning = extractReasoningFromTrajectory(trajectory);

  if (!reasoning) {
    return {
      accept: false,
      feedback: 'Could not extract sufficient reasoning from trajectory. Please provide more detailed THOUGHT sections.',
    };
  }

  const quality = evaluatePatchQuality(reasoning);
  const gateResult = evaluateQualityGate(reasoning, qualityGateConfig);

  if (!gateResult.passes) {
    const feedback = generateQualityFeedback(gateResult);
    return {
      accept: false,
      feedback,
      quality,
    };
  }

  return {
    accept: true,
    quality,
  };
}
