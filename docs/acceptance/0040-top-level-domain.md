# Acceptance Test: Top-level domain declarations (#248)

## Summary

Verify that `domain` can be declared at the top level of a `.krs` file (outside
any `service` or `system` block), that a warning is emitted for unassigned
domains, and that they appear in the system view SVG.

---

## Prerequisites

- App is running (`npm run dev` in `packages/app`)

---

## Test Cases

### TC-1: Top-level domain appears in system view

> ✅ Automated — `packages/e2e/tests/at-0040-top-level-domain.spec.ts` › `top-level domains render and emit unassigned warnings (TC-1, TC-2)`

1. Enter the following in the editor:

   ```krs
   domain Payment { label "決済" }
   domain Inventory { label "在庫" }

   system ECPlatform {
     service ECommerce {
       label "ECサイト"
     }
   }
   ```

2. Verify the SVG preview renders **two labeled frames side by side**:
   - `ECPlatform` frame containing `ECommerce`
   - `Unassigned` frame containing `Payment` and `Inventory`
3. Verify Payment and Inventory are rendered as domain-shaped nodes inside the `Unassigned` frame

**Expected**: Orphan domains live in their own `Unassigned` frame rather than being mixed into the real system's peer list, preserving the semantic that they are not part of `ECPlatform`.

### TC-2: Unassigned domain warning displayed

> ✅ Automated — `packages/e2e/tests/at-0040-top-level-domain.spec.ts` › `top-level domains render and emit unassigned warnings (TC-1, TC-2)`

1. Use the same `.krs` input as TC-1
2. Check the warnings panel

**Expected**: Two warnings are shown:

- `domain "決済" is not assigned to any service`
- `domain "在庫" is not assigned to any service`

### TC-3: Top-level domain with children supports drill-down

1. Enter the following in the editor:

   ```krs
   domain Payment {
     label "決済"
     usecase ProcessPayment { label "支払い処理" }
   }

   system ECPlatform {
     service ECommerce {}
   }
   ```

2. Click on the Payment domain node in the system view

**Expected**: Drill-down into the Payment domain shows the ProcessPayment usecase.

### TC-4: No warning for domains inside services

> ✅ Automated — `packages/e2e/tests/at-0040-top-level-domain.spec.ts` › `domains nested inside services do not emit unassigned warnings (TC-4)`

1. Enter the following in the editor:
   ```krs
   system ECPlatform {
     service ECommerce {
       domain Order { label "注文" }
     }
   }
   ```
2. Check the warnings panel

**Expected**: No "unassigned domain" warning is shown.
