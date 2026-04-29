# Acceptance Test: VSCode Extension Phase 4.5 — Cmd/Ctrl+Click hint text (#228)

## Coverage policy

**Partial automation** — TC-01 (hint at root) and TC-02 (hint after
drill) are automated in
[`packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts`](../../packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts)
under the WebView E2E harness
([`docs/design/vscode-webview-e2e-harness.md`](../design/vscode-webview-e2e-harness.md)
/ [AT-0072](./0072-vscode-webview-e2e-phase3-at-0038.md)).

TC-03 and TC-04 (Cmd/Ctrl+Click → editor cursor jump) have automated
implementations in the same file but are **`it.skip`** today: the
karasu extension resolves its LSP server module via
`context.asAbsolutePath("../lsp/out/server.js")`, which only works in
the dev tree. The path falls outside the `.vsix` that vsce produces
from `packages/vscode`, so an installed-mode harness cannot start the
LSP and `handleNavigate` early-returns. They will un-skip once the
extension packages the LSP server inside its own folder
(see [AT-0073](./0073-vscode-webview-e2e-phase3-at-0038-jump.md)).
Until then they remain manual under
[ADR-20260428-05](../adr/20260428-05-vscode-webview-manual-tests.md).

TC-05 in earlier revisions described "plain click on leaf → editor jump",
which pre-dated the Phase 6 detail-panel work (#250). The current
behaviour is that a plain click on a leaf opens the detail panel; that
case is already automated by
[AT-0039 TC-01](./0039-vscode-phase6-detail-panel.md) and TC-05 below
has been rewritten to match.

The harness job is gated on the `vscode-webview-e2e` PR label and is **not**
a required check.

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

### TC-05 (superseded): Plain click on a leaf opens the detail panel

Earlier revisions of this AT expected a plain click on a leaf node to
trigger an editor jump. Phase 6 (#250) replaced that behaviour: a plain
click on a leaf now opens the detail panel in the preview.

The current behaviour is covered by
[AT-0039 TC-01](./0039-vscode-phase6-detail-panel.md) and is automated in
the WebView E2E harness, so no additional manual TC is needed here.
