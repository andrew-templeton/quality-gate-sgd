import { ASSERTION_ZOO } from './catalog.js';

/** Transport-neutral resource descriptors; a caller may register them with its own MCP server. */
export const RESOURCES = [{
  uri: 'quality://v2/assertion-zoo',
  name: 'V2 Assertion Taxonomy and Composition Contract',
  description: 'Assertion families and the declared guarantees of interoperable quality modules.',
  mimeType: 'application/json',
}] as const;

export function readResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } | undefined {
  if (uri !== RESOURCES[0].uri) return undefined;
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
    schemaVersion: 2, families: ASSERTION_ZOO,
    cardFields: ['id', 'version', 'path', 'input', 'claim', 'evidenceKind', 'assumptions', 'guarantees', 'doesNotGuarantee', 'requires', 'costUpperBound', 'calibration', 'remediation'],
    outputSchema: 'quality-sgd Observation v2: status, addressed findings, evidence, optional loss bounds with unit, actual cost by unit',
    composition: 'Required predicates and prerequisites form a conjunction. Advisory checks cannot offset a failure. Missing evidence is unavailable. No composite confidence is inferred.',
    use: 'Use compileGate/discoverAssertions/modelCard, or quality-gate-v2 zoo/card/run. Register this descriptor with a separately supplied transport if needed.',
  }, null, 2) }] };
}
