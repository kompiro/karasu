---
id: AT-1907
title: entity view app integration — interactive toggle + permalink parity
type: acceptance-test
issue: "#1907"
date: 2026-07-13
---

## Overview

Verify that the per-domain **entity view** (shipped statically in PR 2a, #1896)
is now **interactive in the app**: while drilled into a domain that owns
entities, the user can toggle between the domain's usecase view and its entity
view, the URL hash reflects the sub-mode as `#krs-entity-<domainId>`, and the
sub-mode is carried in share payloads.

Scope: this is PR 2b-1. The entity view stays **intra-domain only** — cross-domain
ghost entities land in #1911 (PR 2b-2).

## Design

The entity view is an `orgTree`-style **sub-mode boolean** (`isEntityViewOpen`)
layered on `activeView === "system"` while a domain is drilled — not a new
top-level `ActiveView`. So the SPA hash reuses the core anchor grammar:
`buildHash` emits `#krs-entity-<domainId>` (via `anchorId("entity", …)`) in
place of `#krs-system-<domainId>` when the sub-mode is on, and `parseHash`
restores `{ activeView: "system", isEntityView: true }`.

## Acceptance Criteria

### Toggle visibility (gated to domains with entities)

> ✅ Automated — `packages/e2e/tests/at-1907-entity-view-toggle.spec.ts` › `Entities toggle appears only when drilled into a domain with entities` and `packages/app/src/components/PreviewColumn.test.tsx` › `Entity view sub-mode (#1907)`

- [ ] No "Entities" toggle at the system root (no domain drilled)
- [ ] No toggle while drilled only into a service (not a domain)
- [ ] The toggle appears once drilled into a domain that owns entities
- [ ] The toggle never appears outside the system view

### Activating the entity view

> ✅ Automated — same e2e › `Activating the entity view renders entities + relation, excludes usecases, and sets the hash`

- [ ] Clicking the toggle sets `aria-pressed="true"` and renders the entity view
- [ ] The domain's entities and their intra-domain relation are shown
- [ ] Usecases do **not** appear in the entity view
- [ ] The URL hash becomes `#krs-entity-<domainId>` (a `?file=` suffix may follow)

### Deactivating restores the usecase view

> ✅ Automated — same e2e › `Deactivating the entity view restores the usecase view`

- [ ] Toggling off hides the entity pane and restores the usecase view

### Deep-permalink parity + share

> ✅ Automated — `packages/app/src/hooks/useHistoryNavigation.test.ts` (buildHash/parseHash/parity/round-trip) and `packages/app/src/utils/inline-share.test.ts` (`entityView` flag round-trip)

- [ ] `buildHash("system", [domain], false, true)` equals `#${anchorId("entity", domain)}`
- [ ] `parseHash("#krs-entity-<domain>")` → `{ activeView: "system", isEntityView: true }`
- [ ] The share `target.entityView` boolean round-trips through encode/decode

### Export

> ✅ Automated — same e2e › `Export SVG in entity mode uses the -entity.svg filename`

- [ ] Exporting while the entity view is active downloads a `-entity.svg` file
      containing the entity nodes

### Deep link — cold boot into the entity view

- [x] Opening `#krs-entity-<domain>` directly lands on that domain's entity view

> ✅ Automated — `packages/e2e/tests/at-1907-entity-deeplink.spec.ts` › `opening #krs-entity-<domain> cold boots into that domain's entity view` — `useHistoryNavigation.test.ts` fences `parseHash` in isolation; this covers a cold boot restoring project load, drill-down *and* the sub-mode flag together, and checks the toggle's `aria-pressed` agrees with the pane so the deep link and the interactive state cannot diverge.

- [x] The toggle never appears outside the system view

> ✅ Automated — `packages/e2e/tests/at-1907-entity-deeplink.spec.ts` › `the Entities toggle never appears outside the system view` — the existing toggle spec covers root / service-level absence *within* the system view; this covers the Org and Deploy tabs. Note the observed behaviour it pins down: switching views resets the system drill-down to root, so returning to the system tab lands outside the domain and the toggle stays absent until the domain is drilled again.

### Manual verification

> manual / visual review — the remaining judgment is whether the rendered entity
> view **reads clearly** (node/relation legibility at realistic entity counts).
> The deep-link step it used to describe is automated above.
