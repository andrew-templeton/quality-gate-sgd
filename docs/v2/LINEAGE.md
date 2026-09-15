# Dependency lineage and reusable evidence

An unchanged parent file does not establish that its derived data or rendered output is current. A changed stylesheet, source value, viewport, audience or evaluator can invalidate a previous observation. The lineage API binds those dependencies explicitly and checks receipts before reuse.

## Shared addresses and graph contract

`qualityAddress(kind, ...segments)` creates canonical addresses in four namespaces: `artifact`, `component`, `claim` and `assertion`. Use the same string in source inventories, graph nodes, findings, nudges and evidence records. For example, `qualityAddress('component', 'example', 'decision-panel')` is `quality://component/example/decision-panel`. Segments are escaped; empty and traversal segments are rejected. Addresses identify stable subjects, while digests identify their changing revisions.

`compileLineageGraph(nodes)` accepts a directed acyclic graph. Each node declares its address, kind, content digest, configuration digest, dependency addresses and availability. Kinds cover source, asset, derived, render, audience, policy, view, evaluator and judgment. `contentLineageNode` derives content/configuration digests for JSON or text. Binary surface adapters can hash actual bytes and construct the node directly.

Compilation snapshots and normalizes the graph. It rejects duplicate addresses, missing references and cycles. A node's revision binds its own content/configuration and the revisions of its dependencies, so a child change propagates through the entire dependent chain. Unavailable content has `contentDigest: null` and a reason; that unavailability propagates downstream. `validateLineageGraph` recomputes topology and derived revisions when reading a serialized graph rather than trusting its outer checksum.

`compareLineageGraphs(previous, current)` returns direct changes, transitive invalidations, additions, removals, unavailable nodes and unchanged reusable nodes. Its reuse category concerns matching available graph revisions. Reusing an actual observation additionally requires a matching receipt.

## Receipts and cache use

`createLineageReceipt(graph, requirement, value)` records a freshly obtained value with:

- The stable subject address and its transitive revision.
- The evaluator address, its transitive revision and full standard evaluator digest.
- The scoped input digest and output schema digest.
- The value digest and complete subject/evaluator dependency closure.

The evaluator node's `contentDigest` must be the standard contract's `evaluatorDigest` itself. Do not hash that digest again with `contentLineageNode`; construct the evaluator node using the already computed identity. Its dependency edges can additionally name the applicable audience, policy or environment inputs.

The schema digest binds the declared value contract; this lineage module does not execute that schema. Produce and consume values through the host's typed output bindings, or explicitly validate them with the corresponding schema at your adapter boundary.

`reuseLineageReceipt(currentGraph, receipt, currentRequirement)` returns `reusable` with a frozen value only when every binding matches and all required dependencies are available. Missing, corrupt, stale, differently scoped or otherwise incompatible evidence returns `unavailable` with a reason. A consuming assertion must preserve that unavailable result instead of replacing it with an empty report or a pass.

Receipts bind the subject's relevant closure rather than the whole graph digest. A changed CSS asset can invalidate panel geometry while leaving an independent arithmetic observation reusable. The caller's `inputDigest` must describe all of that evaluator's actual inputs. Narrowing it by omitting relevant inputs would violate the contract; using a whole-artifact input digest is conservative and may prevent otherwise useful independent reuse.

Graph content being available means the adapter supplied its declared bytes and dependencies. It is not proof that a render or quality judgment was recollected. After an invalidation, collect and verify the affected output before creating a new receipt. Re-sealing an old observation against the new graph would make a false provenance claim. Hashes cannot detect that lie, prove complete dependency coverage or authenticate the collector. The surface adapter owns actual byte collection, source/render correspondence, environment capture and the complete dependency inventory.

## Durable execution

`lineageEnvironmentDigest(graph, roots, context?)` binds chosen root closures and additional explicit environment context. Pass it as `environmentDigest` when opening a `DurableRun` and when evaluating under that run. Selecting relevant roots is an adapter obligation; a root omitted from both the graph closure and context cannot cause invalidation.

Reconstruct the graph from current sources before attempting resume. A changed child asset then changes the environment identity even if the parent file is byte-for-byte unchanged. The existing durable-run contract rejects reopening the old run under that changed identity. Explicit rebaselining keeps prior spending and archives the old checkpoint; it does not make old receipts current. Outstanding operations still require the durable API's reconciliation procedure.

This helper does not add a distributed transaction, automatically watch the filesystem or restart external work. It connects current evidence dependencies to the existing durable execution boundary.

## Typed prerequisite outputs

The host's `OutputEvidence` binds a producer assertion, evaluator, execution input, schema, value and upstream output receipts. Lineage receipts serve a complementary purpose: they bind the source/asset/environment dependencies behind an observation.

An engine-created output envelope can be the value inside a lineage receipt, using its evaluator/input/schema identities as the requirement. Successful reuse preserves the original envelope unchanged. Do not rewrite its producer or input identity to make it appear to belong to a different evaluation. If a current evaluation is authorized to reuse a cached scoped value, its assertion must first validate that cache receipt and return the value through the ordinary host output contract; the host validates the schema and creates the current output envelope itself.

This integration does not infer output semantic validity from a matching type. The module's card and substantive verification obligations still apply.

## Reproducible example and checks

After building the repository, run:

```sh
node examples/v2/lineage.mjs
npx vitest run tests/v2/lineage.test.ts
```

The example edits a real temporary CSS file while preserving its HTML parent. It shows geometry-receipt invalidation, reuse of an independent branch, rejected durable resume and retained spending after explicit rebaselining. Its geometry value is a labeled fixture; the example does not claim to collect browser measurements.

The tests additionally cover every declared environment facet, graph/configuration changes, missing/cyclic dependencies, unavailable sources, absent/corrupt receipts, serialized graph integrity and preservation of an actual engine-created typed output envelope. These are protocol and invalidation checks, not an empirical qualification of a semantic or visual verifier.
