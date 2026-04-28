---
id: AT-0050
title: Collapse button in ProjectMode only collapses FileTree, not ProjectSelector toolbar
type: acceptance-test
issue: "#427"
date: 2026-04-09
---

## Overview

Verify that in ProjectMode, the sidebar Collapse/Expand button only hides the FileTree panel. The ProjectSelector toolbar (project switching, create/rename/delete buttons) must remain visible and functional while the FileTree is collapsed.

## Manual Verification Steps

1. Open the app in ProjectMode (OPFS mode).
2. Verify the sidebar shows both the ProjectSelector toolbar (top) and the FileTree (below).
3. Click the **« Collapse** button.

### After collapsing

> ✅ Automated — `packages/e2e/tests/at-0050-filetree-collapse-scope.spec.ts` › `collapse hides the FileTree while keeping the ProjectSelector toolbar accessible`

- [ ] The FileTree disappears
- [ ] The **ProjectSelector toolbar remains visible** — project name dropdown and action buttons are accessible
- [ ] The **» Expand** button appears at the left edge
- [ ] The editor and preview panels expand to fill the available space

### Project switching while collapsed

- [ ] Switching projects via the ProjectSelector dropdown works normally while the FileTree is collapsed
- [ ] Creating / renaming / deleting a project via the toolbar works normally while collapsed

> manual / visual review — verifies the toolbar stays interactive across collapse states; depends on real OPFS-backed projects and live layout shift.

### Expanding again

> ✅ Automated — `packages/e2e/tests/at-0050-filetree-collapse-scope.spec.ts` › `expand restores the FileTree and preserves the ProjectSelector toolbar`

- [ ] Clicking **» Expand** restores the FileTree
- [ ] The ProjectSelector toolbar remains visible throughout (never disappears on expand/collapse cycles)

### Preview-focused mode (regression)

> ✅ Automated — `packages/e2e/tests/at-0050-filetree-collapse-scope.spec.ts` › `preview focus mode hides both FileTree and ProjectSelector toolbar (regression)`

- [ ] Entering Preview-focused mode (↗ Focus button) hides both the FileTree AND the ProjectSelector toolbar (existing behavior preserved)
- [ ] Exiting Preview-focused mode restores both
