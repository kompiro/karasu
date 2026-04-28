---
type: acceptance-test
id: "0053"
title: Domain-to-Domain Dependency Edges
issue: "#445"
---

# AT-0053: Domain-to-Domain Dependency Edges

## Purpose

Verify that domain-level dependency edges are parsed, rendered, and validated correctly. Covers:

1. Cross-service domain edges derived as implicit service edges (amber dashed) in the system view
2. Intra-service domain edges rendered directly in the service drill-down view
3. Domain ID uniqueness enforced as an error within a system

> Unit-test coverage for parser / resolver / view slice behaviour
> (`pnpm test` in `packages/core`):
>
> - `domain` blocks accept `->` and `-->` edge declarations
> - Cross-service domain edges produce implicit service edges with `tags: ["implicit"]`
> - Implicit service edges are suppressed when an explicit service edge exists in the same direction
> - Multiple cross-service domain edges aggregate (label shows `"N domain edges"`)
> - `EdgeDetailPanel` lists each constituent domain edge and can be × dismissed
> - `ViewSlice.implicitEdgeDetails` carries `DomainEdgeDetail` objects
> - Intra-service domain edges appear in the service view's `childEdges`; cross-service ones do not
> - Duplicate domain ID within a system emits an `error` diagnostic; across systems does not
> - `edge[implicit]` style sets color `#F59E0B`; sync vs async distinguished by `[sync]` / `[async]`
> - Sync + async pair produces two separate implicit service edges
> - `domain-drift.krs` parses cleanly with `OrderDomain → PaymentDomain` edge

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

### Case 1: Implicit service edge in system view

> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `cross-service domain edge becomes an amber dashed implicit service edge (Case 1)`

- [ ] The system view shows `OrderService` and `PaymentService` as nodes
- [ ] An edge from `OrderService` to `PaymentService` is rendered in **amber** (`#F59E0B`)
- [ ] Because the source domain edge is `->` (sync), the line is **solid** (not dashed). If the source were `-->`, it would be dashed.
- [ ] The edge label reads `"decides payment"` (single domain edge — original label preserved)

---

### Case 2: Intra-service domain edge in service drill-down

> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `intra-service domain edge renders in the service drill-down view (Case 2)`

- [ ] Click `OrderService` to drill down into the service view
- [ ] `OrderDomain` and `ShippingDomain` are shown as child nodes
- [ ] An edge from `OrderDomain` to `ShippingDomain` is rendered with the **default edge style** (not amber dashed)
- [ ] The edge label reads `"triggers shipment"`
- [ ] No edge to `PaymentDomain` is visible (it is in another service)

---

### Case 3: Aggregated label for multiple cross-service domain edges

> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `multiple cross-service domain edges aggregate into a "N domain edges" label (Case 3)`
>
> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `clicking aggregated edge label opens detail panel listing constituent domain edges (Case 3)`

Add a second cross-service domain edge to `OrderDomain`:

```krs
domain OrderDomain {
  OrderDomain -> PaymentDomain "decides payment"
  OrderDomain -> ExternalDomain "external call"  // assume ExternalDomain is in another service
}
```

- [x] The system-view implicit edge label changes to `"2 domain edges"`

  > ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `multiple cross-service domain edges aggregate into a "N domain edges" label (Case 3)`

- [x] Clicking the `"2 domain edges"` label opens a detail panel listing each constituent domain edge

  > ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `clicking aggregated edge label opens detail panel listing constituent domain edges (Case 3)`

- [x] The panel shows two rows: `OrderDomain → PaymentDomain "decides payment"` and `OrderDomain → ExternalDomain "external call"` (or equivalent)

  > ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `clicking aggregated edge label opens detail panel listing constituent domain edges (Case 3)`

- [x] Closing the panel (× button) dismisses it

  > ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `clicking aggregated edge label opens detail panel listing constituent domain edges (Case 3)`

- [ ] Clicking anywhere outside the panel also dismisses it

---

### Case 4: Duplicate domain ID error within a system

> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `duplicate domain ID within a system surfaces a uniqueness error (Case 4)`

Enter the following source:

```krs
system DriftSample {
  service OrderService {
    domain SharedDomain {}
  }
  service PaymentService {
    domain SharedDomain {}
  }
}
```

- [ ] An **error** diagnostic is shown: `Domain id "SharedDomain" must be unique within a system; found in multiple services`
- [ ] The system diagram is not rendered (or shows last valid state)

---

### Case 5: Same domain ID in different systems (no error)

> ✅ Automated — `packages/e2e/tests/at-0053-domain-to-domain-edges.spec.ts` › `same domain ID in different systems does not error (Case 5)`

Enter the following source:

```krs
system SystemA {
  service ServiceA {
    domain CommonDomain {}
  }
}

system SystemB {
  service ServiceB {
    domain CommonDomain {}
  }
}
```

- [ ] **No error** diagnostic is shown for the duplicate domain ID across systems
- [ ] Both systems render without issues

---

### Case 6: Style override for implicit edges

Add a `.krs.style` file with:

```krs.style
edge[implicit] {
  color: #A855F7;
  border-style: dotted;
}
```

- [ ] The implicit service edge now renders in **purple** (`#A855F7`) with a **dotted** line
- [ ] Explicit (non-implicit) edges are unaffected

---

### Case 7: Sync and async implicit edges are visually distinguishable (#510)

Use the following source:

```krs
system OrderSystem {
  service LegacyService {
    domain LegacyContract {
      LegacyContract -> Billing "sync call"
    }
  }
  service NewService {
    domain NewContract {
      NewContract --> Notification "async event"
    }
  }
  service BillingService { domain Billing {} }
  service NotificationService { domain Notification {} }
}
```

- [ ] In the system view, `LegacyService → BillingService` is rendered as an amber **solid** line (sync implicit edge)
- [ ] `NewService → NotificationService` is rendered as an amber **dashed** line (async implicit edge)
- [ ] The two edges are visually distinguishable at a glance

Then add a service pair with both kinds in a single source:

```krs
system MixedSystem {
  service ServiceA {
    domain DomainA {
      DomainA -> DomainB "sync"
      DomainA --> DomainB "async"
    }
  }
  service ServiceB { domain DomainB {} }
}
```

- [ ] `ServiceA → ServiceB` is rendered as **two** implicit edges — one solid amber, one dashed amber
