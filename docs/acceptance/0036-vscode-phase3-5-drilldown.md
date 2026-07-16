# Acceptance Test: VSCode Extension Phase 3.5 — Drill-down Navigation (#218)

## Coverage policy

**State logic (TC-01/02/03/04/05/06 path & label math)** — the drill-down
path/label transitions were extracted from `preview-panel.ts` into
[`packages/vscode/src/drilldown-state.ts`](../../packages/vscode/src/drilldown-state.ts)
and are unit-fenced (required-tier `vitest`) in
[`packages/vscode/src/drilldown-state.test.ts`](../../packages/vscode/src/drilldown-state.test.ts)
(#2002):

- TC-01: `buildBreadcrumbHtml` › `renders only a non-clickable Root at the top level`
- TC-02/03: `drillDown` › `appends nodeId and resolves the last label` /
  `uses meta.viewPath prefix when present`
- TC-04: `navigateTo` › `index 0 (Root crumb) resets to the empty path`
- TC-05: `drillDown` › `does not mutate the previous state` (an edit-triggered
  re-render reads the state without rebuilding it, so purity is the state half
  of "preserved on edit")
- TC-06: `emptyDrilldownState` › `switchView / switchViewAndHighlight reset to it`

**WebView interaction** — automated in the WebView E2E harness
(ADR-20260429-09; the ExTester job is **not** a required check):

- TC-01/02:
  [`packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts`](../../packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts)
  › `TC-03: Cmd/Ctrl+Click on a parent node moves the editor cursor without drilling`
  asserts the root view starts with a `Root`-only breadcrumb, and
  › `TC-02: keeps the hint visible after plain-clicking a parent node to drill in`
  asserts a plain click on a parent advances the breadcrumb past `Root`.
- TC-07: same file › `TC-03` / `TC-04` (Cmd/Ctrl+Click on a parent / leaf moves
  the editor cursor without changing the preview).
- TC-08:
  [`packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts`](../../packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts)
  › `TC-01: clicking a leaf node (Customer) opens the detail panel`. Note that
  TC-08's expected "navigate behavior" below pre-dates Phase 6 (#250): a plain
  click on a leaf now opens the detail panel instead of jumping the editor
  (see [AT-0038 TC-05](./0038-vscode-phase4-5-cmd-click-hint.md)); either way
  the preview does not drill.

The **visual walkthrough** halves of TC-04/05/06 (watching the breadcrumb and
the narrowed preview re-render across real edits and view switches) stay
manual in the Extension Development Host.

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
