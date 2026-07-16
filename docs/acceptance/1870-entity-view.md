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
shows the domain's entities and their intra-domain relations. Entities do
**not** leak into the domain's usecase (system) view, and the entity views do
**not** rescale the shipped system/deploy/org views.

Scope: this is PR 2a (core slice + static renderer). The interactive
usecase/entity toggle, cross-domain ghost entities, share-target sub-mode, and
`resource` → entity resolution land in follow-up PRs, so there is no in-app
toggle to exercise and cross-domain relation targets are not surfaced yet.

## Test Input

```krs
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {}
      entity Order {
        label "Order"
        Order -> LineItem "has"
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

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `buildAllViewsSvg entity views (#1870)`

- [ ] `buildAllViewsSvg` output contains a group `id="krs-entity-Ordering"`
- [ ] It also contains `id="krs-entity-Customers"` (a domain owning only entities)
- [ ] A domain with no entities produces **no** `#krs-entity-<domainId>` level
- [ ] A domain nested below another domain still gets its entity view level

### Entities and relations in the entity view

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `extractEntityView (#1870)`

Open `#krs-entity-Ordering`:

- [ ] `Order` and `LineItem` appear as entity nodes (violet entity styling)
- [ ] The relation `Order → LineItem "has"` is rendered
- [ ] `PlaceOrder` (a usecase) does **not** appear — only entities

### Entities excluded from the usecase view

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `entities are excluded from the domain drill-down view (#1870)`

Open the usecase view `#krs-system-Ordering`:

- [ ] `PlaceOrder` appears
- [ ] `Order` / `LineItem` entity nodes do **not** appear in the usecase view

### No regression to shipped views

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `does not change the bundle canvas size vs the same model without entities`

- [ ] Adding entities to a domain does not change the bundle's canvas
      dimensions (the entity views are fragment-only and do not rescale the
      system/deploy/org views)

### Back navigation

> ✅ Automated by `packages/core/src/renderer/drill-down-svg.test.ts` (suite-wide) — "does not emit a dead drill link to an entity-only domain"（bundle 内の全 `href` が実在レベルに解決することを検証）/ "emits the entity view in the standalone system drill-down export too"（standalone export 側の Back target 解決）

- [x] The entity view's Back button targets a level that exists — the domain's
      usecase view when the domain also has usecases, otherwise its parent drill
      level — never a dead `#krs-system-<domainId>` for an entity-only domain

### Standalone system drill-down export

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `emits the entity view in the standalone system drill-down export too`

The app also exports a standalone system drill-down SVG (`<name>-drilldown.svg`,
`buildDrillDownSvg`), separate from the all-views bundle.

- [ ] `buildDrillDownSvg` output contains a group `id="krs-entity-Ordering"`
- [ ] The entity view's Back target (`#krs-system-Ordering`) resolves within the
      same standalone SVG
- [ ] The entity nodes render inside the entity level

### End-to-end render

> manual / visual review — `karasu render entity-view.krs -o out.svg` produces
> a bundle where navigating to `out.svg#krs-entity-Ordering` shows the entity
> view with Order and LineItem. The same fragment resolves in the app's
> `<name>-drilldown.svg` export.
