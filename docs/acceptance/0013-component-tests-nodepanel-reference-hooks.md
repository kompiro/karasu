---
id: "0013"
title: Component tests for NodeDetailPanel, ReferencePanel, useKarasu, and useOrgView
type: tool
---

# Component tests for NodeDetailPanel, ReferencePanel, useKarasu, and useOrgView

## Background

Medium-priority tests identified in [ADR-0058](../adr/0058-app-testing-strategy.md).
Covers security (DOMPurify sanitization), UI interaction (tab switching, copy feedback),
and hook behavior (debounce, error resilience).

## Acceptance Criteria

### NodeDetailPanel

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 1 | Markdown in `description` is rendered as HTML (`**bold**` → `<strong>`) | `NodeDetailPanel.test.tsx` | |
| 2 | XSS content in `description` is removed by DOMPurify (`<script>` tag not present in rendered output) | `NodeDetailPanel.test.tsx` | |
| 3 | Click inside the panel does not propagate to the parent element | `NodeDetailPanel.test.tsx` | |
| 4 | Clicking the Close button calls `onClose` | `NodeDetailPanel.test.tsx` | |

### ReferencePanel

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 5 | Renders nothing when `isOpen` is `false` | `ReferencePanel.test.tsx` | |
| 6 | Clicking a tab renders that tab's content and hides other tabs' content | `ReferencePanel.test.tsx` | |
| 7 | Clicking the overlay calls `onClose` | `ReferencePanel.test.tsx` | |
| 8 | Clicking inside the panel does not call `onClose` | `ReferencePanel.test.tsx` | |
| 9 | Copy button shows "Copied!" immediately after click and reverts to "Copy" after 2 seconds | `ReferencePanel.test.tsx` | |

### useKarasu

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 10 | Initial state is compiled synchronously on mount — `svg` is non-empty without advancing timers | `useKarasu.test.tsx` | |
| 11 | Source changes are debounced: `svg` does not update until 300ms after the last change | `useKarasu.test.tsx` | |
| 12 | When updated source produces errors, the previous valid `svg` is retained and `diagnostics` contains an error | `useKarasu.test.tsx` | |

### useOrgView

| # | Criterion | How to verify | Manual? |
|---|-----------|---------------|:-------:|
| 13 | Source changes are debounced: `orgSvg` does not update until 300ms after the last change | `useOrgView.test.tsx` | |
| 14 | When updated source produces errors, the previous valid `orgSvg` is retained | `useOrgView.test.tsx` | |
