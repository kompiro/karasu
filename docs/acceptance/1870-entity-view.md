---
id: AT-1870
title: per-domain entity view in the all-views bundle
type: acceptance-test
issue: "#1870"
date: 2026-07-12
---

## Overview

Verify that a domain owning `entity` nodes produces a dedicated **entity view**
in the static all-views bundle — reachable via `#krs-entity-<domainId>` — that
shows the domain's entities and their relations, with cross-domain relation
targets rendered as ghost nodes. Entities do **not** leak into the domain's
usecase (system) view.

Scope: this is PR 2a (core slice + static renderer). The interactive
usecase/entity toggle, share-target sub-mode, and `resource` → entity resolution
land in follow-up PRs, so there is no in-app toggle to exercise yet.

## Test Input

```krs
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {}
      entity Order {
        label "Order"
        Order -> LineItem "has"
        Order -> Customer "placed by"
      }
      entity LineItem { label "Line Item" }
    }
  }
  service CustomerService {
    domain Customers {
      entity Customer { label "Customer" }
    }
  }
}
```

## Acceptance Criteria

### Entity view level emitted

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `buildAllViewsSvg entity views (#1870)` › `emits a per-domain entity view level anchored #krs-entity-<domainId>`

- [ ] `buildAllViewsSvg` output contains a group `id="krs-entity-Ordering"`
- [ ] It also contains `id="krs-entity-Customers"`
- [ ] A domain with no entities produces **no** `#krs-entity-<domainId>` level

### Entities and relations in the entity view

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `extractEntityView (#1870)` and `packages/core/src/renderer/drill-down-svg.test.ts` › `renders the domain's entities inside its entity view (Order + ghost Customer)`

Open `#krs-entity-Ordering`:

- [ ] `Order` and `LineItem` appear as entity nodes (violet entity styling)
- [ ] The relation `Order → LineItem "has"` is rendered
- [ ] `PlaceOrder` (a usecase) does **not** appear — only entities

### Cross-domain relation → ghost

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `extractEntityView (#1870)` › `surfaces a cross-domain relation target as a ghost node + edge`

- [ ] `Customer` (owned by the `Customers` domain) appears in the `Ordering`
      entity view as a **ghost** node carrying the `ghost` tag, rendered muted
      / dashed
- [ ] The relation `Order → Customer "placed by"` is rendered

> manual / visual review — the ghost node reads as foreign (dashed, faded) so
> the domain boundary is visible.

### Entities excluded from the usecase view

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `entities are excluded from the domain drill-down view (#1870)`

Open the usecase view `#krs-system-Ordering`:

- [ ] `PlaceOrder` appears
- [ ] `Order` / `LineItem` entity nodes do **not** appear in the usecase view

### End-to-end render

> manual / visual review — `karasu render entity-view.krs -o out.svg` produces
> a bundle where navigating to `out.svg#krs-entity-Ordering` shows the entity
> view with Order, LineItem, and the ghost Customer.
