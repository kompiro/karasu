---
type: product
---

# AT-0033: Drill-Down SVG Export (CSS :target Navigation)

- **Date**: 2026-03-30
- **Issue**: #148
- **Related AT**: AT-0030 (current-view SVG export)

## Overview

Verify the Full View mode and drill-down SVG export. A single SVG file containing all
drill-down levels is navigable via CSS `:target` + `:has()` — no JavaScript required.

## Setup

Open the app with a project that has at least one service node containing child nodes
(e.g., the "Getting Started" project). Switch to the System tab.

---

## Phase 1 — Full View Button

### AT-0033-1: Full View button appears in toolbar on System tab

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `toggle is visible on System and disabled on Deploy (AT-0033-1, AT-0033-3)`

**Steps:**
1. Open the app on the System tab.

**Expected:**
- A "⊞ Full View" button is visible in the preview toolbar between "◇ Icon Mode" and "↓ Export SVG".
- The button has both an icon (⊞) and a text label.

### AT-0033-2: Full View button is disabled when diagram has no drill-down levels

**Steps:**
1. Open the app with a diagram that has no child nodes (all leaf nodes).

**Expected:**
- "⊞ Full View" button is disabled.

### AT-0033-3: Full View button is disabled on Deploy and Org tabs

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `toggle is visible on System and disabled on Deploy (AT-0033-1, AT-0033-3)`

**Steps:**
1. Switch to the Deploy tab. Observe the Full View button.
2. Switch to the Org tab. Observe the Full View button.

**Expected:**
- The "⊞ Full View" button is disabled on both Deploy and Org tabs.

---

## Phase 2 — Full View Mode

### AT-0033-4: Clicking Full View replaces PreviewPane with iframe

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `toggling activates and deactivates the all-layers iframe (AT-0033-4, AT-0033-8)`

**Steps:**
1. Ensure the System diagram has at least one service with child nodes.
2. Click "⊞ Full View".

**Expected:**
- The PreviewPane (interactive drill-down) is replaced by an iframe.
- The iframe shows the root level of the system diagram.
- The breadcrumb bar is hidden in Full View mode.
- The "⊞ Full View" button appears visually active (highlighted).

### AT-0033-5: Clicking service node in Full View navigates to that level

**Steps:**
1. Enable Full View.
2. Click a service node that has child nodes (it should appear visually clickable).

**Expected:**
- The iframe navigates to the service's drill-down view.
- The service's children are displayed.
- A "← Back" button appears at the top-left of the view.

### AT-0033-6: Clicking Back button returns to root

**Steps:**
1. Enable Full View, navigate to a service level (step AT-0033-5).
2. Click the "← Back" button.

**Expected:**
- The iframe returns to the root system view.

### AT-0033-7: Three-level navigation works

**Steps:**
1. Use a diagram with 3 levels (system → service → domain).
2. Enable Full View. Navigate to a service, then to a domain.
3. Click Back twice.

**Expected:**
- Navigation flows system → service → domain → service → system.
- Each level shows its "← Back" button pointing to the correct parent level.

### AT-0033-8: Clicking Full View again disables it

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `toggling activates and deactivates the all-layers iframe (AT-0033-4, AT-0033-8)`

**Steps:**
1. Enable Full View (active state).
2. Click "⊞ Full View" again.

**Expected:**
- The iframe is replaced by the normal PreviewPane.
- The "⊞ Full View" button is no longer active.

---

## Phase 3 — Export

### AT-0033-9: Export SVG in Full View mode downloads the multi-level SVG

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `Export SVG produces the all-layers file when the toggle is active (AT-0033-9)`

**Steps:**
1. Enable Full View.
2. Click "↓ Export SVG".

**Expected:**
- A file named `system-{name}-fullview.svg` is downloaded.
- The file is a valid SVG containing CSS `:target` navigation rules.

### AT-0033-10: Downloaded SVG opens and navigates in a browser

**Steps:**
1. Download the full-view SVG (AT-0033-9).
2. Open the file directly in a browser (Chrome 105+ / Firefox 121+ / Safari 15.4+).
3. Click service nodes and back buttons.

**Expected:**
- Root level is displayed by default.
- Clicking a service node navigates to its children.
- Clicking "← Back" returns to the parent level.
- No JavaScript errors occur.

### AT-0033-11: Export SVG outside Full View still downloads single-level SVG

> ✅ Automated — `packages/e2e/tests/at-0033-drilldown-export.spec.ts` › `Export SVG produces a single-level file when the toggle is inactive (AT-0033-11)`

**Steps:**
1. With Full View OFF, click "↓ Export SVG" on the System tab.

**Expected:**
- Behaviour is identical to AT-0030-2 (single-level export, filename without `-fullview`).
