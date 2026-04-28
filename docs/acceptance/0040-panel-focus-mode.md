# Acceptance Test: Panel Focus Mode — Sidebar Collapse and Preview Fullscreen (#205)

## Summary

Verify that users can collapse the sidebar in ProjectMode and expand the preview
to fullscreen focus mode, and that toggling back restores the previous layout.

---

## Prerequisites

- App is running locally (`npm run dev`)
- At least one project exists in ProjectMode with a `.krs` file open

---

## Test Cases

### TC-1: Sidebar collapse toggle (ProjectMode)

> ✅ Automated — `packages/e2e/tests/at-0040-panel-focus-mode.spec.ts` › `collapses and expands the sidebar in ProjectMode (TC-1)`

| #   | Action                                           | Expected                                                       |
| --- | ------------------------------------------------ | -------------------------------------------------------------- |
| 1   | Open app in ProjectMode (OPFS-supported browser) | Sidebar (ProjectSelector + FileTree) is visible on the left    |
| 2   | Click the "Collapse" button on the sidebar edge  | Sidebar collapses, editor and preview expand to fill the space |
| 3   | Click the "Expand" button                        | Sidebar reappears with previous width                          |

### TC-2: Preview fullscreen (Focus mode)

> ✅ Automated — `packages/e2e/tests/at-0040-panel-focus-mode.spec.ts` › `enters and exits preview focus mode (TC-2)`

| #   | Action                                                   | Expected                                                                |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | In any mode, click "Focus" button in the preview toolbar | Editor (and sidebar if present) disappear; preview fills the full width |
| 2   | Verify the toolbar and tab bar remain visible            | DiagramTabBar, toolbar buttons, and WarningPanel are still accessible   |
| 3   | Click "Exit Focus" button                                | Previous layout (editor + sidebar) is restored                          |

### TC-3: Monaco editor re-layout after focus mode

| #   | Action                                 | Expected                                                                    |
| --- | -------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Type some code in the editor           | Code is visible and editable                                                |
| 2   | Enter focus mode, then exit focus mode | Monaco editor renders correctly — no blank area, scroll positions preserved |

### TC-4: MemoryMode has no sidebar toggle

| #   | Action                                                      | Expected                                         |
| --- | ----------------------------------------------------------- | ------------------------------------------------ |
| 1   | Open app in MemoryMode (OPFS not supported, or first visit) | No sidebar toggle button is visible              |
| 2   | Focus mode button is still available in the toolbar         | Clicking it hides the editor and expands preview |

### TC-5: Sidebar collapse + Focus mode interaction

> ✅ Automated — `packages/e2e/tests/at-0040-panel-focus-mode.spec.ts` › `preserves sidebar-collapsed state across focus toggle (TC-5)`

| #   | Action                               | Expected                                                                      |
| --- | ------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | In ProjectMode, collapse the sidebar | Sidebar is hidden                                                             |
| 2   | Enter focus mode                     | Editor is also hidden; only preview visible                                   |
| 3   | Exit focus mode                      | Returns to sidebar-collapsed layout (sidebar still collapsed, editor visible) |
| 4   | Expand the sidebar                   | Full 3-column layout restored                                                 |

---

## Automated Coverage

- `KarasuPreviewColumn.test.tsx`: Focus button rendering, label toggling, callback invocation, active class
- All existing tests continue to pass (150 tests)
