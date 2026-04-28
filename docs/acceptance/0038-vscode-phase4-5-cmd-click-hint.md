# Acceptance Test: VSCode Extension Phase 4.5 — Cmd/Ctrl+Click hint text (#228)

## Coverage policy

**Manual** — see [ADR-20260428-05](../adr/20260428-05-vscode-webview-manual-tests.md).
This AT exercises the karasu preview WebView (toolbar hint rendering and
modifier-click handlers), which is unreachable from the
`packages/vscode-e2e` harness. Verify by hand during release QA.

## Summary

Verify that the VSCode Webview toolbar displays a hint text informing users
that Cmd/Ctrl+Click triggers editor jump, and that the click interactions
(drill-down for parent nodes, editor jump for leaf nodes) work correctly.

---

## Prerequisites

- The extension is loaded in VSCode Extension Development Host (F5 from `packages/vscode`)
- A `.krs` file with a multi-level hierarchy is open (e.g., the sample below)

```krs
system ECommerce {
  service OrderService {
    domain OrderManagement {}
    domain Inventory {}
  }
  service UserService {
    domain Auth {}
  }
  OrderService -> UserService
}
```

---

## Test Cases

### TC-01: Hint text is visible in the toolbar

1. Open the Webview (`karasu: Open Preview`)
2. Look at the right end of the toolbar
3. **Expected**: The text `Cmd/Ctrl+Click to jump to definition` is visible, styled
   in a muted (description) color

---

### TC-02: Hint text is visible regardless of drill-down depth

1. Click **OrderService** to drill down (breadcrumb shows `Root › OrderService`)
2. **Expected**: The hint text is still visible at the right end of the toolbar

---

### TC-03: Cmd+Click on a parent node triggers editor jump, not drill-down

1. In the System view (root level), hold **Cmd** (macOS) or **Ctrl** (Windows/Linux)
   and click **OrderService**
2. **Expected**:
   - The preview does **not** drill down (breadcrumb stays at `Root`)
   - The editor cursor moves to the `OrderService` definition in the `.krs` file

---

### TC-04: Cmd+Click on a leaf node triggers editor jump

1. Drill into OrderService so OrderManagement and Inventory are visible
2. Hold **Cmd** (macOS) or **Ctrl** (Windows/Linux) and click **OrderManagement**
3. **Expected**:
   - The preview does **not** change
   - The editor cursor moves to the `OrderManagement` definition in the `.krs` file

---

### TC-05: Plain click on a leaf node triggers editor jump

1. Drill into OrderService so OrderManagement and Inventory are visible
2. Click **OrderManagement** without any modifier key
3. **Expected**:
   - The preview does **not** change view depth
   - The editor cursor moves to the `OrderManagement` definition in the `.krs` file
