---
type: acceptance-test
issue: "#1666"
feature: "Icon Mode renders icons on the deploy view"
date: 2026-06-18
---

# AT-1666: deploy-view nodes render icons in Icon Mode

## Overview

Toggling Icon Mode on a `deploy` diagram previously did nothing — deploy units
(`oci` / `lambda` / `jar` / `war` / `function` / `job` / `assets` / `artifact` /
`store`) kept rendering as plain shape cards. Root cause: the resolved icon
style (`shape: url("oci")`) is stored under the bare unit id (`order-api`), but
the deploy layout keys nodes as `containerId::unitId` (`ECommerce::order-api`),
so the renderer's style lookup missed and fell back to `defaultNodeStyle` (a
string `box` shape) — never reaching the icon path. The lookup now falls back to
`layoutNode.id` (the bare AST id), so deploy units pick up their icon shape.

The **org** view already rendered team/member pictograms in Icon Mode and is
unchanged (covered by a guard so it does not regress).

Automated coverage: `packages/core/src/renderer/deploy-renderer.test.ts`
(`draws the registered icon glyph for a unit in Icon Mode (#1666)`).

## AC-1: deploy unit draws its icon glyph in Icon Mode (automated)

**Steps:** resolve styles with the icon theme + register the `oci` icon, then
`renderDeploy(slice, iconStyles, "icon")`.

**Expected:** the SVG contains the icon glyph wrapper
(`<g transform="translate(...) scale(...)">`) for the unit; in shape mode (styles
without the icon theme) it does not.

## AC-2: org Icon Mode still draws pictograms (automated / unchanged)

**Expected:** `compile(orgKrs, { diagramType: "org", displayMode: "icon" })`
renders team/member pictograms (more icon glyphs than `displayMode: "shape"`).

## AC-3 (manual): the app deploy view shows icons in Icon Mode

**Steps:**
1. Open a `.krs` with a `deploy { ... }` block (e.g. `oci`, `lambda`, `store`).
2. Switch to the deploy view and toggle **Icon Mode**.

**Expected:** deploy nodes render as the kind's icon card (oci / lambda / … icon),
matching how the system view responds to Icon Mode — not plain shape cards.
