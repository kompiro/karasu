---
type: acceptance-test
id: "0054"
title: Ghost Domain Edges in Service Drill-Down View
issue: "#460"
---

# AT-0054: Ghost Domain Edges in Service Drill-Down View

## Purpose

Verify that cross-service domain edges are shown as ghost nodes and edges (opacity 0.3)
in the service drill-down view, making it possible to understand why an implicit service
edge exists without returning to the system view.

> Unit-test coverage for the view-slice ghost computation
> (`pnpm test` in `packages/core`):
>
> - Drilling into the source service produces `ghostDomains` containing the foreign domain node
> - Drilling into the target service produces `ghostDomains` containing the calling domain node
> - `ghostDomainEdges` preserves the original `from` / `to` domain IDs
> - `ghostDomains` is empty at system view level and domain view level
> - Multiple edges to the same foreign domain are deduplicated in `ghostDomains`
> - `parentServiceLabel` uses the service `label` when defined, falling back to the service ID

## 受け入れ条件

### Setup

Open the preview with `examples/feature-samples/domain-drift.krs`:

```krs
system DriftSample {
  label "Domain Drift Sample"

  service OrderService {
    label "Order Service"

    domain OrderDomain {
      label "Order Domain"
      description "Depends on PaymentDomain to process payments and ShippingDomain to ship orders."
      OrderDomain -> PaymentDomain "decides payment"
      OrderDomain -> ShippingDomain "triggers shipment"
    }

    domain ShippingDomain {
      label "Shipping Domain"
      description "Handles order shipment."
    }
  }

  service PaymentService {
    label "Payment Service"

    domain PaymentDomain {
      label "Payment Domain"
      description "Handles payment processing for orders."
    }
  }
}
```

---

### Case 1: Ghost domain in drill-down of source service

> 🟡 Partially automated — `packages/e2e/tests/at-0054-ghost-domain-edges.spec.ts` › `drilling into the source service renders ghost groups (Case 1)`（opacity と sub-label の視覚確認は手動）

- [ ] Click `OrderService` to drill down into the service view
- [ ] `OrderDomain` and `ShippingDomain` are shown as normal child nodes
- [ ] `PaymentDomain` appears as a **ghost node** (semi-transparent, opacity 0.3) below the main container
- [ ] The ghost node displays the sub-label `(Payment Service)` to indicate the parent service
- [ ] An arrow from `OrderDomain` to the ghost `PaymentDomain` is rendered with opacity 0.3
- [ ] The arrow label reads `"decides payment"`

---

### Case 2: Ghost domain in drill-down of target service

> 🟡 Partially automated — `packages/e2e/tests/at-0054-ghost-domain-edges.spec.ts` › `drilling into the target service also renders ghost groups (Case 2)`（opacity と sub-label の視覚確認は手動）

- [ ] Navigate back to the system view
- [ ] Click `PaymentService` to drill down into that service view
- [ ] `PaymentDomain` is shown as a normal child node
- [ ] `OrderDomain` appears as a **ghost node** below the main container
- [ ] The ghost node displays the sub-label `(Order Service)`
- [ ] An arrow from the ghost `OrderDomain` to `PaymentDomain` is rendered with opacity 0.3

---

### Case 3: Intra-service edges remain normal

- [ ] Drill back into `OrderService`
- [ ] The edge from `OrderDomain` to `ShippingDomain` is rendered with **full opacity** (not ghost)
- [ ] `ShippingDomain` appears as a normal (non-ghost) node

---

### Case 4: System view is unaffected

> ✅ Automated — `packages/e2e/tests/at-0054-ghost-domain-edges.spec.ts` › `system view has no ghost groups (Case 4)`

- [ ] Navigate to the system view (root)
- [ ] `OrderService` and `PaymentService` are shown normally
- [ ] No ghost domain nodes appear at this level
- [ ] The implicit amber-dashed edge between `OrderService` and `PaymentService` is still present
