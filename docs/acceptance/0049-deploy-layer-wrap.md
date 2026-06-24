# AT-0049: Deploy Diagram Sibling-Grid Wrapping

**Feature**: When a single layer in the deploy diagram contains many containers, they wrap into a balanced grid (`gridColumnCount`: `ceil(sqrt(n))` columns, capped at 5) instead of extending horizontally, still bounded by `MAX_LAYER_WIDTH` (1200px). Updated for #1737 — wrapping is now count-driven (balanced grid) with the width as a secondary upper bound; the original width-only behavior was introduced in #396.

**Related**: Issue #396, #1737, `packages/core/src/renderer/deploy-layout.ts`, `packages/core/src/renderer/layer-layout-logics.ts`

## Prerequisites

A `.krs` file with a deploy block containing 8+ isolated containers (no dependency edges) so they all land in layer 0.

Example:

```krs
service S1 { label = "Service 1" }
service S2 { label = "Service 2" }
service S3 { label = "Service 3" }
service S4 { label = "Service 4" }
service S5 { label = "Service 5" }
service S6 { label = "Service 6" }
service S7 { label = "Service 7" }
service S8 { label = "Service 8" }

deploy "Production" {
  oci s1 { realizes = S1 }
  oci s2 { realizes = S2 }
  oci s3 { realizes = S3 }
  oci s4 { realizes = S4 }
  oci s5 { realizes = S5 }
  oci s6 { realizes = S6 }
  oci s7 { realizes = S7 }
  oci s8 { realizes = S8 }
}
```

## Acceptance Criteria

> ✅ Automated — `packages/e2e/tests/at-0049-deploy-layer-wrap.spec.ts` › `8 isolated containers in a single layer wrap into a balanced grid (3, 3, 2)`

With the example above, 8 containers all land in layer 0. The grid auto-balances
to `ceil(sqrt(8)) = 3` columns, so they wrap into three sub-rows of 3, 3, 2
(rather than one wide row). A row still breaks early if it would exceed
`MAX_LAYER_WIDTH`, keeping the diagram within the width budget.

| # | Check | Expected |
|---|-------|----------|
| 1 | Open the deploy diagram in the preview UI | Diagram renders without horizontal scrollbar beyond 1200px |
| 2 | Containers per sub-row | Wrap into a balanced grid of 3 columns → rows of 3, 3, 2 |
| 3 | Wrapped container X position | Each sub-row starts from the left margin (aligned with S1) |
| 4 | Diagram total width | Does not exceed ~1300px |
| 5 | Diagram total height | Taller than a single-row diagram (multiple sub-rows) |

## Automated Coverage

Layout math is covered by unit tests:

- `layer-layout-logics.test.ts` — `gridColumnCount` (8 → 3 columns) and `wrapLayerIntoRows` (row-major wrap at the column count or `MAX_LAYER_WIDTH`)
- `deploy-layout.test.ts` — isolated containers in layer 0 wrap to new sub-rows (different Y); wrapped rows restart from `OUTER_PADDING`; total height grows when wrapping occurs; ghost edges route correctly across sub-rows
