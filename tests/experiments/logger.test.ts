import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  startExperimentRun,
  logIteration,
  endExperimentRun,
  getCurrentRunId,
  getCurrentIteration,
  createBatch,
  addRunToBatch,
  saveBatch,
  loadBatch,
  loadRun,
  listRuns,
} from '../../src/experiments/logger.js'
import type { ExperimentCondition } from '../../src/experiments/types.js'

const TEST_LOG_DIR = '.test-experiments'

describe('experiment logger', () => {
  beforeEach(() => {
    // Clean up any previous test runs
    const fullDir = join(process.cwd(), TEST_LOG_DIR)
    if (existsSync(fullDir)) {
      rmSync(fullDir, { recursive: true })
    }
  })

  afterEach(() => {
    // End any active experiment
    try {
      if (getCurrentRunId()) {
        endExperimentRun('manual')
      }
    } catch {
      // Ignore
    }

    // Clean up test directory
    const fullDir = join(process.cwd(), TEST_LOG_DIR)
    if (existsSync(fullDir)) {
      rmSync(fullDir, { recursive: true })
    }
  })

  describe('startExperimentRun', () => {
    it('creates a new run and returns run ID', () => {
      const condition: ExperimentCondition = {
        name: 'test-condition',
        design: 'A',
        config: {
          maxIterations: 10,
          gateEnabled: true,
        },
      }

      const runId = startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })

      expect(runId).toBeDefined()
      expect(typeof runId).toBe('string')
      expect(runId.length).toBeGreaterThan(0)
    })

    it('creates log file', () => {
      const condition: ExperimentCondition = {
        name: 'test-condition',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      const runId = startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      const logPath = join(process.cwd(), TEST_LOG_DIR, `${runId}.jsonl`)

      expect(existsSync(logPath)).toBe(true)
    })

    it('throws if run already active', () => {
      const condition: ExperimentCondition = {
        name: 'test-condition',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })

      expect(() =>
        startExperimentRun('task-002', condition, { logDir: TEST_LOG_DIR })
      ).toThrow(/already active/)
    })

    it('accepts custom run ID', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      const runId = startExperimentRun('task-001', condition, {
        logDir: TEST_LOG_DIR,
        runId: 'custom-run-id',
      })

      expect(runId).toBe('custom-run-id')
    })
  })

  describe('logIteration', () => {
    it('logs iteration and increments counter', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })

      const record1 = logIteration({ coverage: 80 }, 80, false)
      const record2 = logIteration({ coverage: 85 }, 85, false)

      expect(record1.iteration).toBe(1)
      expect(record2.iteration).toBe(2)
      expect(getCurrentIteration()).toBe(2)
    })

    it('computes delta from previous iteration', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })

      logIteration({ coverage: 80 }, 80, false)
      const record2 = logIteration({ coverage: 85 }, 85, false)

      expect(record2.delta).toBe(5)
    })

    it('throws if no active run', () => {
      expect(() => logIteration({ coverage: 80 }, 80, false)).toThrow(/No active/)
    })

    it('logs target and outcome', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })

      const record = logIteration({ coverage: 80 }, 80, false, {
        target: {
          type: 'symbol',
          id: 'src/foo.ts::bar',
          expectedDeltaQ: 5,
        },
        outcome: {
          success: true,
          actualDeltaQ: 4.5,
          targetMatched: true,
        },
      })

      expect(record.target).toBeDefined()
      expect(record.target?.id).toBe('src/foo.ts::bar')
      expect(record.outcome?.success).toBe(true)
    })
  })

  describe('endExperimentRun', () => {
    it('returns complete run data', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 80 }, 80, false)
      logIteration({ coverage: 85 }, 85, false)
      logIteration({ coverage: 90 }, 90, true)

      const run = endExperimentRun('passed')

      expect(run.taskId).toBe('task-001')
      expect(run.iterations.length).toBe(3)
      expect(run.outcome.passed).toBe(true)
      expect(run.outcome.iterationsToPass).toBe(3)
      expect(run.outcome.stopReason).toBe('passed')
    })

    it('computes outcome metrics', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 80 }, 80, false)
      logIteration({ coverage: 85 }, 85, false)
      logIteration({ coverage: 84 }, 84, false) // Regression
      logIteration({ coverage: 90 }, 90, true)

      const run = endExperimentRun('passed')

      expect(run.outcome.totalImprovement).toBe(10)
      expect(run.outcome.monotonicRate).toBeGreaterThan(0)
    })

    it('writes complete JSON file', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }
      const runId = startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 80 }, 80, false)

      endExperimentRun('manual')

      const jsonPath = join(process.cwd(), TEST_LOG_DIR, `${runId}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const content = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(content.runId).toBe(runId)
      expect(content.iterations.length).toBe(1)
    })
  })

  describe('batch management', () => {
    it('creates and saves batch', () => {
      const batch = createBatch('A', ['H1', 'H2'], { logDir: TEST_LOG_DIR })

      expect(batch.batchId).toBeDefined()
      expect(batch.design).toBe('A')
      expect(batch.hypotheses).toEqual(['H1', 'H2'])
    })

    it('adds runs to batch', () => {
      const batch = createBatch('A', ['H1', 'H2'], { logDir: TEST_LOG_DIR })
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 90 }, 90, true)
      const run = endExperimentRun('passed')

      addRunToBatch(batch, run)

      expect(batch.runs.length).toBe(1)
      expect(batch.runs[0].taskId).toBe('task-001')
    })

    it('saves and loads batch', () => {
      const batch = createBatch('A', ['H1', 'H2'], {
        logDir: TEST_LOG_DIR,
        batchId: 'test-batch',
      })
      batch.runs = []
      saveBatch(batch, { logDir: TEST_LOG_DIR })

      const loaded = loadBatch('test-batch', { logDir: TEST_LOG_DIR })

      expect(loaded).toBeDefined()
      expect(loaded?.batchId).toBe('test-batch')
      expect(loaded?.design).toBe('A')
    })

    it('returns null for non-existent batch', () => {
      const loaded = loadBatch('non-existent', { logDir: TEST_LOG_DIR })

      expect(loaded).toBeNull()
    })
  })

  describe('listRuns', () => {
    it('lists all runs in directory', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      const runId1 = startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 90 }, 90, true)
      endExperimentRun('passed')

      const runId2 = startExperimentRun('task-002', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 85 }, 85, true)
      endExperimentRun('passed')

      const runs = listRuns({ logDir: TEST_LOG_DIR })

      expect(runs).toContain(runId1)
      expect(runs).toContain(runId2)
      expect(runs.length).toBe(2)
    })

    it('returns empty array for non-existent directory', () => {
      const runs = listRuns({ logDir: 'non-existent-dir' })

      expect(runs).toEqual([])
    })
  })

  describe('loadRun', () => {
    it('loads run from disk', () => {
      const condition: ExperimentCondition = {
        name: 'test',
        design: 'A',
        config: { maxIterations: 10, gateEnabled: true },
      }

      const runId = startExperimentRun('task-001', condition, { logDir: TEST_LOG_DIR })
      logIteration({ coverage: 90 }, 90, true)
      endExperimentRun('passed')

      const loaded = loadRun(runId, { logDir: TEST_LOG_DIR })

      expect(loaded).toBeDefined()
      expect(loaded?.runId).toBe(runId)
      expect(loaded?.taskId).toBe('task-001')
    })

    it('returns null for non-existent run', () => {
      const loaded = loadRun('non-existent', { logDir: TEST_LOG_DIR })

      expect(loaded).toBeNull()
    })
  })
})
