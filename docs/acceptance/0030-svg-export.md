# AT-0030: SVG Export

## Overview

Verify that the SVG export feature works correctly for both the current-view export
and the drill-down view export.

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
- The button is enabled whenever a diagram is loaded.

### AT-0030-2: Export SVG filename uses the current node name

**Steps:**
1. Open the app with a project loaded.
2. Click "↓ Export SVG" while on the System tab at root level (e.g., system named "MySystem").

**Expected:**
- A file named `system-MySystem.svg` is downloaded.
- Opening the file in a browser renders the diagram correctly.
- The file is valid SVG (no script tags or broken markup).

### AT-0030-3: Export SVG filename reflects drill-down state

**Steps:**
1. Drill down into a service node (e.g., "ECommerce").
2. Click "↓ Export SVG".

**Expected:**
- A file named `system-ECommerce.svg` is downloaded (last breadcrumb item is used).

### AT-0030-4: Export SVG filename reflects the active tab

**Steps:**
1. Switch to the Deploy tab (with a deploy block named "Production" selected).
2. Click "↓ Export SVG".

**Expected:**
- A file named `deploy-Production.svg` is downloaded.
- If no deploy block is selected, the file is named `deploy-deploy.svg`.

### AT-0030-5: Export SVG filename sanitizes special characters

**Steps:**
1. Use a project where a node label contains spaces or special characters (e.g., "E Commerce API").
2. Click "↓ Export SVG".

**Expected:**
- Spaces in the node name are replaced with underscores (e.g., `system-E_Commerce_API.svg`).
- Japanese characters are preserved as-is (e.g., `system-受注システム.svg`).

---

## Phase 2 — Drill-down View

> **Note:** This feature generates a self-navigating SVG where top-level nodes link to
> their direct children (two layers: root → direct children). Each level is shown one
> at a time using CSS `:target` + `:has()` navigation — no JavaScript required.
> This is distinct from Full View (all nodes visible simultaneously), which is tracked
> in issue #147.

### AT-0030-6: Drill-down View button is visible only on the System tab

**Steps:**
1. Open the app with a project loaded.
2. Navigate to System, Deploy, and Org tabs in turn.

**Expected:**
- The "⊞ Drill-down View" button is visible in the toolbar on all tabs.
- The button is **enabled** only on the System tab; it is **disabled** on Deploy and Org tabs.
- The button has both an icon (⊞) and a text label.

### AT-0030-7: Drill-down View toggle switches the preview to iframe view

**Steps:**
1. On the System tab, click "⊞ Drill-down View" to enable it.

**Expected:**
- The preview area switches from the interactive drill-down view to a self-navigating iframe.
- All top-level service nodes are visible simultaneously.
- Nodes that have child nodes appear clickable.

### AT-0030-8: Navigation works in drill-down view (CSS :target, one level deep)

**Steps:**
1. Enable Drill-down View.
2. Click on a service node that has child nodes.

**Expected:**
- The view transitions to the child level within the same iframe.
- The URL fragment updates (e.g., `#krs-view-ECommerce`).
- The root view is hidden; the child view is shown.
- A "← [Service Name]" back button is visible.

### AT-0030-9: Back button returns to the root view

**Steps:**
1. Enable Drill-down View and navigate to a child view (AT-0030-8).
2. Click the "←" back button.

**Expected:**
- The view returns to the root level (all services visible).
- The root view is shown; the child view is hidden.

### AT-0030-10: Export SVG in Drill-down View downloads the multi-level SVG

**Steps:**
1. Enable Drill-down View.
2. Click "↓ Export SVG".

**Expected:**
- A file named `system-{NodeName}-drilldown.svg` is downloaded
  (e.g., `system-MySystem-drilldown.svg`).
- Opening the file in a modern browser (Chrome 105+, Firefox 121+, Safari 15.4+)
  shows the root level with clickable nodes.
- Clicking a service node navigates to its children.
- The back button returns to the root view.
- The downloaded SVG contains no JavaScript (`<script>` tags).

### AT-0030-11: Switching away from System tab disables and resets Drill-down View

**Steps:**
1. Enable Drill-down View on the System tab.
2. Switch to the Deploy or Org tab.
3. Switch back to the System tab.

**Expected:**
- Drill-down View is automatically disabled when leaving the System tab.
- The System tab returns to the normal interactive drill-down view (not the iframe view).

### AT-0030-12: Drill-down View toggle turns off and restores normal view

**Steps:**
1. Enable Drill-down View.
2. Click "⊞ Drill-down View" again to disable it.

**Expected:**
- The preview reverts to the normal interactive drill-down view.
- Pan/zoom and click-to-drill-down work as before.
