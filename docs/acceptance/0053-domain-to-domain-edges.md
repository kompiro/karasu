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

## Automated Checks

The following are covered by automated tests (`pnpm test`):

- `domain` blocks accept `->` and `-->` edge declarations
- Cross-service domain edges produce implicit service edges with `tags: ["implicit"]`
- Implicit service edges are suppressed when an explicit service edge already exists in the same direction
- Multiple cross-service domain edges between the same service pair are aggregated: label shows `"N domain edges"`
- Intra-service domain edges (both endpoints in the same service) appear in the service view's `childEdges`
- Cross-service domain edges (target domain in another service) do NOT appear in the service view's `childEdges`
- Duplicate domain ID within the same system emits an `error` diagnostic
- Duplicate domain ID across different systems does NOT emit an error
- `edge[implicit]` style in the built-in stylesheet sets color `#F59E0B` (amber) and `border-style: dashed`
- `domain-drift.krs` parses without errors and `OrderDomain` has an outgoing edge to `PaymentDomain`

## Manual Verification

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

- [ ] The system view shows `OrderService` and `PaymentService` as nodes
- [ ] An edge from `OrderService` to `PaymentService` is rendered in **amber** (`#F59E0B`) with a **dashed** line
- [ ] The edge label reads `"decides payment"` (single domain edge — original label preserved)

---

### Case 2: Intra-service domain edge in service drill-down

- [ ] Click `OrderService` to drill down into the service view
- [ ] `OrderDomain` and `ShippingDomain` are shown as child nodes
- [ ] An edge from `OrderDomain` to `ShippingDomain` is rendered with the **default edge style** (not amber dashed)
- [ ] The edge label reads `"triggers shipment"`
- [ ] No edge to `PaymentDomain` is visible (it is in another service)

---

### Case 3: Aggregated label for multiple cross-service domain edges

Add a second cross-service domain edge to `OrderDomain`:

```krs
domain OrderDomain {
  OrderDomain -> PaymentDomain "decides payment"
  OrderDomain -> ExternalDomain "external call"  // assume ExternalDomain is in another service
}
```

- [ ] The system-view implicit edge label changes to `"2 domain edges"`

---

### Case 4: Duplicate domain ID error within a system

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
