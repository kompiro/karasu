# Acceptance Test: Top-level service declarations (#681)

## Summary

Verify that `service` can be declared at the top level of a `.krs` file
(outside any `system` block), that a warning is emitted for unassigned
services, and that they appear in the system view SVG alongside top-level
domains and system children. Also verifies the zero-system case where the
file contains only unassigned services / domains.

Mirrors AT-0040 (top-level domain). See design doc
`docs/design/top-level-service-rendering.md`.

---

## Prerequisites

- App is running (`npm run dev` in `packages/app`)

---

## Test Cases

### TC-1: Top-level service renders alongside system children

> ✅ Automated — `packages/e2e/tests/at-0057-top-level-service.spec.ts` › `top-level services render and emit unassigned warnings (TC-1, TC-2)`

1. Enter the following in the editor:
   ```krs
   service AuthStandalone { label "認証" }
   domain Payment { label "決済" }

   system ECPlatform {
     service ECommerce {
       label "ECサイト"
     }
   }
   ```
2. Verify the SVG preview shows **3 nodes**: ECommerce, AuthStandalone, Payment

**Expected**: All three nodes are visible at the root system view.

### TC-2: Unassigned service warning displayed

> ✅ Automated — `packages/e2e/tests/at-0057-top-level-service.spec.ts` › `top-level services render and emit unassigned warnings (TC-1, TC-2)`

1. Use the same `.krs` input as TC-1
2. Check the warnings panel

**Expected**: Warning is shown:
- `service "認証" is not assigned to any system`

(AT-0040's unassigned-domain warning for `決済` continues to fire independently.)

### TC-3: Zero-system file renders orphans only

> ✅ Automated — `packages/e2e/tests/at-0057-top-level-service.spec.ts` › `zero-system file renders orphan service drill-down (TC-3)`

1. Enter the following in the editor (no `system` block):
   ```krs
   service ECommerce {
     usecase ManageOrders { label "注文管理" }
   }
   ```
2. Verify the preview is not the "No diagram" placeholder and renders the `ECommerce` service at root level
3. Click the `ECommerce` node to drill down

**Expected**:
- Root view shows the `ECommerce` service node (no outer system frame)
- Drill-down into `ECommerce` shows the `ManageOrders` usecase

### TC-4: Services nested in a system do not emit unassigned-service warning

> ✅ Automated — `packages/e2e/tests/at-0057-top-level-service.spec.ts` › `services nested inside a system do not emit unassigned warnings (TC-4)`

1. Enter the following in the editor:
   ```krs
   system ECPlatform {
     service ECommerce { label "ECサイト" }
   }
   ```
2. Check the warnings panel

**Expected**: No `not assigned to any system` warning is shown.
