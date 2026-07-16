# Acceptance Test: VSCode Extension Phase 4 — Bidirectional Jump (#177)

## Summary

Verify that moving the cursor in the editor highlights the corresponding node in the SVG
preview, and clicking an SVG node in the preview jumps the editor cursor to that node's
definition.

---

## Prerequisites

- The extension is loaded in VSCode Extension Development Host (F5 from `packages/vscode`)
- A `.krs` file with the following content is open in the editor:

```krs
system MySystem {
  service Auth {
    domain Login {}
  }
  service Payment {}
  Auth -> Payment
}
```

- The preview panel is open (`karasu: Open Preview`) and showing the System view

---

## Test Cases

### 1. Editor → Preview highlight (cursor movement)

> 🟡 Partially automated —
> [`packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts`](../../packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts)
> › `AT-0037-9: editor cursor on a node identifier highlights the matching SVG node`
> automates step 1.1 under the WebView E2E harness (ADR-20260429-09; not a
> required check). Steps 1.2–1.5 (highlight hand-off, clearing on a blank
> line, debounce) stay manual.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1.1 | Click anywhere on the `service Auth {` line in the editor | Within ~150 ms, the **Auth** node in the SVG is highlighted with a colored stroke |
| 1.2 | Click anywhere on the `domain Login {}` line | The **Login** node is highlighted; the **Auth** highlight is removed |
| 1.3 | Click anywhere on the `system MySystem {` line | The **MySystem** node is highlighted |
| 1.4 | Click on a blank line between nodes | All highlights are cleared (no node highlighted) |
| 1.5 | Move cursor rapidly through multiple lines | Only the final destination node is highlighted (debounce works) |

### 2. Preview → Editor jump (node click) — superseded

Earlier revisions of this AT expected a plain click on any SVG node to jump
the editor cursor to the node's definition. That behaviour has been
superseded since Phase 4: a plain click on a node with children drills the
preview down (Phase 3.5, #218), and a plain click on a leaf opens the detail
panel (Phase 6, #250).

The editor jump is now covered by:

- **Cmd/Ctrl+Click** on any node —
  [AT-0038 TC-03/TC-04](./0038-vscode-phase4-5-cmd-click-hint.md), automated in
  [`packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts`](../../packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts).
- The detail panel's **Jump to editor** button —
  [AT-0039 TC-03](./0039-vscode-phase6-detail-panel.md), automated in
  [`packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts`](../../packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts).

No additional manual steps are needed here. Read the §3 round-trip steps
below through those interactions as well ("click → jump" in 3.1/3.3 means
Cmd/Ctrl+Click or the Jump to editor button).

### 3. Round-trip navigation

| Step | Action | Expected Result |
|------|--------|----------------|
| 3.1 | Click **Auth** node in preview → editor jumps to `service Auth {` | Cursor lands on that line |
| 3.2 | Without moving the cursor, observe the preview | **Auth** node remains highlighted (cursor-tracking confirms the position) |
| 3.3 | Click **Login** node in preview → editor jumps to `domain Login {}` | Cursor lands on the nested node's line; **Login** node is highlighted |

### 4. Edge cases

| Step | Action | Expected Result |
|------|--------|----------------|
| 4.1 | Introduce a syntax error in the `.krs` file | Bidirectional jump degrades gracefully — cursor tracking may return no highlight, but does not crash |
| 4.2 | Fix the syntax error | Bidirectional jump resumes working normally |
| 4.3 | Close and reopen the preview panel, then move the cursor | Highlight works again after the panel is recreated |

---

## Pass Criteria

All test cases above pass. Cursor movement in the editor highlights the corresponding SVG
node within the debounce window (~150 ms), and clicking an SVG node moves the editor cursor
to that node's definition without errors.
