import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import {
  executeRun,
  executeBatch,
  executeTaskAcrossConditions,
  executeBaselineVsTreatment,
  createMockAgent,
  canResumeRun,
  getLastIteration,
  estimateTimeRemaining,
  formatDuration,
  type ExperimentTask,
  type ExperimentAgent,
} from '../../src/experiments/runner.js'
import { createConditions } from '../../src/experiments/conditions.js'
import type { ExperimentConfig, IterationOutcome } from '../../src/experiments/types.js'

const TEST_LOG_DIR = '.test-runner'

describe('experiment runner', () => {
  beforeEach(() => {
    const fullDir = join(process.cwd(), TEST_LOG_DIR)
    if (existsSync(fullDir)) {
      rmSync(fullDir, { recursive: true })
    }
  })

  afterEach(() => {
    const fullDir = join(process.cwd(), TEST_LOG_DIR)
    if (existsSync(fullDir)) {
      rmSync(fullDir, { recursive: true })
    }
  })

  describe('createMockAgent', () => {
    it('creates agent with default options', () => {
      const agent = createMockAgent()

      expect(agent.initialize).toBeDefined()
      expect(agent.getSuggestion).toBeDefined()
      expect(agent.executeIteration).toBeDefined()
      expect(agent.evaluate).toBeDefined()
      expect(agent.cleanup).toBeDefined()
    })

    it('respects seed for reproducibility', async () => {
      const agent1 = createMockAgent({ seed: 42 })
      const agent2 = createMockAgent({ seed: 42 })

      await agent1.initialize({} as ExperimentTask, {} as ExperimentConfig)
      await agent2.initialize({} as ExperimentTask, {} as ExperimentConfig)

      const result1 = await agent1.executeIteration(1, null, {} as ExperimentConfig)
      const result2 = await agent2.executeIteration(1, null, {} as ExperimentConfig)

      expect(result1.actualDeltaQ).toBe(result2.actualDeltaQ)
    })

    it('evaluates with initial score', async () => {
      const agent = createMockAgent({ initialScore: 75 })

      await agent.initialize({} as ExperimentTask, {} as ExperimentConfig)
      const result = await agent.evaluate({} as ExperimentConfig)

      expect(result.qualityScore).toBe(75)
    })

    it('passes when reaching target score', async () => {
      const agent = createMockAgent({
        initialScore: 89,
        targetScore: 90,
        improvementProbability: 1.0,
      })

      await agent.initialize({} as ExperimentTask, {} as ExperimentConfig)

      // Execute iterations until we pass
      for (let i = 0; i < 10; i++) {
        await agent.executeIteration(i, null, {} as ExperimentConfig)
        const result = await agent.evaluate({} as ExperimentConfig)
        if (result.passed) {
          expect(result.qualityScore).toBeGreaterThanOrEqual(90)
          return
        }
      }

      // Should have passed by now
      const finalResult = await agent.evaluate({} as ExperimentConfig)
      expect(finalResult.passed).toBe(true)
    })
  })

  describe('executeRun', () => {
    it('executes a single run to completion', async () => {
      const task: ExperimentTask = { id: 'test-task-001' }
      const condition = createConditions('A')[1] // gate enabled
      condition.config.maxIterations = 5

      const agent = createMockAgent({
        initialScore: 85,
        targetScore: 90,
        improvementProbability: 0.8,
        seed: 42,
      })

      const run = await executeRun(task, condition, agent, { logDir: TEST_LOG_DIR })

      expect(run.taskId).toBe('test-task-001')
      expect(run.condition.name).toBe('gate')
      expect(run.iterations.length).toBeGreaterThan(0)
      expect(run.outcome.stopReason).toMatch(/passed|max_iterations/)
    })

    it('stops when gate passes', async () => {
      const task: ExperimentTask = { id: 'test-task-002' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 100

      const agent = createMockAgent({
        initialScore: 88,
        targetScore: 90,
        improvementProbability: 1.0,
        seed: 123,
      })

      const run = await executeRun(task, condition, agent, { logDir: TEST_LOG_DIR })

      expect(run.outcome.passed).toBe(true)
      expect(run.outcome.stopReason).toBe('passed')
      expect(run.iterations.length).toBeLessThan(100)
    })

    it('stops at max iterations', async () => {
      const task: ExperimentTask = { id: 'test-task-003' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 3

      const agent = createMockAgent({
        initialScore: 10,
        targetScore: 90,
        improvementProbability: 0.1,
        seed: 456,
      })

      const run = await executeRun(task, condition, agent, { logDir: TEST_LOG_DIR })

      // iterations = initial (0) + 3 iterations = 4 total logged
      expect(run.iterations.length).toBe(4)
      expect(run.outcome.stopReason).toBe('max_iterations')
    })

    it('calls progress callback', async () => {
      const task: ExperimentTask = { id: 'test-task-004' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 3

      const agent = createMockAgent({ seed: 789 })
      const progressCalls: number[] = []

      await executeRun(task, condition, agent, {
        logDir: TEST_LOG_DIR,
        onProgress: (iteration) => progressCalls.push(iteration),
      })

      expect(progressCalls).toEqual([1, 2, 3])
    })

    it('calls iteration callback', async () => {
      const task: ExperimentTask = { id: 'test-task-005' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 2

      const agent = createMockAgent({ seed: 101 })
      const iterationRecords: number[] = []

      await executeRun(task, condition, agent, {
        logDir: TEST_LOG_DIR,
        onIteration: (record) => iterationRecords.push(record.iteration),
      })

      // Initial (0) + 2 iterations
      expect(iterationRecords.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('executeBatch', () => {
    it('executes batch for all tasks × conditions', async () => {
      const tasks: ExperimentTask[] = [
        { id: 'batch-task-001' },
        { id: 'batch-task-002' },
      ]

      const agent = createMockAgent({ seed: 111 })

      // Use design A with 2 conditions (no-gate, gate)
      // 2 tasks × 2 conditions = 4 runs
      const batch = await executeBatch('A', tasks, agent, {
        logDir: TEST_LOG_DIR,
      })

      // Modify maxIterations for faster test
      const conditions = createConditions('A')
      for (const c of conditions) {
        c.config.maxIterations = 2
      }

      expect(batch.design).toBe('A')
      expect(batch.runs.length).toBe(4)
    }, 30000)

    it('calls onRunComplete callback', async () => {
      const tasks: ExperimentTask[] = [{ id: 'callback-task' }]
      const agent = createMockAgent({ seed: 222 })

      const completedRuns: string[] = []

      const batch = await executeBatch('A', tasks, agent, {
        logDir: TEST_LOG_DIR,
        onRunComplete: (run) => completedRuns.push(run.runId),
      })

      expect(completedRuns.length).toBe(2) // 1 task × 2 conditions
    }, 30000)

    it('continues on failure when configured', async () => {
      const tasks: ExperimentTask[] = [
        { id: 'fail-task-001' },
        { id: 'fail-task-002' },
      ]

      // Create agent that fails on first task
      let taskCount = 0
      const failingAgent: ExperimentAgent = {
        async initialize() {
          taskCount++
          if (taskCount === 1) {
            throw new Error('Simulated failure')
          }
        },
        async getSuggestion() { return null },
        async executeIteration() {
          return { success: true, actualDeltaQ: 1, targetMatched: true }
        },
        async evaluate() {
          return { metrics: {}, qualityScore: 100, passed: true }
        },
        async cleanup() {},
      }

      const batch = await executeBatch('A', tasks, failingAgent, {
        logDir: TEST_LOG_DIR,
        continueOnFailure: true,
      })

      // Should have some runs despite first failure
      expect(batch.runs.length).toBeGreaterThan(0)
    }, 30000)
  })

  describe('executeTaskAcrossConditions', () => {
    it('runs all conditions for a single task', async () => {
      const task: ExperimentTask = { id: 'cross-condition-task' }
      const agent = createMockAgent({ seed: 333 })

      const runs = await executeTaskAcrossConditions(task, 'A', agent, {
        logDir: TEST_LOG_DIR,
      })

      expect(runs.length).toBe(2) // Design A has 2 conditions
      expect(runs[0].condition.name).toBe('no-gate')
      expect(runs[1].condition.name).toBe('gate')
    }, 30000)
  })

  describe('executeBaselineVsTreatment', () => {
    it('separates baseline and treatments', async () => {
      const task: ExperimentTask = { id: 'bvt-task' }
      const agent = createMockAgent({ seed: 444 })

      const result = await executeBaselineVsTreatment(task, 'A', agent, {
        logDir: TEST_LOG_DIR,
      })

      expect(result.baseline.condition.name).toBe('no-gate')
      expect(result.treatments.length).toBe(1)
      expect(result.treatments[0].condition.name).toBe('gate')
    }, 30000)
  })

  describe('canResumeRun', () => {
    it('returns false for non-existent run', () => {
      expect(canResumeRun('non-existent', { logDir: TEST_LOG_DIR })).toBe(false)
    })

    it('returns false for completed run', async () => {
      const task: ExperimentTask = { id: 'resume-test-1' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 2

      const agent = createMockAgent({
        initialScore: 95,
        targetScore: 90,
        seed: 555,
      })

      const run = await executeRun(task, condition, agent, { logDir: TEST_LOG_DIR })

      // Run passed, so can't resume
      if (run.outcome.passed) {
        expect(canResumeRun(run.runId, { logDir: TEST_LOG_DIR })).toBe(false)
      }
    })
  })

  describe('getLastIteration', () => {
    it('returns 0 for non-existent run', () => {
      expect(getLastIteration('non-existent', { logDir: TEST_LOG_DIR })).toBe(0)
    })

    it('returns correct iteration count', async () => {
      const task: ExperimentTask = { id: 'iter-test' }
      const condition = createConditions('A')[1]
      condition.config.maxIterations = 3

      const agent = createMockAgent({
        initialScore: 10,
        targetScore: 90,
        seed: 666,
      })

      const run = await executeRun(task, condition, agent, { logDir: TEST_LOG_DIR })
      const lastIter = getLastIteration(run.runId, { logDir: TEST_LOG_DIR })

      expect(lastIter).toBe(run.iterations.length)
    })
  })
})

describe('utility functions', () => {
  describe('estimateTimeRemaining', () => {
    it('returns Infinity when no runs completed', () => {
      expect(estimateTimeRemaining(0, 10, 5000)).toBe(Infinity)
    })

    it('calculates remaining time correctly', () => {
      // 5 runs completed in 10 seconds, 5 remaining
      const remaining = estimateTimeRemaining(5, 10, 10000)
      expect(remaining).toBe(10000) // 5 more runs × 2 seconds each
    })

    it('returns 0 when all runs completed', () => {
      const remaining = estimateTimeRemaining(10, 10, 10000)
      expect(remaining).toBe(0)
    })
  })

  describe('formatDuration', () => {
    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s')
      expect(formatDuration(45000)).toBe('45s')
    })

    it('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s')
      expect(formatDuration(120000)).toBe('2m 0s')
    })

    it('formats hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m')
      expect(formatDuration(5400000)).toBe('1h 30m')
    })

    it('handles Infinity', () => {
      expect(formatDuration(Infinity)).toBe('unknown')
    })
  })
})
