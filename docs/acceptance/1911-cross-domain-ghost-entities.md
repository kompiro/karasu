---
id: AT-1911
title: cross-domain ghost entities in the entity view
type: acceptance-test
issue: "#1911"
date: 2026-07-14
---

## Overview

Verify that the per-domain **entity view** surfaces **cross-domain relations**:
a relation whose target is a **qualified `DomainId.EntityId`** reference draws the
foreign entity as a muted **ghost** node (both outgoing and incoming), while
intra-domain relations and bare cross-domain references behave as before.

Scope: PR 2b-2, core only. Reuses the existing layout-node ghost mechanism
(`layoutNode.ghost` → muted `ghost-nodes` group at `GHOST_OPACITY`), mirroring
`ghostDomains` (ADR-20260411-05). No renderer or app change.

## Design

Entity ids are only *warning*-level unique (`entity-anchor-collision`), so a bare
id cannot disambiguate a foreign entity. Cross-domain relations therefore use a
qualified `DomainId.EntityId` target (`DomainId` is error-level unique). See
`docs/spec/syntax.md` § entity relations and TPL-20260714-01.

## Acceptance Criteria

### Outgoing cross-domain relation → ghost

> ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `cross-domain ghost entities (#1911)` › `surfaces an outgoing qualified reference as a ghost, keyed DomainId.EntityId`

- [ ] `Order -> Customers.Customer` surfaces `Customer` in `slice.ghostEntities`,
      keyed `Customers.Customer`, sub-labelled with its owning domain
- [ ] The foreign entity is **not** in `childNodes`
- [ ] The edge is in `ghostEntityEdges`, normalized (`Order->Customers.Customer`)

### Incoming cross-domain relation → ghost

> ✅ Automated — same describe › `surfaces an incoming qualified reference (foreign entity → this domain) as a ghost`

- [ ] Drilling into the target domain surfaces the referencing foreign entity as a ghost
- [ ] The incoming edge is normalized (foreign endpoint qualified, local endpoint bare)

### Dedup across directions

> ✅ Automated — same describe › `dedups a foreign entity referenced in both directions into one ghost`

- [ ] A foreign entity referenced both outgoing and incoming appears once in `ghostEntities`; both edges are kept

### Bare / non-entity references are not ghosted

> ✅ Automated — same describe › `does not ghost a qualified reference to a resource / unknown target` and `extractEntityView (#1870)` › `drops a bare cross-domain relation (only qualified DomainId.EntityId is a ghost)`

- [ ] A bare cross-domain reference (`Order -> Customer`) is dropped, not ghosted
- [ ] A qualified reference to a resource / unknown target (`Order -> OrderDB.orders`) is dropped
- [ ] A qualified reference to a local entity (`Order -> ThisDomain.LineItem`) is an intra-domain edge

### Rendering — muted ghost

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `renderEntityView (#1907)` › `renders a cross-domain foreign entity as a muted ghost (#1911)`

- [ ] `renderEntityView` output draws the foreign entity (`data-node-id="Customers.Customer"`)
      inside `<g class="ghost-nodes" opacity="0.3">` (layout-node-flag muting, not tag/style)

### Manual verification

> manual / visual review — open a `.krs` with `Order -> Customers.Customer`, drill
> into the Ordering domain, toggle **◇ Entities**, and confirm `Customer` renders
> faded below the local entities with its domain shown as a sub-label, and the
> relation edge connects to it.
