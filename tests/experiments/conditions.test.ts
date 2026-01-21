import { describe, it, expect } from 'vitest'
import {
  createConditions,
  getBaselineCondition,
  getTreatmentConditions,
  validateCondition,
  canPairConditions,
  describeCondition,
  conditionLabel,
  DEFAULT_EXPERIMENT_CONFIG,
  DESIGN_METADATA,
} from '../../src/experiments/conditions.js'
import type { ExperimentDesign, ExperimentCondition } from '../../src/experiments/types.js'

describe('DESIGN_METADATA', () => {
  it('has metadata for all designs A-F', () => {
    const designs: ExperimentDesign[] = ['A', 'B', 'C', 'D', 'E', 'F']

    for (const design of designs) {
      expect(DESIGN_METADATA[design]).toBeDefined()
      expect(DESIGN_METADATA[design].design).toBe(design)
      expect(DESIGN_METADATA[design].name).toBeTruthy()
      expect(DESIGN_METADATA[design].hypotheses.length).toBeGreaterThan(0)
      expect(DESIGN_METADATA[design].conditions.length).toBeGreaterThan(0)
    }
  })

  it('maps designs to correct hypotheses', () => {
    expect(DESIGN_METADATA.A.hypotheses).toEqual(['H1', 'H2'])
    expect(DESIGN_METADATA.B.hypotheses).toEqual(['H3'])
    expect(DESIGN_METADATA.C.hypotheses).toEqual(['H4', 'H5', 'H6'])
    expect(DESIGN_METADATA.D.hypotheses).toEqual(['H7', 'H8'])
    expect(DESIGN_METADATA.E.hypotheses).toEqual(['H9', 'H10'])
    expect(DESIGN_METADATA.F.hypotheses).toEqual(['H11', 'H12'])
  })
})

describe('createConditions', () => {
  describe('Design A - Gate vs No-Gate', () => {
    it('creates two conditions: no-gate and gate', () => {
      const conditions = createConditions('A')

      expect(conditions).toHaveLength(2)
      expect(conditions[0].name).toBe('no-gate')
      expect(conditions[1].name).toBe('gate')
    })

    it('baseline has gate disabled', () => {
      const conditions = createConditions('A')
      const baseline = conditions[0]

      expect(baseline.config.gateEnabled).toBe(false)
    })

    it('treatment has gate enabled', () => {
      const conditions = createConditions('A')
      const treatment = conditions[1]

      expect(treatment.config.gateEnabled).toBe(true)
    })

    it('respects seed option', () => {
      const conditions = createConditions('A', { seed: 42 })

      expect(conditions[0].config.seed).toBe(42)
      expect(conditions[1].config.seed).toBe(42)
    })

    it('respects maxIterations option', () => {
      const conditions = createConditions('A', { maxIterations: 100 })

      expect(conditions[0].config.maxIterations).toBe(100)
      expect(conditions[1].config.maxIterations).toBe(100)
    })
  })

  describe('Design B - Topology Sensitivity', () => {
    it('creates three conditions for different topologies', () => {
      const conditions = createConditions('B')

      expect(conditions).toHaveLength(3)
      expect(conditions[0].name).toBe('coverage-only')
      expect(conditions[1].name).toBe('coverage-ceilings')
      expect(conditions[2].name).toBe('full')
    })

    it('each condition has correct topology', () => {
      const conditions = createConditions('B')

      expect(conditions[0].config.topology).toBe('coverage-only')
      expect(conditions[1].config.topology).toBe('coverage-ceilings')
      expect(conditions[2].config.topology).toBe('full')
    })

    it('all conditions have gate enabled', () => {
      const conditions = createConditions('B')

      for (const condition of conditions) {
        expect(condition.config.gateEnabled).toBe(true)
      }
    })
  })

  describe('Design C - Addressing Fitness', () => {
    it('creates single default condition', () => {
      const conditions = createConditions('C')

      expect(conditions).toHaveLength(1)
      expect(conditions[0].name).toBe('default')
    })

    it('uses symbol-level granularity', () => {
      const conditions = createConditions('C')

      expect(conditions[0].config.granularity).toBe('symbol')
    })
  })

  describe('Design D - Call Graph Weighting', () => {
    it('creates two conditions: unweighted and weighted', () => {
      const conditions = createConditions('D')

      expect(conditions).toHaveLength(2)
      expect(conditions[0].name).toBe('unweighted')
      expect(conditions[1].name).toBe('weighted')
    })

    it('baseline has weighting disabled', () => {
      const conditions = createConditions('D')

      expect(conditions[0].config.callGraphWeighting).toBe(false)
      expect(conditions[0].config.prioritization).toBe('raw')
    })

    it('treatment has weighting enabled', () => {
      const conditions = createConditions('D')

      expect(conditions[1].config.callGraphWeighting).toBe(true)
      expect(conditions[1].config.prioritization).toBe('weighted')
    })
  })

  describe('Design E - Fixability Estimation', () => {
    it('creates single default condition', () => {
      const conditions = createConditions('E')

      expect(conditions).toHaveLength(1)
      expect(conditions[0].name).toBe('default')
    })

    it('has fixability enabled', () => {
      const conditions = createConditions('E')

      expect(conditions[0].config.fixabilityEnabled).toBe(true)
    })
  })

  describe('Design F - Adjusted Prioritization', () => {
    it('creates two conditions: raw and adjusted', () => {
      const conditions = createConditions('F')

      expect(conditions).toHaveLength(2)
      expect(conditions[0].name).toBe('raw')
      expect(conditions[1].name).toBe('adjusted')
    })

    it('baseline uses raw prioritization', () => {
      const conditions = createConditions('F')

      expect(conditions[0].config.prioritization).toBe('raw')
      expect(conditions[0].config.fixabilityEnabled).toBe(false)
    })

    it('treatment uses adjusted prioritization with fixability', () => {
      const conditions = createConditions('F')

      expect(conditions[1].config.prioritization).toBe('adjusted')
      expect(conditions[1].config.fixabilityEnabled).toBe(true)
      expect(conditions[1].config.callGraphWeighting).toBe(true)
    })
  })
})

describe('getBaselineCondition', () => {
  it('returns first condition for each design', () => {
    const designs: ExperimentDesign[] = ['A', 'B', 'C', 'D', 'E', 'F']

    for (const design of designs) {
      const baseline = getBaselineCondition(design)
      const allConditions = createConditions(design)

      expect(baseline).toEqual(allConditions[0])
    }
  })
})

describe('getTreatmentConditions', () => {
  it('returns all conditions except first', () => {
    const treatments = getTreatmentConditions('A')

    expect(treatments).toHaveLength(1)
    expect(treatments[0].name).toBe('gate')
  })

  it('returns multiple treatments for Design B', () => {
    const treatments = getTreatmentConditions('B')

    expect(treatments).toHaveLength(2)
    expect(treatments[0].name).toBe('coverage-ceilings')
    expect(treatments[1].name).toBe('full')
  })

  it('returns empty array for single-condition designs', () => {
    const treatmentsC = getTreatmentConditions('C')
    const treatmentsE = getTreatmentConditions('E')

    expect(treatmentsC).toHaveLength(0)
    expect(treatmentsE).toHaveLength(0)
  })
})

describe('validateCondition', () => {
  it('returns empty array for valid conditions', () => {
    const conditions = createConditions('A')

    for (const condition of conditions) {
      const errors = validateCondition(condition)
      expect(errors).toEqual([])
    }
  })

  it('detects missing topology for Design B', () => {
    const condition: ExperimentCondition = {
      name: 'test',
      design: 'B',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        topology: undefined,
      },
    }

    const errors = validateCondition(condition)

    expect(errors).toContain('Design B requires topology to be specified')
  })

  it('detects wrong granularity for Design C', () => {
    const condition: ExperimentCondition = {
      name: 'test',
      design: 'C',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        granularity: 'file',
      },
    }

    const errors = validateCondition(condition)

    expect(errors).toContain('Design C requires symbol-level granularity for fitness metrics')
  })

  it('detects wrong granularity for Design D', () => {
    const condition: ExperimentCondition = {
      name: 'test',
      design: 'D',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        granularity: 'dimension',
      },
    }

    const errors = validateCondition(condition)

    expect(errors).toContain('Design D requires symbol-level granularity for call graph weighting')
  })

  it('detects missing fixability for Design E', () => {
    const condition: ExperimentCondition = {
      name: 'test',
      design: 'E',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        fixabilityEnabled: false,
      },
    }

    const errors = validateCondition(condition)

    expect(errors).toContain('Design E requires fixabilityEnabled to be true')
  })

  it('detects invalid maxIterations', () => {
    const condition: ExperimentCondition = {
      name: 'test',
      design: 'A',
      config: {
        ...DEFAULT_EXPERIMENT_CONFIG,
        maxIterations: 0,
      },
    }

    const errors = validateCondition(condition)

    expect(errors).toContain('maxIterations must be positive')
  })
})

describe('canPairConditions', () => {
  it('returns true for conditions from same design', () => {
    const conditions = createConditions('A')

    expect(canPairConditions(conditions[0], conditions[1])).toBe(true)
  })

  it('returns false for conditions from different designs', () => {
    const conditionsA = createConditions('A')
    const conditionsD = createConditions('D')

    expect(canPairConditions(conditionsA[0], conditionsD[0])).toBe(false)
  })

  it('returns false if maxIterations differ', () => {
    const conditions1 = createConditions('A', { maxIterations: 50 })
    const conditions2 = createConditions('A', { maxIterations: 100 })

    expect(canPairConditions(conditions1[0], conditions2[0])).toBe(false)
  })

  it('returns false if seeds differ', () => {
    const conditions1 = createConditions('A', { seed: 42 })
    const conditions2 = createConditions('A', { seed: 123 })

    expect(canPairConditions(conditions1[0], conditions2[0])).toBe(false)
  })
})

describe('describeCondition', () => {
  it('includes design and condition name', () => {
    const condition = createConditions('A')[0]

    const description = describeCondition(condition)

    expect(description).toContain('Design A')
    expect(description).toContain('no-gate')
  })

  it('includes gate status', () => {
    const conditions = createConditions('A')

    expect(describeCondition(conditions[0])).toContain('Gate: disabled')
    expect(describeCondition(conditions[1])).toContain('Gate: enabled')
  })

  it('includes topology for Design B', () => {
    const condition = createConditions('B')[0]

    const description = describeCondition(condition)

    expect(description).toContain('Topology: coverage-only')
  })

  it('includes seed when specified', () => {
    const condition = createConditions('A', { seed: 42 })[0]

    const description = describeCondition(condition)

    expect(description).toContain('Seed: 42')
  })
})

describe('conditionLabel', () => {
  it('returns design-name format', () => {
    const condition = createConditions('A')[0]

    expect(conditionLabel(condition)).toBe('A-no-gate')
  })

  it('works for all designs', () => {
    expect(conditionLabel(createConditions('B')[1])).toBe('B-coverage-ceilings')
    expect(conditionLabel(createConditions('D')[1])).toBe('D-weighted')
    expect(conditionLabel(createConditions('F')[1])).toBe('F-adjusted')
  })
})
