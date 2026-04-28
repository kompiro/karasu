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

| Step | Action                                                    | Expected Result                                                                   |
| ---- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1.1  | Click anywhere on the `service Auth {` line in the editor | Within ~150 ms, the **Auth** node in the SVG is highlighted with a colored stroke |
| 1.2  | Click anywhere on the `domain Login {}` line              | The **Login** node is highlighted; the **Auth** highlight is removed              |
| 1.3  | Click anywhere on the `system MySystem {` line            | The **MySystem** node is highlighted                                              |
| 1.4  | Click on a blank line between nodes                       | All highlights are cleared (no node highlighted)                                  |
| 1.5  | Move cursor rapidly through multiple lines                | Only the final destination node is highlighted (debounce works)                   |

### 2. Preview → Editor jump (node click)

| Step | Action                                                             | Expected Result                                          |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| 2.1  | Click the **Payment** node in the SVG preview                      | The editor cursor jumps to the `service Payment {}` line |
| 2.2  | Click the **Auth** node in the SVG preview                         | The editor cursor jumps to the `service Auth {` line     |
| 2.3  | Click the **MySystem** node in the SVG preview                     | The editor cursor jumps to the `system MySystem {` line  |
| 2.4  | If the target line is not visible, click a node that is off-screen | The editor scrolls to reveal the node's definition       |

### 3. Round-trip navigation

| Step | Action                                                              | Expected Result                                                           |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 3.1  | Click **Auth** node in preview → editor jumps to `service Auth {`   | Cursor lands on that line                                                 |
| 3.2  | Without moving the cursor, observe the preview                      | **Auth** node remains highlighted (cursor-tracking confirms the position) |
| 3.3  | Click **Login** node in preview → editor jumps to `domain Login {}` | Cursor lands on the nested node's line; **Login** node is highlighted     |

### 4. Edge cases

| Step | Action                                                   | Expected Result                                                                                      |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 4.1  | Introduce a syntax error in the `.krs` file              | Bidirectional jump degrades gracefully — cursor tracking may return no highlight, but does not crash |
| 4.2  | Fix the syntax error                                     | Bidirectional jump resumes working normally                                                          |
| 4.3  | Close and reopen the preview panel, then move the cursor | Highlight works again after the panel is recreated                                                   |

---

## Pass Criteria

All test cases above pass. Cursor movement in the editor highlights the corresponding SVG
node within the debounce window (~150 ms), and clicking an SVG node moves the editor cursor
to that node's definition without errors.
