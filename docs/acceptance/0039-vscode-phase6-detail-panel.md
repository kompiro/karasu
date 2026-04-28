# Acceptance Test: VSCode Extension Phase 6 — Detail Panel in SVG Preview (#235)

## Coverage policy

**Partial automation** — TC-01 (clicking a leaf node opens the detail panel)
is automated in
[`packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts`](../../packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts)
under the WebView E2E harness
([`docs/design/vscode-webview-e2e-harness.md`](../design/vscode-webview-e2e-harness.md)
/ [AT-0071](./0071-vscode-webview-e2e-phase2.md)).
Remaining TCs (description / links / Jump-to-editor / drill-down via [ⓘ]
button) continue under
[ADR-20260428-05](../adr/20260428-05-vscode-webview-manual-tests.md) manual
coverage and will be migrated incrementally.

The harness job is gated on the `vscode-webview-e2e` PR label and is **not**
a required check.

## Summary

Verify that the VSCode Webview displays a detail panel when a leaf node is
clicked, showing full node information (Markdown description, links,
properties) and providing a "Jump to editor" button. Parent nodes open their
detail panel via the [ⓘ] info button.

---

## Prerequisites

- The extension is loaded in VSCode Extension Development Host (F5 from `packages/vscode`)
- A `.krs` file with descriptions, links, teams, and a multi-level hierarchy is open:

```krs
system ECommerce {
  service OrderService {
    description {
      Handles **order processing** and payment.

      ## Responsibilities
      - Accept new orders
      - Process payments
    }
    link "Design Wiki" "https://wiki.example.com/order"
    link "API Docs" "https://api.example.com/order"
    team "Order Team"

    domain OrderManagement {}
    domain Inventory {}
  }
  service UserService {
    description {
      User authentication and profile management.
    }
    team "User Team"

    domain Auth {}
  }
  user Customer {
    role "A customer who purchases products"
  }
  OrderService -> UserService
  Customer -> OrderService
}
```

---

## Test Cases

### TC-01: Clicking a leaf node opens the detail panel

1. Open the Webview (`karasu: Open Preview`)
2. Drill down into **OrderService** (click it to enter the drill-down view)
3. Click **OrderManagement** (a leaf node) with a plain click (no modifier key)
4. **Expected**:
   - A detail panel appears near the clicked node
   - The editor does **not** jump to the node definition
   - The preview does **not** change view depth

---

### TC-02: Detail panel shows description, links, and properties

1. Navigate back to root and click **Customer** (a leaf user node)
2. **Expected**: The detail panel shows:
   - Header with kind icon and label "Customer"
   - A properties section with `📌 A customer who purchases products` (role)
   - A "Jump to editor" button at the bottom

3. Close the panel and drill into **OrderService**, then use ⓘ button on
   **OrderService** at the parent level (or navigate so OrderService itself is
   a clickable leaf in the breadcrumb context)
4. At root level, click the ⓘ info button on **OrderService**
5. **Expected**: The detail panel shows:
   - Markdown description rendered as HTML (bold text for **order processing**,
     heading "Responsibilities", bullet list)
   - Links section with "Design Wiki ↗" and "API Docs ↗"
   - Properties section with `👥 Order Team`
   - "Jump to editor" button

---

### TC-03: "Jump to editor" button works

1. Open the detail panel for any node (e.g., click **Customer**)
2. Click the **"Jump to editor"** button in the panel
3. **Expected**:
   - The editor cursor moves to the `Customer` definition in the `.krs` file
   - The detail panel remains open

---

### TC-04: Close button and click-outside dismiss the panel

1. Open the detail panel for any node
2. Click the **×** close button in the panel header
3. **Expected**: The panel closes

4. Open the detail panel again
5. Click on an empty area of the SVG preview (not on any node)
6. **Expected**: The panel closes

---

### TC-05: Cmd/Ctrl+Click still triggers editor jump directly

1. Hold **Cmd** (macOS) or **Ctrl** (Windows/Linux) and click any node
2. **Expected**:
   - The editor cursor moves to the node's definition
   - No detail panel opens
   - The preview does not drill down

---

### TC-06: Parent nodes drill down on click; ⓘ button opens detail panel

1. At root level, click **OrderService** (a parent node) with a plain click
2. **Expected**: The preview drills down into OrderService (breadcrumb shows
   `Root › OrderService`)

3. Navigate back to root
4. Click the **ⓘ** info button on **OrderService** (small button in the
   node's top-right area)
5. **Expected**: The detail panel opens showing OrderService's information
   (description, links, team) — no drill-down occurs

---

### TC-07: Links in detail panel open in external browser

1. Open the detail panel for **OrderService** (via ⓘ button at root level)
2. Click the "Design Wiki ↗" link in the Links section
3. **Expected**: The URL `https://wiki.example.com/order` opens in the default
   external browser (not inside the webview)

---

### TC-08: Tooltip is suppressed while detail panel is open

1. Open the detail panel for a node that has a description
2. Hover over another node that also has a description
3. **Expected**: No tooltip appears while the detail panel is visible

4. Close the detail panel
5. Hover over the same node again
6. **Expected**: The tooltip now appears normally

---

### TC-09: Toolbar hint text is updated

1. Open the Webview
2. Look at the right end of the toolbar
3. **Expected**: The text reads `ⓘ for details · Cmd/Ctrl+Click to jump`
   (updated from the previous Phase 4.5 hint)
