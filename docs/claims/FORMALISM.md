# Variable Formalism & Evidence as Descent

This note captures the layered view of formalism and evidentiary support for the paper
itself, modeled as a claim graph. It treats the paper as a proof system whose quality
can be optimized via a descent process analogous to the main thesis.

## Core Idea
The SGD‑style quality framework applies not only to code but also to **proof systems**.
A paper’s claims and evidence form a discrete graph that can be evaluated and iteratively
improved, producing descent behavior over *paper quality*.

## Variable Levels of Formalism
Edges in the claim graph can have different proof/evidence standards:

- **Deductive edges**: must be formally provable (proof assistants, lemma chains).
- **Empirical edges**: must be supported by experiments or citations.
- **Interpretive edges**: reasoned arguments or hypotheses (clearly labeled).

These form a hierarchy of rigor without forcing full formalization of every claim.

## Fitness as a Single Scalar (Optional)
Even though the graph is multi‑dimensional, you can collapse it into a scalar fitness:

```
fitness = w_defense * defensibility + w_deductive * proof_quality + w_empirical * evidence_quality
```

Where:
- **defensibility** = proportion of core claims with any valid support
- **proof_quality** = proportion of deductive edges with verified proofs
- **evidence_quality** = aggregate support scores on empirical edges

This mirrors the quality‑gate framing while keeping the optimization landscape simple.

## Two‑Layer Descent (Fractal Improvement)
There are two layers of optimization:

1) **Edge‑level descent**: improve individual edges by adding proofs, citations, or experiments.
2) **Graph‑level descent**: improve the overall structure (clarify claim dependencies, remove
   weak links, tighten definitions).

Each layer provides local improvements that aggregate into global progress.

## Differential Topology Analogy
Although the claim graph is discrete, treating edge support as a continuous score
(e.g., [0,1] support/coverage) yields a “pseudo‑differential” space that allows
smooth descent‑like behavior. This mirrors the main thesis: *deterministic metrics
on discrete objects can still produce gradient‑like dynamics*.

## Cross‑Domain Analogy
The paper’s formalization process is itself a concrete example of the paper’s thesis:
- **Domain**: formal reasoning instead of TypeScript
- **Agent**: human/LLM proof improver instead of LLM coder
- **Quality function**: claim‑graph metrics instead of test/coverage metrics

The analogy holds: deterministic quality gates on the proof graph guide stochastic
proposal steps toward stronger, more defensible claims.

## Implications
- The paper can self‑validate its own framework by using the same descent logic.
- Iterative refinement of the claim graph offers measurable, repeatable progress.
- Formal proofs can be prioritized where they yield maximal “quality gradient.”
