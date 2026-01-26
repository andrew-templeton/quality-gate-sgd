/**
 * Defaults Module Tests
 * =====================
 * Tests for embedded default rules (zero-config mode)
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultRules,
  isEmbeddedDefaults,
  COVERAGE_ONLY_DEFAULTS,
  FULL_DEFAULTS,
} from '../src/defaults.js';

describe('Embedded Defaults', () => {
  describe('COVERAGE_ONLY_DEFAULTS', () => {
    it('has version marker for embedded defaults', () => {
      expect(COVERAGE_ONLY_DEFAULTS.version).toBe('0.0.0-embedded');
    });

    it('has description indicating zero-config mode', () => {
      expect(COVERAGE_ONLY_DEFAULTS.description.toLowerCase()).toContain('zero-config');
      expect(COVERAGE_ONLY_DEFAULTS.description.toLowerCase()).toContain('coverage-only');
    });

    it('has reasonable floor thresholds', () => {
      expect(COVERAGE_ONLY_DEFAULTS.rules.floors).toBeDefined();
      const floors = COVERAGE_ONLY_DEFAULTS.rules.floors!;
      expect(floors['coverage.unit.branches']).toBe(50);
      expect(floors['coverage.unit.statements']).toBe(50);
    });

    it('has ceiling for build errors', () => {
      expect(COVERAGE_ONLY_DEFAULTS.rules.ceilings).toBeDefined();
      const ceilings = COVERAGE_ONLY_DEFAULTS.rules.ceilings!;
      expect(ceilings['typescript.errors']).toBe(0);
      expect(ceilings['eslint.errors']).toBe(0);
    });

    it('does NOT have SonarQube ceilings', () => {
      const ceilings = COVERAGE_ONLY_DEFAULTS.rules.ceilings!;
      expect(ceilings['sonarqube.blocker']).toBeUndefined();
      expect(ceilings['sonarqube.critical']).toBeUndefined();
    });

    it('has monotonic rules for coverage', () => {
      expect(COVERAGE_ONLY_DEFAULTS.rules.monotonic).toBeDefined();
      const monotonic = COVERAGE_ONLY_DEFAULTS.rules.monotonic!;

      const upRule = monotonic.find(r => r.direction === 'up');
      expect(upRule).toBeDefined();
      expect(upRule!.metrics).toContain('coverage.unit.branches');
      expect(upRule!.metrics).toContain('coverage.unit.statements');
    });

    it('has monotonic rules for errors', () => {
      const monotonic = COVERAGE_ONLY_DEFAULTS.rules.monotonic!;

      const downRule = monotonic.find(r => r.direction === 'down');
      expect(downRule).toBeDefined();
      expect(downRule!.metrics).toContain('typescript.errors');
      expect(downRule!.metrics).toContain('eslint.errors');
    });

    it('has no required scripts by default', () => {
      expect(COVERAGE_ONLY_DEFAULTS.rules.requiredScripts).toEqual([]);
    });
  });

  describe('FULL_DEFAULTS', () => {
    it('has version marker for embedded defaults', () => {
      expect(FULL_DEFAULTS.version).toBe('0.0.0-embedded');
    });

    it('has description indicating full mode', () => {
      expect(FULL_DEFAULTS.description.toLowerCase()).toContain('zero-config');
      expect(FULL_DEFAULTS.description.toLowerCase()).toContain('full');
    });

    it('has SonarQube ceilings', () => {
      expect(FULL_DEFAULTS.rules.ceilings).toBeDefined();
      const ceilings = FULL_DEFAULTS.rules.ceilings!;
      expect(ceilings['sonarqube.blocker']).toBe(0);
      expect(ceilings['sonarqube.critical']).toBe(0);
      expect(ceilings['sonarqube.major']).toBe(10);
    });

    it('has monotonic rules for SonarQube metrics', () => {
      const monotonic = FULL_DEFAULTS.rules.monotonic!;

      const downRule = monotonic.find(r =>
        r.direction === 'down' && r.metrics.includes('sonarqube.bugs')
      );
      expect(downRule).toBeDefined();
      expect(downRule!.metrics).toContain('sonarqube.vulnerabilities');
      expect(downRule!.metrics).toContain('sonarqube.blocker');
    });
  });

  describe('getDefaultRules', () => {
    it('returns coverage-only defaults when coverageOnly is true', () => {
      const rules = getDefaultRules(true);
      expect(rules).toEqual(COVERAGE_ONLY_DEFAULTS);
    });

    it('returns full defaults when coverageOnly is false', () => {
      const rules = getDefaultRules(false);
      expect(rules).toEqual(FULL_DEFAULTS);
    });
  });

  describe('isEmbeddedDefaults', () => {
    it('returns true for coverage-only defaults', () => {
      expect(isEmbeddedDefaults(COVERAGE_ONLY_DEFAULTS)).toBe(true);
    });

    it('returns true for full defaults', () => {
      expect(isEmbeddedDefaults(FULL_DEFAULTS)).toBe(true);
    });

    it('returns true for any rules with embedded version', () => {
      expect(isEmbeddedDefaults({
        version: '0.0.0-embedded',
        description: 'custom',
        rules: {},
      })).toBe(true);
    });

    it('returns false for custom rules', () => {
      expect(isEmbeddedDefaults({
        version: '1.0.0',
        description: 'custom',
        rules: {},
      })).toBe(false);
    });

    it('returns false for versioned rules', () => {
      expect(isEmbeddedDefaults({
        version: '2.1.0',
        description: 'My project rules',
        rules: {
          floors: { 'coverage.unit.branches': 80 },
        },
      })).toBe(false);
    });
  });
});

describe('Default Rules Structure', () => {
  it('coverage-only defaults are valid QualityRules', () => {
    const rules = COVERAGE_ONLY_DEFAULTS;

    // Required fields
    expect(typeof rules.version).toBe('string');
    expect(typeof rules.description).toBe('string');
    expect(typeof rules.rules).toBe('object');

    // Optional rule types
    if (rules.rules.floors) {
      for (const [key, value] of Object.entries(rules.rules.floors)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('number');
      }
    }

    if (rules.rules.ceilings) {
      for (const [key, value] of Object.entries(rules.rules.ceilings)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('number');
      }
    }

    if (rules.rules.monotonic) {
      for (const rule of rules.rules.monotonic) {
        expect(['up', 'down']).toContain(rule.direction);
        expect(Array.isArray(rule.metrics)).toBe(true);
      }
    }

    if (rules.rules.requiredScripts) {
      expect(Array.isArray(rules.rules.requiredScripts)).toBe(true);
    }
  });

  it('full defaults are valid QualityRules', () => {
    const rules = FULL_DEFAULTS;

    expect(typeof rules.version).toBe('string');
    expect(typeof rules.description).toBe('string');
    expect(typeof rules.rules).toBe('object');
  });
});
