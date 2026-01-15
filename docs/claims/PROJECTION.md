# Projection Measure (Design)

This document captures the plan for a future "projection measure" that scores how well
an external citation's claim graph supports a required claim subgraph in this paper.

## Problem
We want a fuzzy, quantitative notion of whether a cited paper *actually supports* the
claim(s) we cite it for. In graph terms:

- **Our paper** provides a claim subgraph `G_claim` (the required logic or evidence chain).
- **The cited paper** provides a claim graph `G_cite` (its own arguments, proofs, results).

The goal is a **projection score** that estimates how fully `G_claim` is covered by
`G_cite`.

## Data Model
We already have a claim graph JSON format (see `docs/claims/claim-graph.schema.json`).
To support projection, we will add two optional fields to the graph or evidence:

- `projectionScore`: a [0,1] scalar for how much of the claim subgraph is supported
- `projectionNotes`: a short explanation

These can be stored under `analysis` (graph-level) or under each `evidence` item
for a citation.

## Semantic Alignment
We need a mechanism to decide whether a node in `G_claim` is supported by a node
in `G_cite`.

Two possible strategies:

1) **LLM entailment scoring**
   - Prompt: "Does claim A entail/align with claim B?"
   - Output: support score in [0,1]

2) **Embedding similarity**
   - Compute embeddings for claim text
   - Use cosine similarity with a threshold to form alignment edges

A hybrid approach (embedding filter + LLM confirmation) gives the most reliable result.

## SHACL-Style Shape (Conceptual)
If we represent both graphs in RDF, we can define a SHACL shape that encodes
"all required claims must be supported." The shape is conceptual only for now.

Example (pseudo-SHACL):

```
ex:ClaimSupportShape
  a sh:NodeShape ;
  sh:targetClass ex:RequiredClaim ;
  sh:property [
    sh:path ex:supportedBy ;
    sh:minCount 1 ;
  ] .
```

The `supportedBy` property would be derived from semantic alignment
(LLM or embeddings) and support edges in `G_cite`.

## Proposed Projection Score
Let `R` be the set of required claim nodes in `G_claim`.
Let `S` be the subset of `R` for which at least one supporting path exists in `G_cite`.

```
projectionScore = |S| / |R|
```

Optionally weight by importance:

```
projectionScore = sum_i w_i * supported(i) / sum_i w_i
```

where `w_i` could be derived from claim role (core/supporting) and centrality.

## Integration Plan
1) Extract claim graphs for both papers.
2) Build alignment edges (LLM or embedding similarity).
3) Run a graph coverage check:
   - For each required claim in `G_claim`, find a support path in `G_cite`.
4) Compute projectionScore and store it in the claim graph `analysis`.

## Notes
- This is a design-only stub. No code exists yet.
- The same mechanism can drive a "citation adequacy" gate in the paper-quality
  analysis loop.
