---
type: acceptance-test
issue: "#1697"
feature: "Light-theme deploy node labels are readable (dark text)"
date: 2026-06-18
---

# AT-1697: deploy node labels are readable in the light theme

## Overview

Rendering a `deploy` diagram with the light theme previously produced deploy
node labels in the default white (`#F9FAFB`) — unreadable on the light pastel
cards. The light-theme template now gives each deploy kind a hue-matched dark
text `color`, so labels read clearly. Dark theme is unchanged.

Automated coverage: `packages/core/src/renderer/deploy-renderer.test.ts`
(`light theme renders dark, readable node text (not the white default)`).

## AC-1: light-theme deploy node text is dark (automated)

**Steps:** resolve styles with the light builtin sheet for a deploy slice and
`renderDeploy(slice, lightStyles, "shape")`.

**Expected:** an `oci` unit's label text is `#1E3A8A` (dark blue), not `#F9FAFB`
(white). Each deploy kind has its own dark text color (`lambda → #4C1D95`,
`job → #7F1D1D`, …).

## AC-2: dark theme unchanged (automated)

**Expected:** in the dark theme, deploy node label text stays `#F9FAFB` (white) —
readable on the dark cards; no change.

## AC-3 (manual): the SVG reads well on a white background

**Steps:**
1. `karasu render index.krs --view deploy --theme light --output deploy.svg`
2. Open `deploy.svg` on a white background (GitHub preview / browser).

**Expected:** every deploy node's label is legible against its card — no
white-on-light text.
