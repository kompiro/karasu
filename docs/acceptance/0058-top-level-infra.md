---
id: AT-0058
title: Top-level infra block rendering (database / queue / storage)
type: mixed
---

# AT-0058: Top-level infra block rendering

## Summary

Verify that `database`, `queue`, and `storage` can be declared at the top level of a `.krs`
file (outside any `system` block), that warnings are emitted for each unassigned infra node,
and that they appear in the preview SVG inside an "Unassigned" frame alongside any other
top-level nodes. Also verifies the zero-system case and the end-to-end `translate --from db`
pipeline.

Mirrors AT-0057 (top-level service). See design doc
`docs/design/top-level-infra-rendering.md`.

---

## Prerequisites

- App is running (`pnpm dev` in `packages/app`)
- CLI is built (`pnpm build` in `packages/cli`)

---

## Test Cases

### TC-1: Top-level database renders alongside system children

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `buildDrillDownSvg with top-level infra blocks` › `renders orphan database alongside an existing system frame`

1. Enter the following in the editor:
   ```krs
   database OrderDB { label "注文DB" }

   system ECPlatform {
     service ECommerce { label "ECサイト" }
   }
   ```
2. Verify the SVG preview renders **two labeled frames side by side**:
   - `ECPlatform` frame containing `ECommerce`
   - `Unassigned` frame containing `OrderDB`

**Expected**: Orphan database lives in a shared `Unassigned` frame, clearly separated from `ECPlatform`.

### TC-2: Unassigned infra warnings displayed

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `unassigned-database warning`

1. Use the same `.krs` input as TC-1
2. Check the warnings panel

**Expected**: Warning is shown:
- `database "注文DB" is not assigned to any system`

### TC-3: Zero-system file with only infra blocks renders

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `buildDrillDownSvg with top-level infra blocks` › `renders a zero-system file with only database/queue/storage`

1. Enter the following in the editor (no `system` block):
   ```krs
   database OrderDB { label "注文DB" }
   queue EventQueue { label "イベントキュー" }
   storage FileStore { label "ファイル" }
   ```
2. Verify the preview is **not** the "No diagram" placeholder
3. Verify the preview renders a single `Unassigned` frame containing all three nodes

**Expected**: All three infra nodes appear inside the `Unassigned` frame; no "No diagram" placeholder.

### TC-4: Infra nested inside a system does not emit unassigned warning

> ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `unassigned-database warning` › `does not warn for databases nested inside a system`

1. Enter the following in the editor:
   ```krs
   system ECPlatform {
     database OrderDB { label "注文DB" }
   }
   ```
2. Check the warnings panel

**Expected**: No `not assigned to any system` warning is shown.

### TC-5: `translate --from db` output renders end-to-end in preview

> ⏸ Manual

1. Run:
   ```
   karasu translate --from db schema.sql > /tmp/order.krs
   ```
   where `schema.sql` contains at least one `CREATE TABLE` statement.
2. Run `karasu serve /tmp` and open `order.krs` in the browser.
3. Verify the preview shows the generated `database` block (inside an `Unassigned` frame) rather than a blank page or "No diagram".

**Expected**: The translated `.krs` renders correctly without manual edits.

### TC-6: Drill-down into a top-level database shows its table children

> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `buildDrillDownSvg with top-level infra blocks` › `produces a drill-down page for a top-level database so its table children are reachable`

1. Enter the following in the editor (no `system` block):
   ```krs
   database OrderDB {
     table OrdersTable { label "orders" }
     table PaymentsTable { label "payments" }
   }
   ```
2. Verify the preview shows the `Unassigned` frame with the `OrderDB` node.
3. Click the `OrderDB` node to drill down.

**Expected**: The drill-down view shows `OrdersTable` and `PaymentsTable` as child nodes of `OrderDB`.
