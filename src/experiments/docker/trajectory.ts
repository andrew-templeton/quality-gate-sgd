/**
 * Trajectory Logging for MCP Server
 * ==================================
 * Provides logging infrastructure for capturing agent interactions
 * with the quality gate MCP server.
 *
 * This enables detailed analysis of how agents use gate feedback.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TrajectoryEvent,
  TrajectoryEventType,
  GateQueryEvent,
  SuggestionEvent,
} from './types.js';

// =============================================================================
// Trajectory Logger
// =============================================================================

/**
 * Logger for capturing experiment trajectory events.
 */
export interface TrajectoryLogger {
  /** Log a gate query event */
  logGateQuery(data: GateQueryEvent['data']): void;

  /** Log a suggestion event */
  logSuggestion(data: SuggestionEvent['data']): void;

  /** Log a generic event */
  log(type: TrajectoryEventType, data: Record<string, unknown>): void;

  /** Get all events */
  getEvents(): TrajectoryEvent[];

  /** Flush to disk */
  flush(): void;

  /** Close the logger */
  close(): void;
}

/**
 * Create a trajectory logger that writes to a JSONL file.
 * Uses synchronous file operations for simplicity and test reliability.
 */
export function createTrajectoryLogger(outputPath: string): TrajectoryLogger {
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create/touch file if it doesn't exist
  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, '');
  }

  const events: TrajectoryEvent[] = [];
  let eventCounter = 0;
  let closed = false;

  /**
   * Generate event ID.
   */
  function generateEventId(): string {
    return `evt-${Date.now()}-${++eventCounter}`;
  }

  /**
   * Write an event to the log.
   */
  function writeEvent(event: TrajectoryEvent): void {
    events.push(event);
    if (!closed) {
      fs.appendFileSync(outputPath, JSON.stringify(event) + '\n');
    }
  }

  return {
    logGateQuery(data: GateQueryEvent['data']): void {
      writeEvent({
        eventId: generateEventId(),
        timestamp: Date.now(),
        type: 'gate_query',
        data,
      });
    },

    logSuggestion(data: SuggestionEvent['data']): void {
      writeEvent({
        eventId: generateEventId(),
        timestamp: Date.now(),
        type: 'suggestion_received',
        data,
      });
    },

    log(type: TrajectoryEventType, data: Record<string, unknown>): void {
      writeEvent({
        eventId: generateEventId(),
        timestamp: Date.now(),
        type,
        data,
      });
    },

    getEvents(): TrajectoryEvent[] {
      return [...events];
    },

    flush(): void {
      // No-op with sync writes
    },

    close(): void {
      closed = true;
    },
  };
}

/**
 * Create a no-op logger for when trajectory capture is disabled.
 */
export function createNullLogger(): TrajectoryLogger {
  return {
    logGateQuery(): void {},
    logSuggestion(): void {},
    log(): void {},
    getEvents(): TrajectoryEvent[] {
      return [];
    },
    flush(): void {},
    close(): void {},
  };
}

// =============================================================================
// MCP Server Integration
// =============================================================================

/**
 * Configuration for MCP server trajectory logging.
 */
export interface MCPTrajectoryConfig {
  /** Path to write trajectory log */
  trajectoryPath: string;
  /** Whether logging is enabled */
  enabled?: boolean;
  /** Flush after each event */
  autoFlush?: boolean;
}

/**
 * Middleware wrapper for MCP tool handlers to capture calls.
 */
export function withTrajectoryLogging<T extends Record<string, unknown>>(
  logger: TrajectoryLogger,
  toolName: string,
  handler: (params: T) => Promise<unknown>
): (params: T) => Promise<unknown> {
  return async (params: T): Promise<unknown> => {
    const startTime = Date.now();

    try {
      const result = await handler(params);

      // Log based on tool type
      if (toolName === 'check_gate' || toolName === 'evaluate') {
        const gateResult = result as {
          qualityScore?: number;
          passed?: boolean;
          metrics?: Record<string, number>;
          condition?: string;
        };

        logger.logGateQuery({
          qualityScore: gateResult.qualityScore ?? 0,
          passed: gateResult.passed ?? false,
          metrics: gateResult.metrics ?? {},
          condition: gateResult.condition ?? 'unknown',
        });
      } else if (toolName === 'get_suggestions' || toolName === 'suggest_fix') {
        const suggestions = result as Array<{
          type: string;
          id: string;
          expectedDeltaQ: number;
        }>;

        logger.logSuggestion({
          suggestions: Array.isArray(suggestions) ? suggestions : [],
          gateEnabled: true,
        });
      } else {
        // Generic logging for other tools
        logger.log('gate_query', {
          tool: toolName,
          params,
          result,
          durationMs: Date.now() - startTime,
        });
      }

      return result;
    } catch (error) {
      logger.log('error', {
        tool: toolName,
        params,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  };
}

// =============================================================================
// Trajectory Analysis
// =============================================================================

/**
 * Summary statistics from a trajectory.
 */
export interface TrajectorySummary {
  /** Total number of events */
  totalEvents: number;
  /** Number of gate queries */
  gateQueries: number;
  /** Number of suggestions received */
  suggestionsReceived: number;
  /** Number of errors */
  errors: number;
  /** Quality score trajectory */
  qualityTrajectory: number[];
  /** Pass/fail trajectory */
  passTrajectory: boolean[];
  /** Duration from first to last event (ms) */
  durationMs: number;
  /** Time between gate queries (ms) */
  queryIntervals: number[];
  /** Suggestion types requested */
  suggestionTypes: Record<string, number>;
}

/**
 * Analyze a trajectory and produce summary statistics.
 */
export function analyzeTrajectory(events: TrajectoryEvent[]): TrajectorySummary {
  const gateQueries: TrajectoryEvent[] = [];
  const suggestions: TrajectoryEvent[] = [];
  const errors: TrajectoryEvent[] = [];
  const qualityTrajectory: number[] = [];
  const passTrajectory: boolean[] = [];
  const queryTimestamps: number[] = [];
  const suggestionTypes: Record<string, number> = {};

  for (const event of events) {
    switch (event.type) {
      case 'gate_query':
        gateQueries.push(event);
        qualityTrajectory.push((event.data?.qualityScore as number) ?? 0);
        passTrajectory.push((event.data?.passed as boolean) ?? false);
        queryTimestamps.push(event.timestamp);
        break;

      case 'suggestion_received':
        suggestions.push(event);
        const eventSuggestions = (event.data?.suggestions as Array<{ type: string }>) ?? [];
        for (const s of eventSuggestions) {
          suggestionTypes[s.type] = (suggestionTypes[s.type] ?? 0) + 1;
        }
        break;

      case 'error':
        errors.push(event);
        break;
    }
  }

  // Compute query intervals
  const queryIntervals: number[] = [];
  for (let i = 1; i < queryTimestamps.length; i++) {
    queryIntervals.push(queryTimestamps[i] - queryTimestamps[i - 1]);
  }

  // Compute duration
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const durationMs = firstEvent && lastEvent
    ? lastEvent.timestamp - firstEvent.timestamp
    : 0;

  return {
    totalEvents: events.length,
    gateQueries: gateQueries.length,
    suggestionsReceived: suggestions.length,
    errors: errors.length,
    qualityTrajectory,
    passTrajectory,
    durationMs,
    queryIntervals,
    suggestionTypes,
  };
}

/**
 * Compute metrics for comparing trajectories across conditions.
 */
export interface TrajectoryMetrics {
  /** Iterations to first pass (Infinity if never passed) */
  iterationsToPass: number;
  /** Final quality score */
  finalScore: number;
  /** Maximum quality score reached */
  maxScore: number;
  /** Average quality improvement per iteration */
  avgImprovement: number;
  /** Monotonic improvement rate (no regressions) */
  monotonicRate: number;
  /** Average time between queries (ms) */
  avgQueryInterval: number;
  /** Total suggestions requested */
  totalSuggestions: number;
}

/**
 * Compute comparison metrics from trajectory summary.
 */
export function computeTrajectoryMetrics(summary: TrajectorySummary): TrajectoryMetrics {
  const { qualityTrajectory, passTrajectory, queryIntervals, suggestionsReceived } = summary;

  // Iterations to pass
  const firstPassIndex = passTrajectory.findIndex(p => p);
  const iterationsToPass = firstPassIndex >= 0 ? firstPassIndex + 1 : Infinity;

  // Score metrics
  const finalScore = qualityTrajectory[qualityTrajectory.length - 1] ?? 0;
  const maxScore = Math.max(...qualityTrajectory, 0);

  // Improvement metrics
  let totalImprovement = 0;
  let monotonicCount = 0;
  for (let i = 1; i < qualityTrajectory.length; i++) {
    const delta = qualityTrajectory[i] - qualityTrajectory[i - 1];
    totalImprovement += delta;
    if (delta >= 0) monotonicCount++;
  }

  const avgImprovement = qualityTrajectory.length > 1
    ? totalImprovement / (qualityTrajectory.length - 1)
    : 0;

  const monotonicRate = qualityTrajectory.length > 1
    ? monotonicCount / (qualityTrajectory.length - 1)
    : 1;

  // Query interval
  const avgQueryInterval = queryIntervals.length > 0
    ? queryIntervals.reduce((a, b) => a + b, 0) / queryIntervals.length
    : 0;

  return {
    iterationsToPass,
    finalScore,
    maxScore,
    avgImprovement,
    monotonicRate,
    avgQueryInterval,
    totalSuggestions: suggestionsReceived,
  };
}
