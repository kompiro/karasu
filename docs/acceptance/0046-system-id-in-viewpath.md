---
id: AT-0046
title: System ID in ViewPath for multi-system navigation
type: acceptance-test
status: draft
issue: "#333"
---

## Purpose

Verify that `ViewPath` includes the system ID as the first segment, enabling unambiguous
drill-down navigation when multiple systems exist.

## Acceptance Criteria

### AC1: Single-system drill-down preserves behavior

> ✅ Automated — `packages/e2e/tests/at-0046-system-id-in-viewpath.spec.ts` › `single-system breadcrumb includes the system label and restores root on click (AC1)`

**Setup**: Open `examples/getting-started.krs` (single system).

**Steps**:

1. App opens to the root system view.
2. Click a service node that has children (e.g. ECommerce).
3. Observe breadcrumb.
4. Click a domain node.
5. Navigate back using breadcrumb.

**Expected**:

- After clicking ECommerce: breadcrumb shows `ECPlatform > ECommerce`.
- After clicking a domain: breadcrumb shows `ECPlatform > ECommerce > <domain>`.
- Clicking the root breadcrumb item (ECPlatform) navigates back to the system view.
- Ghost users appear correctly in service view.

### AC2: Multi-system drill-down selects the correct system

> ✅ Automated — `packages/e2e/tests/at-0046-system-id-in-viewpath.spec.ts` › `multi-system drill-down keeps the correct system in the breadcrumb (AC2)`

**Setup**: A `.krs` file with two systems:

```krs
system SysA {
  service ServiceA {
    domain DomainA {}
  }
}
system SysB {
  service ServiceB {
    domain DomainB {}
  }
}
```

**Steps**:

1. Open the file. Root view shows SysA's children.
2. Click ServiceA (from SysA).
3. Observe view and breadcrumb.
4. Navigate back to root.
5. (If multi-system drill-down to SysB is supported in the UI) verify SysB navigation.

**Expected**:

- After clicking ServiceA: breadcrumb shows `SysA > ServiceA`.
- DomainA appears as the child node.
- Navigating back via breadcrumb returns to the root system view.

### AC3: nodePathIndex includes system ID prefix

**Verification**: Automated (parser.test.ts).

For a `.krs` file with `system EC { service Payment {} }`,
`nodePathIndex.get("Payment")` returns `["EC", "Payment"]` (not `["Payment"]`).

### AC4: VSCode drill-down works with Phase 2 paths

**Setup**: Open a multi-service `.krs` file in VS Code with the karasu extension.

**Steps**:

1. Open the karasu preview panel.
2. Click a service node with children.
3. Observe breadcrumb in the preview panel.
4. Navigate back using breadcrumb.

**Expected**:

- Breadcrumb shows `Root > <SystemLabel> > <ServiceLabel>` after drill-down.
- Clicking the system label in breadcrumb navigates back to the system's root view.

### AC5: Hash-based navigation resolves correctly

**Setup**: Open the app, drill into a service (ECommerce), then reload the page.

**Expected**:

- The URL hash contains the service ID (e.g. `#krs-system-ECommerce`).
- After reload, the app navigates back to the service view for ECommerce.
