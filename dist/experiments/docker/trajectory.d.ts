/**
 * Trajectory Logging for MCP Server
 * ==================================
 * Provides logging infrastructure for capturing agent interactions
 * with the quality gate MCP server.
 *
 * This enables detailed analysis of how agents use gate feedback.
 */
import type { TrajectoryEvent, TrajectoryEventType, GateQueryEvent, SuggestionEvent } from './types.js';
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
export declare function createTrajectoryLogger(outputPath: string): TrajectoryLogger;
/**
 * Create a no-op logger for when trajectory capture is disabled.
 */
export declare function createNullLogger(): TrajectoryLogger;
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
export declare function withTrajectoryLogging<T extends Record<string, unknown>>(logger: TrajectoryLogger, toolName: string, handler: (params: T) => Promise<unknown>): (params: T) => Promise<unknown>;
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
export declare function analyzeTrajectory(events: TrajectoryEvent[]): TrajectorySummary;
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
export declare function computeTrajectoryMetrics(summary: TrajectorySummary): TrajectoryMetrics;
//# sourceMappingURL=trajectory.d.ts.map