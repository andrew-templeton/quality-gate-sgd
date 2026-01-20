import { describe, it, expect, beforeEach } from 'vitest'
import {
  BUILTIN_DIMENSIONS,
  registerDimension,
  clearCustomDimensions,
  getDimension,
  getAllDimensions,
  getValidPaths,
  validatePath,
  getDimensionsByCategory,
  getDimensionsByContinuity,
  getSmoothDimensions,
  getConstraintDimensions,
  formatDimensionsTable,
  generateDimensionsDoc,
  type DimensionDef,
} from '../../src/dimensions/registry.js'

describe('Dimension Registry', () => {
  beforeEach(() => {
    clearCustomDimensions()
  })

  describe('BUILTIN_DIMENSIONS', () => {
    it('contains coverage dimensions', () => {
      const coverageDims = BUILTIN_DIMENSIONS.filter(d => d.category === 'coverage')
      expect(coverageDims.length).toBeGreaterThan(0)
      expect(coverageDims.some(d => d.path === 'coverage.unit.branches')).toBe(true)
    })

    it('contains error dimensions', () => {
      const errorDims = BUILTIN_DIMENSIONS.filter(d => d.category === 'errors')
      expect(errorDims.length).toBeGreaterThan(0)
      expect(errorDims.some(d => d.path === 'typescript.errors')).toBe(true)
    })

    it('has valid dimension definitions', () => {
      for (const dim of BUILTIN_DIMENSIONS) {
        expect(dim.path).toBeTruthy()
        expect(dim.displayName).toBeTruthy()
        expect(dim.description).toBeTruthy()
        expect(['percentage', 'count', 'density']).toContain(dim.unit)
        expect(['higher-better', 'lower-better']).toContain(dim.direction)
        expect(['smooth', 'discrete', 'binary']).toContain(dim.continuity)
        expect(dim.defaultWeight).toBeGreaterThanOrEqual(0)
        expect(dim.defaultWeight).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('registerDimension', () => {
    it('adds a new custom dimension', () => {
      const customDim: DimensionDef = {
        path: 'custom.myMetric',
        displayName: 'My Custom Metric',
        description: 'A custom metric for testing',
        unit: 'count',
        direction: 'lower-better',
        continuity: 'discrete',
        defaultWeight: 0.1,
        category: 'custom',
      }

      registerDimension(customDim)

      const retrieved = getDimension('custom.myMetric')
      expect(retrieved).toBeDefined()
      expect(retrieved?.displayName).toBe('My Custom Metric')
    })

    it('can be cleared with clearCustomDimensions', () => {
      const customDim: DimensionDef = {
        path: 'custom.toBeCleared',
        displayName: 'To Be Cleared',
        description: 'Will be removed',
        unit: 'count',
        direction: 'lower-better',
        continuity: 'discrete',
        defaultWeight: 0.1,
        category: 'custom',
      }

      registerDimension(customDim)
      expect(getDimension('custom.toBeCleared')).toBeDefined()

      clearCustomDimensions()
      expect(getDimension('custom.toBeCleared')).toBeUndefined()
    })
  })

  describe('getDimension', () => {
    it('returns builtin dimension by path', () => {
      const dim = getDimension('coverage.unit.branches')
      expect(dim).toBeDefined()
      expect(dim?.displayName).toBe('Unit Branch Coverage')
    })

    it('returns undefined for unknown path', () => {
      const dim = getDimension('unknown.metric.path')
      expect(dim).toBeUndefined()
    })
  })

  describe('getAllDimensions', () => {
    it('returns all builtin dimensions', () => {
      const dims = getAllDimensions()
      expect(dims.length).toBe(BUILTIN_DIMENSIONS.length)
    })

    it('includes custom dimensions after registration', () => {
      const customDim: DimensionDef = {
        path: 'custom.extra',
        displayName: 'Extra',
        description: 'Extra metric',
        unit: 'count',
        direction: 'lower-better',
        continuity: 'discrete',
        defaultWeight: 0.1,
        category: 'custom',
      }

      const beforeCount = getAllDimensions().length
      registerDimension(customDim)
      const afterCount = getAllDimensions().length

      expect(afterCount).toBe(beforeCount + 1)
    })
  })

  describe('getValidPaths', () => {
    it('returns array of path strings', () => {
      const paths = getValidPaths()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
      expect(paths).toContain('coverage.unit.branches')
    })
  })

  describe('validatePath', () => {
    it('returns true for valid builtin paths', () => {
      expect(validatePath('coverage.unit.branches')).toBe(true)
      expect(validatePath('typescript.errors')).toBe(true)
    })

    it('returns false for invalid paths', () => {
      expect(validatePath('invalid.metric')).toBe(false)
      expect(validatePath('notreal')).toBe(false)
    })

    it('returns true for registered custom paths', () => {
      const customDim: DimensionDef = {
        path: 'custom.validated',
        displayName: 'Validated',
        description: 'For validation test',
        unit: 'count',
        direction: 'lower-better',
        continuity: 'discrete',
        defaultWeight: 0.1,
        category: 'custom',
      }

      registerDimension(customDim)
      expect(validatePath('custom.validated')).toBe(true)
    })
  })

  describe('getDimensionsByCategory', () => {
    it('returns only coverage dimensions for coverage category', () => {
      const coverageDims = getDimensionsByCategory('coverage')
      expect(coverageDims.every(d => d.category === 'coverage')).toBe(true)
    })

    it('returns only error dimensions for errors category', () => {
      const errorDims = getDimensionsByCategory('errors')
      expect(errorDims.every(d => d.category === 'errors')).toBe(true)
    })

    it('returns only quality dimensions for quality category', () => {
      const qualityDims = getDimensionsByCategory('quality')
      expect(qualityDims.every(d => d.category === 'quality')).toBe(true)
    })
  })

  describe('getDimensionsByContinuity', () => {
    it('returns smooth dimensions', () => {
      const smoothDims = getDimensionsByContinuity('smooth')
      expect(smoothDims.every(d => d.continuity === 'smooth')).toBe(true)
      expect(smoothDims.length).toBeGreaterThan(0)
    })

    it('returns discrete dimensions', () => {
      const discreteDims = getDimensionsByContinuity('discrete')
      expect(discreteDims.every(d => d.continuity === 'discrete')).toBe(true)
    })
  })

  describe('getSmoothDimensions', () => {
    it('returns dimensions with smooth continuity', () => {
      const smoothDims = getSmoothDimensions()
      expect(smoothDims.every(d => d.continuity === 'smooth')).toBe(true)
    })
  })

  describe('getConstraintDimensions', () => {
    it('returns dimensions not ideal for SGD (discrete or binary)', () => {
      const constraintDims = getConstraintDimensions()
      expect(constraintDims.every(d =>
        d.continuity === 'discrete' || d.continuity === 'binary'
      )).toBe(true)
    })
  })

  describe('formatDimensionsTable', () => {
    it('returns formatted markdown table', () => {
      const table = formatDimensionsTable()
      expect(table).toContain('Path')
      expect(table).toContain('Direction')
      expect(table).toContain('coverage.unit.branches')
    })

    it('accepts subset of dimensions', () => {
      const coverageDims = getDimensionsByCategory('coverage')
      const table = formatDimensionsTable(coverageDims)
      expect(table).toContain('coverage.')
      expect(table).not.toContain('typescript.errors')
    })
  })

  describe('generateDimensionsDoc', () => {
    it('returns documentation string', () => {
      const doc = generateDimensionsDoc()
      expect(doc).toContain('# Quality Dimensions')
      expect(doc).toContain('Coverage')
      expect(doc).toContain('coverage.unit.branches')
    })

    it('includes descriptions', () => {
      const doc = generateDimensionsDoc()
      expect(doc).toContain('Percentage of code branches')
    })
  })
})
