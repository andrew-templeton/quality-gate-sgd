# Rendered surface evidence

`surfaceEvidenceModule` verifies four independent assertions against a frozen operator policy: `surface.inventory`, `surface.geometry`, `surface.total-budget`, and `surface.novel-budget`. It does not launch a browser. The optional [Playwright collector](../../examples/v2/rendered/README.md) produces actual browser evidence using public package imports and keeps browser dependencies in its own example package.

```js
import { surfaceEvidenceModule, SURFACE_INPUT, SURFACE_OUTPUT } from 'quality-gate-sgd';

const module = surfaceEvidenceModule({ policy, reportPath: ['surface'] });
// Supply SURFACE_INPUT in the evaluation's available declarations.
// Passing assertions emit SURFACE_OUTPUT for typed downstream prerequisites.
```

## Independent policy and identities

The operator policy supplies the complete required route/viewport/interaction/input matrix, semantic addresses and exact reviewed text, known concepts, per-state total/novel caps, required elements, essential entry elements, actions, and geometry/burden limits. Both policy and evidence reject unsupported fields. Candidate HTML attributes cannot change caps, audience knowledge, grouping, or required states.

An inventory item represents one independently meaningful decision element. Its `concepts` and `defines` are separately reviewed, inspectable sets. Quantity plus unit, time period and population may form one quantity in context; a comparison or action is an additional item. A diagram does not automatically collapse its meaning into one item. The included collector gives candidate-declared groups no compression credit and requires a separate collector for non-DOM visuals.

The artifact identity is `digest({sourceDigest, dataDigest})`. The collector saves the actual route response bodies, their manifest, source data, and environment receipt. Environment includes the browser version, platform/user agent, a fixed system-font metric probe, font loading status, DPR/zoom/scrolling model, locale, timezone, and trusted policy digest. Each required state records viewport, entry route, interaction, text fragments, screenshots, action traces and defects. `renderDigest` covers the complete report except itself. Each screenshot has its own byte digest.

The evaluator checks current artifact/environment identities, collector/policy pinning, report integrity, exact required-state coverage, action coverage, screenshot references, and independently recomputed viewport membership. These are integrity and completeness checks within the declared collector model. Hashes do not attest that an arbitrary producer honestly ran a browser. Pin an audited collector and retain its source and pixel artifacts; do not give a candidate authority over evidence production or the reviewed inventory.

## Viewport accounting

This first collector explicitly supports stationary DOM text, a single stationary top chrome band, DPR 1, zoom 1, and integer CSS pixel scrolling. It probes fractional scroll requests and records the observed quantization; unsupported fractional scrolling or moving geometry makes the evidence unavailable. This restriction is part of the policy, evidence schema and assertion claims.

For each text fragment, visible membership changes when its top enters the viewport bottom or its bottom leaves the usable top below chrome. `surfaceWindowStarts` samples floor and ceiling around those possibly fractional boundaries, interval midpoints, natural section starts, page top and page end. It therefore covers every distinct membership reachable at the supported integer scroll positions, including positions between arbitrary disjoint bins. The real browser suite additionally enumerates **every integer scroll position** and checks that its membership is represented. No text parent is assigned to a fold solely by its top coordinate; wrapped text contributes its individual rendered fragments. Partially visible items count and an item's repeated fragments still count once in a window.

`surfaceWindows` exposes `total`, `novel`, and `unexplained` memberships behind the counts. Novel concepts come from the trusted inventory minus declared prior knowledge, not candidate annotations. A concept needs a reviewed explanation present in that window. No tooltip, prior scroll, or earlier route is treated as evidence of learning. Every independently entered/opened state starts from the declared prior knowledge.

Closed and open views can have different **predeclared** caps. The public fixture uses seven total items for closed states, nine for open states, and two novel concepts per state, all provisional design budgets. They are not universal capacity estimates or Shannon information measurements. Font, target, blank-gap, scrolling and entry-view obligations prevent meeting a density cap by making type tiny, padding important content out of view, or concealing a material cost/condition. Sensible spacing remains a design option within those unchanged constraints; these checks do not claim to detect every possible adversarial visual design.

## Geometry and interaction scope

The collector obtains real text ranges and detects overlapping text, ancestor clipping, horizontal overflow, covered text centers, and unsupported moving geometry. It checks opaque text contrast at a conservative 4.5:1 minimum. Actions are reached with actual sequential Tab/Enter or Playwright touch input; direct `focus()` does not establish keyboard reachability. It records focus outline, target dimensions, center-point visibility and the operator-specified resulting effect. Focus-visible is required for keyboard input. Touch activation has its own observed reachability and size requirements.

Unsupported canvas/SVG/image/iframe/video/background visuals, generated CSS content, transforms, translucency/blending/filter/clip-path behavior, animation, undeclared resources, failed fonts or scripts, source/data races, unreachable required states, and incomplete captures remain unavailable. This collector intentionally targets a small inspectable DOM model. It does not claim comprehensive accessibility certification, screen-reader compatibility, real physical-device testing, arbitrary application coverage or general overlap detection for every pixel. Playwright touch here is browser emulation, not a physical touchscreen study.

Every passing facet emits the same typed `SURFACE_OUTPUT` identity summary: artifact, environment, render, policy and collector digests. A downstream conjunction can require each facet separately and verify common provenance without flattening their guarantees. Failed/unavailable facets do not emit eligible passing output. The implementation identity includes the surface module and its contract/validation dependencies; changed predicates or policy invalidate prior qualification.

## Evidence and limits

The [public fixture](../../examples/v2/rendered/fixture.mjs) contains invented annual business numbers, a pilot condition, an unfavorable scenario, calculation details and two explained concepts. The actual browser suite measures a dense baseline, an improved progressive-disclosure layout, and fourteen adversarial/defective candidates under the same policy. A passing render means those measured predicates pass; source arithmetic/fidelity and reader comprehension remain distinct assertions. No human or independent model reader study is implied by this rendered evidence.

The collector uses the official [Playwright page API](https://playwright.dev/docs/api/class-page), [locator input/action API](https://playwright.dev/docs/api/class-locator), and [touch support](https://playwright.dev/docs/touch-events). The contrast calculation follows the relative-luminance ratio described by [W3C's contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); this one check does not establish overall WCAG conformance.
