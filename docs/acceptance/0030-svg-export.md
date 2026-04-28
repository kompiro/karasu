# AT-0030: SVG Export

## Overview

Verify that the SVG export feature works correctly for the current-view export.

> **Note:** Drill-down export (CSS `:target` multi-level SVG) is tracked separately in issue #148.

## Setup

- Open the app with a project that has at least one service node with child nodes.
- The "Getting Started" project included by default is sufficient.

---

## Phase 1 — Current View Export

### AT-0030-1: Export SVG button is visible in toolbar

> 🟡 Partially automated — `packages/e2e/tests/at-0030-svg-export.spec.ts` › `exports the current view as a valid SVG file`（ボタンの表示・ラベル詳細は手動）

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
