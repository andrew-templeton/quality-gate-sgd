#!/usr/bin/env node
/*
  Claim Graph Tool
  ================
  Builds and analyzes a deterministic claim graph for papers.

  Usage examples:
    npx tsx scripts/claim-graph.ts extract --claims-md docs/theory/CLAIMS.md --out docs/claims/claim-graph.json
    npx tsx scripts/claim-graph.ts extract --input docs/CONCEPT.md --provider openai --model gpt-5.2 --out docs/claims/claim-graph.json
    npx tsx scripts/claim-graph.ts analyze --graph docs/claims/claim-graph.json --out docs/claims/claim-graph.analysis.json
    npx tsx scripts/claim-graph.ts score-citations --graph docs/claims/claim-graph.json --citations docs/claims/citations.json --provider anthropic --model opus-4.5 --out docs/claims/claim-graph.scored.json
*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type ClaimStatus = 'proven' | 'cited' | 'novel' | 'pending' | 'hypothesis';
type ClaimKind = 'definition' | 'assumption' | 'claim' | 'theorem' | 'lemma' | 'observation' | 'result';
type ClaimRole = 'core' | 'supporting' | 'optional';
type EvidenceKind = 'citation' | 'proof' | 'experiment' | 'argument';
type EdgeType = 'depends_on' | 'supports' | 'contradicts' | 'refines';

type Location = {
  path?: string;
  lineStart?: number;
  lineEnd?: number;
  sectionPath?: string[];
};

type Evidence = {
  kind: EvidenceKind;
  refId: string;
  supportScore?: number;
  coverageScore?: number;
  notes?: string;
};

type Claim = {
  id: string;
  text: string;
  kind?: ClaimKind;
  status: ClaimStatus;
  role?: ClaimRole;
  confidence?: number;
  categoryPath?: string[];
  source?: Location;
  dependsOn?: string[];
  evidence?: Evidence[];
  tags?: string[];
};

type Edge = {
  from: string;
  to: string;
  type: EdgeType;
  weight?: number;
};

type Reference = {
  id: string;
  kind: 'citation' | 'dataset' | 'artifact';
  title?: string;
  authors?: string;
  year?: number;
  venue?: string;
  summary?: string;
};

type ClaimGraph = {
  version: string;
  generatedAt?: string;
  sources?: { id: string; path: string; hash: string; kind?: string }[];
  claims: Claim[];
  edges?: Edge[];
  references?: Reference[];
  analysis?: Record<string, unknown>;
};

type CitationIndex = Record<string, Reference & { abstract?: string; keyClaims?: string[] }>;

type LlmProvider = 'openai' | 'anthropic';

type Args = {
  command?: string;
  inputs: string[];
  out?: string;
  graph?: string;
  claimsMd?: string;
  citations?: string;
  provider?: LlmProvider;
  model?: string;
  apiKey?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { inputs: [] };
  const rest = [...argv];
  args.command = rest.shift();

  while (rest.length > 0) {
    const token = rest.shift();
    if (!token) continue;
    switch (token) {
      case '--input':
      case '--inputs':
        if (rest[0]) args.inputs.push(rest.shift() as string);
        break;
      case '--out':
        args.out = rest.shift();
        break;
      case '--graph':
        args.graph = rest.shift();
        break;
      case '--claims-md':
        args.claimsMd = rest.shift();
        break;
      case '--citations':
        args.citations = rest.shift();
        break;
      case '--provider':
        args.provider = rest.shift() as LlmProvider;
        break;
      case '--model':
        args.model = rest.shift();
        break;
      case '--api-key':
        args.apiKey = rest.shift();
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Unknown flag: ${token}`);
        }
        args.inputs.push(token);
    }
  }

  return args;
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sha1(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function hashFileContents(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function claimId(text: string): string {
  return `C_${sha1(text).slice(0, 8)}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseClaimsMarkdown(filePath: string): ClaimGraph {
  const content = readText(filePath);
  const lines = content.split(/\r?\n/);
  const claims: Claim[] = [];
  const references = new Map<string, Reference>();
  const sectionPath: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    const headingMatch = /^(#+)\s+(.*)/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      sectionPath.length = Math.max(0, level - 1);
      sectionPath[level - 1] = title;
      continue;
    }

    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*-{2,}\s*\|/.test(line)) continue;

    const rawCells = line.split('|').map((cell) => cell.trim());
    if (rawCells.length < 4) continue;
    const cells = rawCells.slice(1, rawCells.length - 1);
    if (cells.length < 2) continue;

    const [claimText, typeCell, statusCell] = cells;
    if (!claimText || claimText.toLowerCase() === 'claim') continue;

    const typeToken = typeCell.replace(/\[|\]/g, '').trim();
    const statusText = statusCell || '';

    let status: ClaimStatus = 'pending';
    if (/math/i.test(typeToken)) status = 'proven';
    if (/novel/i.test(typeToken)) status = 'novel';
    if (/pending/i.test(typeToken)) status = 'pending';
    if (/cited/i.test(typeToken)) {
      status = /pending/i.test(statusText) ? 'pending' : 'cited';
    }

    const claim: Claim = {
      id: claimId(claimText),
      text: claimText,
      kind: 'claim',
      status,
      role: 'supporting',
      categoryPath: sectionPath.filter(Boolean),
      source: {
        path: filePath,
        lineStart: i + 1,
        lineEnd: i + 1,
        sectionPath: sectionPath.filter(Boolean),
      },
      evidence: [],
    };

    const citationMatch = statusText.split(':').slice(1).join(':').trim();
    if (citationMatch) {
      const refId = `bib_${slugify(citationMatch)}`;
      claim.evidence?.push({
        kind: 'citation',
        refId,
        notes: statusText,
      });
      if (!references.has(refId)) {
        references.set(refId, {
          id: refId,
          kind: 'citation',
          summary: citationMatch,
        });
      }
    }

    claims.push(claim);
  }

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sources: [
      {
        id: `src_${slugify(filePath)}`,
        path: filePath,
        hash: hashFileContents(content),
        kind: 'claims-md',
      },
    ],
    claims,
    edges: [],
    references: [...references.values()],
  };
}

type JsonSchemaFormat = {
  type: 'json_schema' | 'json_object' | 'text';
  strict?: boolean;
  schema?: Record<string, unknown>;
};

const CLAIM_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'status'],
        properties: {
          text: { type: 'string' },
          kind: {
            type: 'string',
            enum: [
              'definition',
              'assumption',
              'claim',
              'theorem',
              'lemma',
              'observation',
              'result',
            ],
          },
          status: {
            type: 'string',
            enum: ['proven', 'cited', 'novel', 'pending', 'hypothesis'],
          },
          role: {
            type: 'string',
            enum: ['core', 'supporting', 'optional'],
          },
          dependsOnIndices: {
            type: 'array',
            items: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fromIndex', 'toIndex', 'type'],
        properties: {
          fromIndex: { type: 'integer', minimum: 0 },
          toIndex: { type: 'integer', minimum: 0 },
          type: {
            type: 'string',
            enum: ['depends_on', 'supports', 'contradicts', 'refines'],
          },
        },
      },
    },
  },
};

const CITATION_SCORE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['supportScore', 'coverageScore'],
  properties: {
    supportScore: { type: 'number', minimum: 0, maximum: 1 },
    coverageScore: { type: 'number', minimum: 0, maximum: 1 },
    notes: { type: 'string' },
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function validateExtractionJson(payload: unknown): payload is {
  claims: Array<{
    text: string;
    kind?: ClaimKind;
    status: ClaimStatus;
    role?: ClaimRole;
    dependsOnIndices?: number[];
  }>;
  edges?: Array<{ fromIndex: number; toIndex: number; type: EdgeType }>;
} {
  const data = asObject(payload);
  if (!data) return false;
  if (!Array.isArray(data.claims)) return false;
  for (const claim of data.claims) {
    const obj = asObject(claim);
    if (!obj) return false;
    if (typeof obj.text !== 'string' || obj.text.trim().length === 0) return false;
    if (
      ![
        'proven',
        'cited',
        'novel',
        'pending',
        'hypothesis',
      ].includes(String(obj.status))
    ) {
      return false;
    }
    if (obj.kind && !['definition', 'assumption', 'claim', 'theorem', 'lemma', 'observation', 'result'].includes(String(obj.kind))) {
      return false;
    }
    if (obj.role && !['core', 'supporting', 'optional'].includes(String(obj.role))) {
      return false;
    }
    if (obj.dependsOnIndices) {
      if (!Array.isArray(obj.dependsOnIndices)) return false;
      if (!obj.dependsOnIndices.every((value) => Number.isInteger(value) && value >= 0)) return false;
    }
  }

  if (data.edges) {
    if (!Array.isArray(data.edges)) return false;
    for (const edge of data.edges) {
      const obj = asObject(edge);
      if (!obj) return false;
      if (!Number.isInteger(obj.fromIndex) || !Number.isInteger(obj.toIndex)) return false;
      if (!['depends_on', 'supports', 'contradicts', 'refines'].includes(String(obj.type))) {
        return false;
      }
    }
  }

  return true;
}

function validateCitationScoreJson(payload: unknown): payload is {
  supportScore: number;
  coverageScore: number;
  notes?: string;
} {
  const data = asObject(payload);
  if (!data) return false;
  const supportScore = data.supportScore;
  const coverageScore = data.coverageScore;
  if (typeof supportScore !== 'number' || supportScore < 0 || supportScore > 1) return false;
  if (typeof coverageScore !== 'number' || coverageScore < 0 || coverageScore > 1) return false;
  if (data.notes && typeof data.notes !== 'string') return false;
  return true;
}

function strictJsonParse(content: string): unknown {
  return JSON.parse(content);
}

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }

  const chunks: string[] = [];
  for (const item of data.output || []) {
    if (!item || item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && content.text) {
        chunks.push(content.text);
      }
    }
  }

  if (chunks.length === 0) return null;
  return chunks.join('');
}

async function callOpenAI(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  format: JsonSchemaFormat
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: system,
      input: user,
      temperature: 0,
      text: { format },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as unknown;
  const content = extractResponseText(data);
  if (!content) {
    throw new Error('OpenAI Responses API returned empty response');
  }
  return content;
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    content?: { text?: string }[];
  };
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error('Anthropic API returned empty response');
  }
  return content;
}

async function callLlm(provider: LlmProvider, model: string, system: string, user: string, apiKey?: string): Promise<string> {
  const key = apiKey || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
  if (!key) {
    throw new Error(`Missing API key for ${provider}. Use --api-key or set env.`);
  }

  if (provider === 'openai') {
    return callOpenAI(key, model, system, user, { type: 'text' });
  }
  return callAnthropic(key, model, system, user);
}

async function callLlmJson<T>(
  provider: LlmProvider,
  model: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  validate: (payload: unknown) => payload is T,
  apiKey?: string
): Promise<T> {
  const key = apiKey || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
  if (!key) {
    throw new Error(`Missing API key for ${provider}. Use --api-key or set env.`);
  }

  let content: string;
  if (provider === 'openai') {
    try {
      content = await callOpenAI(key, model, system, user, {
        type: 'json_schema',
        strict: true,
        schema,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/json_schema|format|schema/i.test(message)) {
        throw error;
      }
      content = await callOpenAI(key, model, system, user, { type: 'json_object' });
    }
  } else {
    const jsonSystem = `${system} You must respond with valid JSON.`;
    content = await callAnthropic(key, model, jsonSystem, user);
  }

  let parsed: unknown;
  try {
    parsed = strictJsonParse(content);
  } catch (error) {
    throw new Error(`LLM returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!validate(parsed)) {
    throw new Error('LLM JSON did not match expected schema');
  }

  return parsed;
}

async function extractWithLlm(inputs: string[], provider: LlmProvider, model: string, apiKey?: string): Promise<ClaimGraph> {
  const claims: Claim[] = [];
  const edges: Edge[] = [];
  const sources: ClaimGraph['sources'] = [];

  for (const input of inputs) {
    const content = readText(input);
    sources?.push({
      id: `src_${slugify(input)}`,
      path: input,
      hash: hashFileContents(content),
      kind: 'markdown',
    });

    const system =
      'You extract formal claims from text and output JSON only. Do not include backticks or commentary.';
    const user = `Extract claims from the following text. Output JSON with keys: claims, edges.\n\nSchema:\nclaims: [{text, kind, status, role, dependsOnIndices}]\nedges: [{fromIndex,toIndex,type}]\n\nConstraints:\n- status in {proven,cited,novel,pending,hypothesis}\n- kind in {definition,assumption,claim,theorem,lemma,observation,result}\n- role in {core,supporting,optional}\n- dependsOnIndices uses numeric indexes into claims array\n\nText:\n${content}`;

    const parsed = await callLlmJson(
      provider,
      model,
      system,
      user,
      CLAIM_EXTRACTION_SCHEMA,
      validateExtractionJson,
      apiKey
    );

    const claimIds: string[] = parsed.claims.map((claim) => claimId(claim.text));
    for (let i = 0; i < parsed.claims.length; i += 1) {
      const claim = parsed.claims[i];
      const id = claimIds[i];
      claims.push({
        id,
        text: claim.text,
        kind: claim.kind ?? 'claim',
        status: claim.status,
        role: claim.role ?? 'supporting',
        dependsOn: claim.dependsOnIndices?.map((idx) => claimIds[idx]).filter(Boolean),
        source: { path: input },
      });
    }

    for (const edge of parsed.edges || []) {
      const from = claimIds[edge.fromIndex];
      const to = claimIds[edge.toIndex];
      if (from && to) {
        edges.push({ from, to, type: edge.type });
      }
    }
  }

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sources,
    claims,
    edges,
  };
}

function mergeGraphs(base: ClaimGraph, extra: ClaimGraph): ClaimGraph {
  const claimMap = new Map<string, Claim>();
  for (const claim of base.claims) {
    claimMap.set(claim.id, claim);
  }
  for (const claim of extra.claims) {
    if (!claimMap.has(claim.id)) {
      claimMap.set(claim.id, claim);
    }
  }

  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  for (const edge of [...(base.edges ?? []), ...(extra.edges ?? [])]) {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push(edge);
    }
  }

  const refMap = new Map<string, Reference>();
  for (const ref of [...(base.references ?? []), ...(extra.references ?? [])]) {
    if (!refMap.has(ref.id)) {
      refMap.set(ref.id, ref);
    }
  }

  return {
    version: base.version,
    generatedAt: new Date().toISOString(),
    sources: [...(base.sources ?? []), ...(extra.sources ?? [])],
    claims: [...claimMap.values()],
    edges,
    references: [...refMap.values()],
  };
}

function analyzeGraph(graph: ClaimGraph): ClaimGraph {
  const claims = graph.claims;
  const edges = graph.edges ?? [];

  const statusCounts = claims.reduce<Record<string, number>>((acc, claim) => {
    acc[claim.status] = (acc[claim.status] || 0) + 1;
    return acc;
  }, {});

  const totalClaims = claims.length;
  const coreClaims = claims.filter((c) => c.role === 'core');

  const maxSupportScore = (claim: Claim): number => {
    const evidence = claim.evidence || [];
    const scores = evidence.map((e) => e.supportScore ?? 0);
    return scores.length > 0 ? Math.max(...scores) : 0;
  };

  const isSupported = (claim: Claim): boolean => {
    if (claim.status === 'proven') return true;
    if (claim.status === 'cited') return (claim.evidence || []).some((e) => e.kind === 'citation');
    const best = maxSupportScore(claim);
    return best >= 0.6;
  };

  const supportedClaims = claims.filter(isSupported);
  const coreSupported = coreClaims.filter(isSupported);

  const novelMissingValidation = claims.filter(
    (claim) =>
      claim.status === 'novel' &&
      !(claim.evidence || []).some((e) => e.kind === 'experiment')
  );
  const novelClaims = claims.filter((claim) => claim.status === 'novel');
  const novelValidated = novelClaims.length - novelMissingValidation.length;

  const avgSupport = (() => {
    const scores = claims
      .flatMap((claim) => claim.evidence || [])
      .map((e) => e.supportScore)
      .filter((score): score is number => typeof score === 'number');
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  })();

  const roleWeight = (role?: ClaimRole): number => {
    if (role === 'core') return 1;
    if (role === 'optional') return 0.3;
    return 0.6;
  };

  const statusWeight = (status: ClaimStatus): number => {
    switch (status) {
      case 'pending':
      case 'novel':
        return 1;
      case 'hypothesis':
        return 0.7;
      case 'cited':
        return 0.4;
      case 'proven':
        return 0.2;
      default:
        return 0.6;
    }
  };

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== 'depends_on') continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  const descendantCount = (start: string): number => {
    const visited = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const next of outgoing.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    return visited.size;
  };

  const maxDesc = Math.max(
    1,
    ...claims.map((claim) => descendantCount(claim.id))
  );

  const priorities = claims
    .map((claim) => {
      const supportGap = 1 - maxSupportScore(claim);
      const centrality = descendantCount(claim.id) / maxDesc;
      const priority =
        0.4 * supportGap + 0.25 * roleWeight(claim.role) + 0.2 * statusWeight(claim.status) + 0.15 * centrality;
      return {
        id: claim.id,
        text: claim.text,
        priority: Number(priority.toFixed(4)),
        supportGap: Number(supportGap.toFixed(4)),
        role: claim.role ?? 'supporting',
        status: claim.status,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  const analysis = {
    totalClaims,
    statusCounts,
    supportedClaims: supportedClaims.length,
    coreClaims: coreClaims.length,
    coreSupported: coreSupported.length,
    claimCoverage: totalClaims > 0 ? Number((supportedClaims.length / totalClaims).toFixed(4)) : 0,
    coreCoverage: coreClaims.length > 0 ? Number((coreSupported.length / coreClaims.length).toFixed(4)) : 0,
    novelValidationRate:
      novelClaims.length > 0 ? Number((novelValidated / novelClaims.length).toFixed(4)) : 1,
    novelMissingValidation: novelMissingValidation.length,
    averageSupportScore: Number(avgSupport.toFixed(4)),
    priorities: priorities.slice(0, 25),
  };

  return {
    ...graph,
    analysis,
  };
}

async function scoreCitations(
  graph: ClaimGraph,
  citations: CitationIndex,
  provider: LlmProvider,
  model: string,
  apiKey?: string
): Promise<ClaimGraph> {
  const updatedClaims: Claim[] = [];

  for (const claim of graph.claims) {
    if (!claim.evidence || claim.evidence.length === 0) {
      updatedClaims.push(claim);
      continue;
    }

    const evidenceUpdates: Evidence[] = [];
    for (const evidence of claim.evidence) {
      if (evidence.kind !== 'citation') {
        evidenceUpdates.push(evidence);
        continue;
      }

      if (typeof evidence.supportScore === 'number' && typeof evidence.coverageScore === 'number') {
        evidenceUpdates.push(evidence);
        continue;
      }

      const citation = citations[evidence.refId];
      if (!citation) {
        evidenceUpdates.push({ ...evidence, notes: 'Missing citation metadata' });
        continue;
      }

      const system = 'You score citation support for claims. Output JSON only.';
      const user = `Claim:\n${claim.text}\n\nCitation metadata:\n${JSON.stringify(citation)}\n\nReturn JSON with keys: supportScore (0-1), coverageScore (0-1), notes (short).`;

      const parsed = await callLlmJson(
        provider,
        model,
        system,
        user,
        CITATION_SCORE_SCHEMA,
        validateCitationScoreJson,
        apiKey
      );

      evidenceUpdates.push({
        ...evidence,
        supportScore: parsed.supportScore,
        coverageScore: parsed.coverageScore,
        notes: parsed.notes,
      });
    }

    updatedClaims.push({ ...claim, evidence: evidenceUpdates });
  }

  return {
    ...graph,
    claims: updatedClaims,
  };
}

function usage(): void {
  const text = `Claim Graph Tool\n\nCommands:\n  extract         Extract claims from markdown and/or claims table\n  analyze         Compute quality metrics and priorities\n  score-citations Score citation support using LLMs\n\nRun with --help in the README for examples.`;
  // eslint-disable-next-line no-console
  console.log(text);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    usage();
    return;
  }

  if (args.command === 'extract') {
    let graph: ClaimGraph | null = null;

    if (args.claimsMd) {
      graph = parseClaimsMarkdown(args.claimsMd);
      if (args.inputs.length === 0) {
        if (!args.out) throw new Error('Missing --out');
        writeJson(args.out, graph);
        return;
      }
    }

    if (args.inputs.length > 0) {
      if (!args.provider || !args.model) {
        throw new Error('Missing --provider or --model for LLM extraction');
      }
      const extracted = await extractWithLlm(args.inputs, args.provider, args.model, args.apiKey);
      graph = graph ? mergeGraphs(graph, extracted) : extracted;
    }

    if (!graph) {
      throw new Error('Nothing to extract. Provide --claims-md and/or --input.');
    }

    if (!args.out) throw new Error('Missing --out');
    writeJson(args.out, graph);
    return;
  }

  if (args.command === 'analyze') {
    if (!args.graph || !args.out) {
      throw new Error('Missing --graph or --out');
    }
    const graph = JSON.parse(readText(args.graph)) as ClaimGraph;
    const analyzed = analyzeGraph(graph);
    writeJson(args.out, analyzed);
    return;
  }

  if (args.command === 'score-citations') {
    if (!args.graph || !args.citations || !args.out || !args.provider || !args.model) {
      throw new Error('Missing required flags for score-citations');
    }
    const graph = JSON.parse(readText(args.graph)) as ClaimGraph;
    const citations = JSON.parse(readText(args.citations)) as CitationIndex;
    const scored = await scoreCitations(graph, citations, args.provider, args.model, args.apiKey);
    writeJson(args.out, scored);
    return;
  }

  usage();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
