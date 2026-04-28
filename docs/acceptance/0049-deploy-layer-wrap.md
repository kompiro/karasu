# AT-0049: Deploy Diagram Layer Width Wrapping

**Feature**: When a single layer in the deploy diagram contains many containers that together exceed `MAX_LAYER_WIDTH` (1200px), the excess containers wrap to a new sub-row within the same logical layer.

**Related**: Issue #396, `packages/core/src/renderer/deploy-layout.ts`

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

> ✅ Automated — `packages/e2e/tests/at-0049-deploy-layer-wrap.spec.ts` › `8 isolated containers in a single layer wrap into two sub-rows`

With the example above, each container renders at ~200px wide (unit width 160px + 2×20px padding dominates the label).
After 5 containers, `currentX ≈ 1232px`; placing the 6th would reach `1432px > OUTER_PADDING + MAX_LAYER_WIDTH (1240px)`,
so the 6th container wraps.

| #   | Check                                     | Expected                                                   |
| --- | ----------------------------------------- | ---------------------------------------------------------- |
| 1   | Open the deploy diagram in the preview UI | Diagram renders without horizontal scrollbar beyond 1200px |
| 2   | First 5 containers (S1–S5)                | Arranged in a single horizontal row                        |
| 3   | 6th–8th containers (S6–S8)                | Wrapped to a second sub-row below the first                |
| 4   | Wrapped container X position              | Starts from the left margin (aligned with S1)              |
| 5   | Diagram total width                       | Does not exceed ~1240px                                    |
| 6   | Diagram total height                      | Taller than a 5-container diagram (extra sub-row space)    |

## Automated Coverage

The following scenarios are covered by unit tests in `deploy-layout.test.ts`:

- 8 isolated containers in layer 0 → 6th container wraps to a new sub-row (different Y); last container also on sub-row 2
- Wrapped container restarts from `OUTER_PADDING` (x = 40)
- Total height is greater when wrapping occurs
- Ghost edge from a wrapped container routes correctly (bottom-center → top-center of next-layer container)
