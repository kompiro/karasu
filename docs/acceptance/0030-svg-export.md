# AT-0030: SVG Export

## Overview

Verify that the SVG export feature works correctly for both the current-view export
and the full multi-level drill-down export.

## Setup

- Open the app with a project that has at least one service node with child nodes.
- The "Getting Started" project included by default is sufficient.

---

## Phase 1 — Current View Export

### AT-0030-1: Export SVG button is visible in toolbar

**Steps:**
1. Open the app.
2. Navigate to any diagram tab (System / Deploy / Org).

**Expected:**
- An "↓ Export SVG" button is visible in the preview toolbar.
- The button has both an icon (↓) and a text label.
- The button is disabled when no diagram is loaded.

### AT-0030-2: Export SVG downloads the current view

**Steps:**
1. Open the app with a project loaded.
2. Click "↓ Export SVG" while on the System tab.

**Expected:**
- A file named `diagram-system.svg` is downloaded.
- Opening the file in a browser renders the diagram correctly.
- The file is valid SVG (no script tags or broken markup).

### AT-0030-3: Export SVG reflects the active tab

**Steps:**
1. Switch to the Deploy tab.
2. Click "↓ Export SVG".

**Expected:**
- A file named `diagram-deploy.svg` is downloaded.
- The downloaded SVG shows the deploy diagram, not the system diagram.

---

## Phase 2 — Full View Toggle and Drill-Down Export

### AT-0030-4: Full View toggle button is visible in toolbar

**Steps:**
1. Open the app with a project loaded.

**Expected:**
- A "⊞ Full View" button is visible in the preview toolbar.
- The button has both an icon (⊞) and a text label.
- The button shows a pressed/active state when toggled on.

### AT-0030-5: Full View toggle switches the preview to iframe view

**Steps:**
1. Open the app with a project loaded.
2. Click "⊞ Full View" to enable full view mode.

**Expected:**
- The preview area switches from the interactive drill-down view to a full-view iframe.
- All top-level service nodes are visible simultaneously.
- Nodes that have child nodes appear clickable (cursor: pointer).

### AT-0030-6: Drill-down navigation works in full view (CSS :target)

**Steps:**
1. Enable Full View mode.
2. Click on a service node that has child nodes.

**Expected:**
- The view transitions to the child drill-down view within the same iframe.
- The URL fragment updates (e.g., `#krs-view-ECommerce`).
- The root view is hidden; the child view is shown.
- A "← [Service Name]" back button is visible.

### AT-0030-7: Back button returns to the root view

**Steps:**
1. Enable Full View and navigate to a child view (AT-0030-6).
2. Click the "←" back button.

**Expected:**
- The view returns to the root level (all services visible).
- The root view is shown; the child view is hidden.

### AT-0030-8: Export SVG in Full View mode downloads the multi-level SVG

**Steps:**
1. Enable Full View mode.
2. Click "↓ Export SVG".

**Expected:**
- A file named `diagram-system-full.svg` is downloaded.
- Opening the file in a modern browser (Chrome 105+, Firefox 121+, Safari 15.4+) shows the full view.
- Clicking a service node navigates to the drill-down view.
- The back button returns to the root view.
- The downloaded SVG contains no JavaScript (`<script>` tags).

### AT-0030-9: Full View toggle turns off and restores drill-down mode

**Steps:**
1. Enable Full View mode.
2. Click "⊞ Full View" again to disable it.

**Expected:**
- The preview reverts to the normal interactive drill-down view.
- Pan/zoom and click-to-drill-down work as before.
