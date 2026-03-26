---
type: tool
---

# AT-0010: PreviewPane component behavior tests

- **Related Issue**: #40
- **Date**: 2026-03-25

## Overview

Verify that `PreviewPane` component callbacks and highlight behavior work correctly via automated component tests using `@testing-library/react`.

## Automated Checks

Run the following command to verify all acceptance criteria:

```bash
npm test --workspace=packages/app
```

### AC-1: `onClearHighlight` called on drill-down node click

- **Description**: Clicking a node with `data-has-children="true"` triggers `onClearHighlight` and `onDrillDown`
- **Test file**: `packages/app/src/components/PreviewPane.test.tsx`
- **Verified by**: `it("calls onClearHighlight when a node with children is clicked")`

### AC-2: `onClearHighlight` called on leaf node click

- **Description**: Clicking a node with `data-has-children="false"` triggers `onClearHighlight` and opens the detail panel
- **Test file**: `packages/app/src/components/PreviewPane.test.tsx`
- **Verified by**: `it("calls onClearHighlight when a leaf node is clicked")`

### AC-3: `onClearHighlight` NOT called on container click

- **Description**: Clicking a `data-container-id` element triggers `onContainerClick` but NOT `onClearHighlight`
- **Test file**: `packages/app/src/components/PreviewPane.test.tsx`
- **Verified by**: `it("does not call onClearHighlight when a deploy container is clicked")`

### AC-4: `highlightedNodeId` applies `.karasu-highlighted` CSS class

- **Description**: Rendering with a `highlightedNodeId` prop adds `.karasu-highlighted` to the matching element
- **Test file**: `packages/app/src/components/PreviewPane.test.tsx`
- **Verified by**: `it("applies .karasu-highlighted class to the matching element")`

### AC-5: `.karasu-highlighted` removed when `highlightedNodeId` becomes `null`

- **Description**: Re-rendering with `highlightedNodeId={null}` removes `.karasu-highlighted` from all elements
- **Test file**: `packages/app/src/components/PreviewPane.test.tsx`
- **Verified by**: `it("removes .karasu-highlighted when highlightedNodeId becomes null")`

## Manual Checks

None — all acceptance criteria are covered by automated component tests.
