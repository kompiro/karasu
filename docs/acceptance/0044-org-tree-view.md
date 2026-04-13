---
id: AT-0044
title: Org Tree View
type: acceptance-test
---

# AT-0044: Org Tree View

## Overview

Verify the Tree View mode on the Org tab renders the org hierarchy as a left-right tree
with Bezier connectors and click-to-expand member leaf nodes.

## Prerequisites

- A `.krs` file with an `organization` block containing nested teams and members.
- `karasu serve` running, or open the app in a browser.

Example `.krs`:
```
organization Acme {
  team Engineering {
    team Backend {
      member alice { label "Alice" }
      member bob   { label "Bob" }
    }
    team Frontend {
      member carol { label "Carol" }
    }
  }
  team Product {
    member dave { label "Dave" }
  }
}
```

## Test Cases

### AT-0044-1: Tree View toggle appears on Org tab only

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Tree View toggle appears on Org tab only (Case 1)`

1. Switch to the **System** tab.
2. **Expected**: No "Tree View" button in the toolbar.
3. Switch to the **Org** tab.
4. **Expected**: "⬡ Tree View" button appears in the toolbar.

### AT-0044-2: Activate Tree View

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Activating Tree View renders top-level teams as roots and hides breadcrumb (Cases 2 & 3)`

1. On the Org tab, click **⬡ Tree View**.
2. **Expected**:
   - Button becomes active (highlighted).
   - Preview area shows a left-right tree with top-level teams as root nodes.
   - Breadcrumb bar is hidden.
   - Each team card shows the team label and member count (e.g., "2 members ▾").

### AT-0044-3: Top-level teams are root nodes (no org block shown)

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Activating Tree View renders top-level teams as roots and hides breadcrumb (Cases 2 & 3)`

1. In Tree View mode, verify the `organization` block label (e.g., "Acme") is NOT shown.
2. **Expected**: `Engineering` and `Product` appear as the leftmost nodes.

### AT-0044-4: Sub-teams appear to the right with Bezier connectors

> 🟡 Partially automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Sub-teams render to the right of their parent (Case 4, DOM only)`（Bezier 曲線の視覚確認は手動）

1. In Tree View mode, observe `Engineering`.
2. **Expected**:
   - `Backend` and `Frontend` appear to the right of `Engineering`.
   - Smooth Bezier curves connect parent to children.

### AT-0044-5: Expand members by clicking a team card

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Click to expand members; click again to collapse (Cases 5 & 7)`

1. Click on **Backend** team card.
2. **Expected**:
   - Member cards for `Alice` and `Bob` appear as leaf nodes to the right of `Backend`.
   - Member count indicator changes from "▾" to "▴".
   - Bezier connector appears from `Backend` to the member group.

### AT-0044-6: Multiple teams can be expanded simultaneously

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Multiple teams can be expanded simultaneously (Case 6)`

1. Click **Backend** to expand it.
2. Click **Frontend** to expand it.
3. **Expected**: Both teams show their member leaf nodes simultaneously.

### AT-0044-7: Collapse members by clicking again

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Click to expand members; click again to collapse (Cases 5 & 7)`

1. With `Backend` expanded, click it again.
2. **Expected**: Member cards disappear. Indicator returns to "▾".

### AT-0044-8: Deactivate Tree View

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Deactivating Tree View restores breadcrumb bar (Case 8)`

1. Click **⬡ Tree View** again to toggle off.
2. **Expected**: Normal drill-down grid view is restored. Breadcrumb bar reappears.

### AT-0044-9: Export SVG in Tree View mode

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Export SVG in Tree View produces -tree.svg with all members embedded (Case 9)`

1. Activate Tree View mode.
2. Click **↓ Export SVG**.
3. **Expected**:
   - A file named `org-<name>-tree.svg` is downloaded.
   - Opening the file shows all teams AND all members fully expanded (static, no JavaScript needed).
   - All member leaf nodes are visible regardless of expand state in the app.

### AT-0044-10: Multiple organizations — each top-level team stacked vertically

> ✅ Automated — `packages/e2e/tests/at-0044-org-tree-view.spec.ts` › `Multiple organizations — top-level teams from each org appear as roots (Case 10)`

1. Use a `.krs` with two `organization` blocks.
2. In Tree View mode.
3. **Expected**: Top-level teams from both organizations appear as separate roots stacked vertically.
