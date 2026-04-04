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
2. Verify the SVG preview shows **3 nodes**: ECommerce, Payment, Inventory
3. Verify Payment and Inventory are rendered as domain-shaped nodes

**Expected**: All three nodes are visible in the system view.

### TC-2: Unassigned domain warning displayed

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
