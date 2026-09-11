# Spike #2632 — the edge hover affordance, measured

Branch: `spike/deploy-edge-hover`. Not for merge. The design this feeds is
`docs/design/edge-hover-affordance.md`.

Issue [#2632](https://github.com/kompiro/karasu/issues/2632) reports that deploy-view
edges have no hover affordance, and attributes it to one flag in `renderEdge`:

```ts
const interactive = edge.canonicalId !== undefined;
```

The spike set out to confirm that and size the fix. It found the flag is **one of three
independent gates**, that the deploy view is **one of four pipelines** that trips them,
and that the same symptom is already live on the **system** view of a real model.

## How to reproduce

```
pnpm install
DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/census.ts
DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/classify.ts
DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/measure.ts
DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/shots.ts
```

`census` / `classify` read markup and run on `main` unchanged. `measure` renders both
stylesheets itself, so it reports the before **and** after from one run. `shots` needs the
spike's CSS edits to show the "after" screenshots.

Models are the built-in `ExampleProject`s — what the app actually opens — plus the
reverse-engineered dify model at `/workspaces/dify/index.krs`. Reading `examples/` off
disk was tried first and rejected: concatenating every file under
`examples/ja/ec-platform/` merges seven separate projects into one 24-system root that no
user ever sees, which inflates the gap.

## Finding 1 — the gap is 24.7% of all drawn edges, not just the deploy view

45 render surfaces, 534 drawn edges:

| | edges | with hit-line | with `--interactive` | with canonical id |
| --- | --- | --- | --- | --- |
| total | 534 | 403 | 402 | 402 |

**132 of 534 edges (24.7%) have no hover affordance today.** The deploy view accounts for
20 of them. Attributed by cause (`classify.ts`):

| cause | edges | what it is |
| --- | --- | --- |
| `no-id-pass` | 82 | the multi-system / `__unassigned__` root lays each frame out from `sys.edges`, and `assignEdgeCanonicalIds` only ever ran over `viewSlice.childEdges` (`compile.ts:520`) |
| `ghost` | 50 | reduced ghost renderings, which deliberately drop `canonicalId` — **including every deploy edge**, which `deploy-layout.ts:641` marks `ghost` after routing |

Worst cases, both of them the *default* view a reader lands on:

| project | surface | edges | interactive |
| --- | --- | --- | --- |
| `feature-samples` | system | 74 | **0** |
| `multi-file-system` | system | 6 | **0** |
| `dify` | deploy | 16 | **0** |

`feature-samples` declares 24 `system` blocks and `multi-file-system` 5, so both render as
a multi-system root. Every edge inside every frame is drawn from a list the id pass never
saw.

## Finding 2 — three gates, not one

The issue's framing (`interactive` conflates "hoverable" and "addressable") is right but
incomplete. `#2543` already split the hit-line off into `needsHitArea`. Measured per shape
tag on dify (`measure.ts`, `main` = the stylesheet as it stands):

| surface | variant | shape | edges | thickened | lit to full | dims peers |
| --- | --- | --- | --- | --- | --- | --- |
| system | main | `path` | 18 | **0/18** | 18/18 | 18/18 |
| system | main | `line` | 5 | 5/5 | 5/5 | 5/5 |
| system | main | `polyline` | 1 | 1/1 | 1/1 | 1/1 |
| system | spike | `path` | 18 | **18/18** | 18/18 | 18/18 |
| deploy | main | `polyline` | 12 | **0/12** | **0/12** | **0/12** |
| deploy | main | `line` | 2 | **0/2** | **0/2** | **0/2** |
| deploy | spike | `polyline` | 12 | 12/12 | 12/12 | 12/12 |
| deploy | spike | `line` | 2 | 2/2 | 2/2 | 2/2 |

(24 of dify's 31 system edges are measurable; the other 7 have another edge painted over
their midpoint, so the pointer lands on the peer. `measure.ts` skips those rather than
report the peer's numbers.)

Three separate gates fall out of this:

1. **the group class.** `.krs-edge--interactive` is id-gated, so a deploy edge matches no
   hover rule at all. This is the gate the issue names.
2. **the shape tag.** The stroke rules name `line` and `polyline`. A hop-marked edge
   (#1859 P2c-C) is drawn as a `<path>` by `gappedStrokePath`, so it matches neither —
   **18 of dify's 24 measurable system edges get no stroke-thickening and no brightening
   today**, while their peer-dim (which keys on the group, not the shape) works. The
   reported symptom, already live on the system view, on an edge that *has* a canonical id.
3. **the ancestor group.** Deploy edges render inside `<g class="ghost-edges"
   opacity="0.3">`. Group opacity composites, so `opacity: 1 !important` on the hovered
   child cannot lift it. Broadening the selector alone gives `{focused: 0.3, peer: 0.075}`
   — the 4:1 contrast is there, but the focused edge stays washed out instead of matching
   the system view's `{focused: 1, peer: 0.25}`.

Lifting the group while it hosts the hover fixes (3) in one rule and reaches
`{focused: 1, peer: 0.25}`, identical to the system view:

```css
.preview-container svg .ghost-edges:has(.krs-edge:hover) { opacity: 1; }
```

## Finding 3 — the affordance is app-only

`packages/vscode/src/webview-content.ts` builds its own inline `<style>` block. It has no
`.krs-edge` rule of any kind, so the VS Code preview has **no** edge hover affordance on
any view, for any edge, addressable or not. Same capability, a third gate, a fourth
answer. Not fixed here — the duplication is the structural problem, and a shared
stylesheet fragment is a larger change than #2632.

## Finding 4 — the context menu would be dead on a deploy edge

`deploy-layout.ts` never reads `direction:`; its DAG comes from `assignLayers(classifiedIds,
slice.ghostEdges)`. So synthesizing a canonical id for deploy edges (the issue's
direction 2) would open a menu whose only action writes back to the *system* edge and
changes nothing on the canvas the reader is looking at. Direction 1 confirmed.

## Cost

Emitting the hit-line unconditionally takes the bundled corpus from 3,186,533 to
3,207,123 bytes of SVG: **+20,590 bytes, +0.65%**. Concentrated where the edges were
missing it — dify's deploy view grows 5.1% (57,438 → 60,384) for its 16 edges, ~184 bytes
each, those being long routed polylines. Static exports carry the hit-line already for
every addressable edge, so this widens an existing cost rather than introducing one.

## What breaks

- `packages/core` — **1 of 4,409 tests**. `drill-down-svg.test.ts:1293` picks the visible
  stroke with `<g data-edge-…><(?:line|path)[^>]*>`, i.e. the *first* shape in the group,
  which is now the hit-line. Needs `(?![^>]*krs-edge__hitline)`. A harness assumption, not
  a behaviour change.
- `packages/app` — 1,388 tests pass. `styles-no-raw-color.test.ts` names the dim selector
  in `DIMMING_ALLOWED` and must be updated in step with the stylesheet.
- `packages/e2e` — the **full** suite is green: 174 passed, 1 skipped, exit 0. AT-1186 and
  AT-0053, the two specs that assert on edge hover, pass unchanged.

## Artifacts

- `deploy-rest.png` / `deploy-hover.png` — dify's deploy view, at rest and hovering
  `api_websocket → redis`. The hovered edge is full-strength and thick, every peer sinks.
- `system-rest.png` / `system-hover.png` — the same on the system view.
- `measure-*.html` — the standalone pages the measurements ran against.
