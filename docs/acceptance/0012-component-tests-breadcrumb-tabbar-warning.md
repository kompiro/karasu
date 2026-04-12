---
id: "0012"
title: Component tests for Breadcrumb, DiagramTabBar, and WarningPanel
type: tool
---

# Component tests for Breadcrumb, DiagramTabBar, and WarningPanel

## Background

Following the introduction of `@testing-library/react` in #40, this AT covers
the high-priority components identified in [ADR-0058](../adr/0058-app-testing-strategy.md).

## Acceptance Criteria

### Breadcrumb

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 1 | Renders nothing when items list is empty | `Breadcrumb.test.tsx` | |
| 2 | Clicking the first item calls `onNavigate([])` | `Breadcrumb.test.tsx` | |
| 3 | Clicking a middle item calls `onNavigate` with the correct path (items from index 1 up to clicked index) | `Breadcrumb.test.tsx` | |
| 4 | The last item is non-interactive (not a button; clicking it does not call `onNavigate`) | `Breadcrumb.test.tsx` | |

### DiagramTabBar

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 5 | Clicking the System tab calls `onChange("system")` | `DiagramTabBar.test.tsx` | |
| 6 | Clicking the Deploy tab calls `onChange("deploy")` when `hasDeployDiagram` is true | `DiagramTabBar.test.tsx` | |
| 7 | Clicking the Org tab calls `onViewKindChange("org")` | `DiagramTabBar.test.tsx` | |
| 8 | The Deploy tab has `aria-disabled=true` when `hasDeployDiagram` is false | `DiagramTabBar.test.tsx` | |
| 9 | The active tab has `aria-selected=true`; inactive tabs have `aria-selected=false` | `DiagramTabBar.test.tsx` | |

### WarningPanel

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 10 | Renders nothing when the warnings list is empty | `WarningPanel.test.tsx` | |
| 11 | Clicking the header collapses the warning list | `WarningPanel.test.tsx` | |
| 12 | Clicking the header again expands the warning list | `WarningPanel.test.tsx` | |
| 13 | A warning with kind `domain-dispersal` or `style-conflict` shows the ⚠ icon (U+26A0) | `WarningPanel.test.tsx` | |
| 14 | A warning with kind `missing-runtime` or `missing-realizes` shows the ℹ icon (U+2139) | `WarningPanel.test.tsx` | |
| 15 | A warning with an unknown kind falls back to the ⚠ icon | `WarningPanel.test.tsx` | |
