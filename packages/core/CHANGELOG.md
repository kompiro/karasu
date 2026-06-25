# @karasu-tools/core

## 0.2.0

### Minor Changes

- b80a879: Add a balanced-grid sibling layout for nodes with a high span of control. When a parent has many children, siblings are arranged in a balanced grid instead of a single overflowing row, keeping wide diagrams compact and readable. See ADR-20260624-01 and #1748.
- 1476a62: Add a job lane to the deploy view (first kind band). Deploy units are grouped into a dedicated lane by kind, giving the deploy view a structured first band for job-style workloads. See #1749.
- 5a6907b: Add `edge[from=<id>]` / `edge[to=<id>]` source/target edge style selectors

  `.krs.style` can now color a node's whole fan-out (or fan-in) in one rule —
  `edge[from=ApiGateway] { color: #3B82F6; }` matches every edge originating at
  `ApiGateway`, and `edge[to=X]` matches every edge terminating at `X`. `<id>`
  accepts dot-notation endpoints for synthesized usecase→resource edges, and
  both selectors score 11 (same tier as `edge[<tag>]`). An attribute other than
  `from` / `to` raises an `unknown-edge-selector-attribute` error.

- fc2145d: `[index]` stores are now excluded from shared-infra-fan-in detection. Because a derived index is expected to be fed from a source of truth, fan-in into an `[index]` store is no longer flagged as shared-infrastructure coupling, refining the diagnostic introduced for the `[index]` tag. See #1741.
- be83dc8: Add the `[index]` tag for derived search / vector-index databases. A `database`, `queue`, or `storage` block tagged `[index]` is recognized as a read-optimized projection built from a source of truth, letting karasu distinguish derived indexes from primary stores in the system and deploy views. See #1727.
- d9d158e: Split the system-view dependency tier into separate infra and external rows. Infrastructure and external dependencies are now laid out in distinct bands instead of one mixed tier, improving readability of the system view. See ADR-20260623-06 and #1736 / #1724.

### Patch Changes

- ba945ab: `client` is now resolved as a valid `realizes` / `owns` target. Relationships pointing at a `client` node no longer fail to link, so client-facing ownership and realization edges render correctly. Fixes #1721.
- 44afcd9: Give deploy nodes dark text in the light theme. Deploy node labels were previously hard to read against the light-theme background; they now use a dark foreground color for adequate contrast. Fixes #1698.

## 0.1.0

### Minor Changes

- 1113820: Publish `@karasu-tools/core` as a standalone v0.x library. The package is no longer `private`: its `exports` point published consumers at the built `dist/` (types + ESM), while a `development` export condition keeps the workspace resolving TS source so `pnpm typecheck` stays build-independent. Adds `repository` / `homepage` / `files` / `publishConfig` / `prepack`, a package README and LICENSE. The TypeScript API is v0.x — no stability promise; breaking changes may land in minor releases (see ADR-20260616-06). The npm org reservation and the actual first publish are gated on the public launch (#1317).
