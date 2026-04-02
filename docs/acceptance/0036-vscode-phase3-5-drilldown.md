# Acceptance Test: VSCode Extension Phase 3.5 — Drill-down Navigation (#218)

## Summary

Verify that the `packages/vscode` Webview supports drill-down navigation:
clicking a node with children narrows the preview to that subtree, a breadcrumb
bar shows the current path, and state is preserved correctly across edits and view switches.

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

### TC-01: Breadcrumb shows "Root" at top level

1. Open the Webview (`karasu: Open Preview`)
2. Confirm the toolbar shows: `System | Deploy | Org | ─ | Root`
3. **Expected**: Only "Root" appears in the breadcrumb, with no `›` separator

---

### TC-02: Clicking a node with children drills down

1. In the System view, click on the **OrderService** node (it has children)
2. **Expected**:
   - The preview narrows to show only OrderService's contents (OrderManagement, Inventory)
   - Breadcrumb updates to: `Root › OrderService`

---

### TC-03: Breadcrumb label uses the display name, not the ID

1. After TC-02, confirm the breadcrumb shows `OrderService` (the node's label)
2. **Expected**: The label matches the name shown in the diagram, not a raw ID

---

### TC-04: Clicking "Root" in the breadcrumb navigates back to top

1. While drilled into OrderService (TC-02), click `Root` in the breadcrumb
2. **Expected**:
   - The preview returns to the full System view
   - Breadcrumb resets to show only `Root`

---

### TC-05: Drill-down state is preserved on edit

1. Drill into OrderService so the breadcrumb shows `Root › OrderService`
2. Edit the `.krs` file (e.g., add a space) and save
3. **Expected**:
   - The preview re-renders and still shows only OrderService's subtree
   - Breadcrumb still shows `Root › OrderService`

---

### TC-06: View switch resets the drill-down path

1. Drill into OrderService so the breadcrumb shows `Root › OrderService`
2. Click the **Deploy** button in the toolbar
3. **Expected**:
   - The view switches to Deploy
   - Breadcrumb resets to show only `Root`
4. Switch back to **System**
5. **Expected**: Breadcrumb shows only `Root` (drill-down was reset)

---

### TC-07: Cmd/Ctrl+Click triggers editor jump (not drill-down)

1. In the System view, hold **Cmd** (macOS) or **Ctrl** (Windows/Linux) and click **OrderService**
2. **Expected**:
   - The preview does **not** drill down
   - The editor cursor moves to the `OrderService` definition in the `.krs` file

---

### TC-08: Clicking a leaf node does not drill down

1. Drill into OrderService so only OrderManagement and Inventory are visible
2. Click on **OrderManagement** (a leaf node with no children)
3. **Expected**:
   - The preview does **not** change view depth
   - The editor cursor moves to the `OrderManagement` definition (navigate behavior)
