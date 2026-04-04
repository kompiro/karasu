# karasu examples

Sample `.krs` files for learning, manual verification, and debugging.

## feature-samples/

Small, self-contained files that each exercise one language feature.
Useful for isolating rendering bugs and providing minimal reproducible cases.

| File | Feature demonstrated |
|------|---------------------|
| [`minimal.krs`](feature-samples/minimal.krs) | Smallest valid input — `system` + 2 `service` + sync/async edges |
| [`users.krs`](feature-samples/users.krs) | `[human]` and `[ai]` user nodes with `role` and `description` |
| [`edges.krs`](feature-samples/edges.krs) | Sync `->` and async `-->` edges, with and without labels |
| [`annotations.krs`](feature-samples/annotations.krs) | All four annotations: `@deprecated`, `@new`, `@experimental`, `@migration_target` |
| [`external-nodes.krs`](feature-samples/external-nodes.krs) | `[external]` tag on `service` and `resource` |
| [`domain-drill.krs`](feature-samples/domain-drill.krs) | Full hierarchy: `system` → `service` → `domain` → `usecase` → `resource` |
| [`deploy-all.krs`](feature-samples/deploy-all.krs) | All deploy artifact types: `war`, `jar`, `oci`, `lambda`, `function`, `assets`, `job`, `artifact` |
| [`domain-drift.krs`](feature-samples/domain-drift.krs) | Same domain `id` in two services — triggers a drift warning |

## Planned

- `ec-platform/` — Getting Started progression (tracked in #247)
