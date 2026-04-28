# AT: Deploy Diagram — Barycenter Layer Ordering

- **Date**: 2026-04-09
- **Issue**: #395
- **Target**: `packages/core/src/renderer/deploy-layout.ts` — `sortLayerByBarycenter()`

## 受け入れ条件

ユニットテストは `packages/core/src/renderer/deploy-layout.test.ts` でカバーされる。

### AC-1: Crossing elimination (A→Z, B→Y, C→X)

**Given**: Layer 0 has containers [A, B, C] (left to right). Layer 1 has containers inserted as [X, Y, Z]. Edges: A→Z, B→Y, C→X.

**When**: `layoutDeploy()` is called.

**Then**: In the rendered layout, Z is to the left of Y, and Y is to the left of X (i.e., the barycenter sort reorders them to [Z, Y, X], eliminating all 3 crossings).

- [x] `layoutDeploy()` orders the layer 2 containers as [Z, Y, X]
  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `sorts layer 2 by barycenter to eliminate crossings (A→Z, B→Y, C→X)`

### AC-2: Predecessor-less containers placed last

**Given**: Layer 0 has [A]. Layer 1 has [C, B] (insertion order). Only edge: A→B.

**When**: `layoutDeploy()` is called.

**Then**: B is placed to the left of C (B has a predecessor in layer 0; C has none → C gets Infinity barycenter and is placed last).

- [x] `layoutDeploy()` orders the layer 1 containers as [B, C]
  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places containers with no predecessors in previous layer at the end of the layer`

### AC-3: Visual edge crossing reduction on system.krs

> Manual / visual review — the bullets below are not automated; AI / human
> reviewer confirms edge readability after layout changes.

**Given**: Open `examples/deploy/system.krs` in the karasu preview UI.

**Verify**:

- The deploy diagram shows containers in layers
- Layer 2 (`PaymentService`, `InventoryService`, `ReportingService`) is ordered such that edges from `OrderAPI` do not cross each other (left-to-right order matches the visual flow from `OrderAPI`)
- The overall diagram is readable with no unnecessary edge crossings

**How to check**: Visually confirm that edges between `OrderAPI` and its downstream containers do not cross each other.

Expected layer order for `examples/deploy/system.krs`:

```
Layer 0: [Storefront]
Layer 1: [OrderAPI]
Layer 2: [PaymentService, InventoryService, ReportingService]  ← order may vary but edges should not cross
Layer 3: [LegacyERP]
```
