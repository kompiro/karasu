---
type: acceptance-test
id: "0045"
title: Cyclic Dependency Detection and Visual Highlighting
issue: "#287"
---

# AT-0045: Cyclic Dependency Detection and Visual Highlighting

## Purpose

Verify that cyclic sync (`->`) dependencies between services are detected, reported as warnings, and rendered visually distinct (red, bold) in the diagram.

## Automated Checks

The following are covered by automated tests (`pnpm test`):

- Self-reference (`A -> A`) emits a `cyclic-dependency` warning
- Direct cycle (`A -> B -> A`) emits a warning and marks both edges `cyclic`
- Indirect cycle (`A -> B -> C -> A`) emits a warning and marks all three edges `cyclic`
- Acyclic graph (`A -> B -> C`) emits no cyclic warning
- Async cycles (`A --> B --> A`) are **not** flagged
- Non-cyclic edges in a graph that also has a cycle are **not** marked cyclic
- Cyclic edge SVG output contains `class="krs-edge--cyclic"` on the `<line>` element
- Cyclic edge SVG output uses `#EF4444` (red) stroke color from the built-in style

## Manual Verification

### Setup

Open the preview with the following `.krs` source:

```krs
system ECommerce {
  service OrderService {}
  service PaymentService {}
  service InventoryService {}

  OrderService -> PaymentService
  PaymentService -> OrderService
  OrderService -> InventoryService
}
```

### Checklist

> 🟡 Partially automated — `packages/e2e/tests/at-0045-cyclic-dependency-detection.spec.ts` › `sync cycle emits warning and marks edges with krs-edge--cyclic`（赤色・太さの視覚確認は手動）

- [ ] The warning panel shows a `cyclic-dependency` warning with message  
      `Circular dependency detected: OrderService → PaymentService → OrderService`
- [ ] The edge `OrderService → PaymentService` is rendered in **red** and visually thicker than normal edges
- [ ] The edge `PaymentService → OrderService` is rendered in **red** and visually thicker than normal edges
- [ ] The edge `OrderService → InventoryService` is rendered in the **default color** (not red)
- [ ] The diagram still renders completely — cyclic edges are never suppressed

### Async Cycle (should NOT be flagged)

> ✅ Automated — `packages/e2e/tests/at-0045-cyclic-dependency-detection.spec.ts` › `async-only cycle does not emit a cyclic-dependency warning`

Replace the source with:

```krs
system ECommerce {
  service OrderService {}
  service PaymentService {}

  OrderService --> PaymentService
  PaymentService --> OrderService
}
```

- [ ] No `cyclic-dependency` warning is shown
- [ ] Both edges render with the default dashed async style (no red)

### User Style Override

Add a `.krs.style` file:

```krs.style
edge[cyclic] {
  color: #F97316;
  stroke-width: 4;
}
```

- [ ] Cyclic edges now render in **orange** (`#F97316`) with increased stroke width
- [ ] Non-cyclic edges are unaffected
