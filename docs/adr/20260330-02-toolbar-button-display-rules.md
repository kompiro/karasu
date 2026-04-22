---
id: ADR-20260330-02
title: Toolbar Button Display Rules
status: accepted
date: 2026-03-30
related_to:
  - ADR-20260405-02
scope:
  packages:
    - app
  domains:
    - ui
    - toolbar
---

# ADR-20260330-02: Toolbar Button Display Rules

**Date:** 2026-03-30
**Status:** Partially superseded by [ADR 0022](20260405-02-toolbar-btn-actionable.md) (Rule #2 amended)

---

## Context

The preview column toolbar contains multiple buttons with different semantic roles:
some are persistent actions always available to the user (Export SVG, Reference, Full View),
while others are contextual toggles that appear and disappear depending on the active view
(Icon Mode appears only in the system view).

Early implementation used the base `.toolbar-btn` style for all buttons. The base style uses
`background: transparent` and `color: var(--text-muted)`, which makes buttons invisible until
hovered — a pattern appropriate only for tertiary/ghost actions. This caused the Full View button
to look disabled rather than interactive.

---

## Decision

Toolbar buttons are classified into two visual tiers, each with an explicit CSS modifier class:

### Tier 1 — Actionable buttons (always look interactive)

Buttons that represent persistent entry points or primary actions a user is expected to notice
and click. They must be visually distinct from the toolbar background at all times.

**Visual spec:**
- `background: var(--bg-raised)`
- `color: var(--text-secondary)`
- `border-color: var(--border-strong)`
- On hover: `background: var(--accent-dim)`, `color: var(--accent-hover)`, `border-color: rgba(77,143,255,0.4)`

**Applies to:** `.toolbar-btn--export`, `.toolbar-btn--reference`, `.toolbar-btn--full-view`

### Tier 2 — Ghost / contextual buttons

Buttons that are low-priority or contextual; they become visible on hover only. Use the base
`.toolbar-btn` style without an additional modifier.

**Visual spec:** `background: transparent`, `color: var(--text-muted)`, `border: 1px solid transparent`

**Applies to:** `.toolbar-btn--icon-mode` (uses Tier 1 instead — see below)

> **Note (2026-03-30):** `.toolbar-btn--icon-mode` was originally Tier 1 as well.
> If future review determines it is secondary/contextual, reclassify to Tier 2.

### Active state

All buttons share the same `.active` modifier for the "currently enabled" state:
- `background: var(--accent-dim)`
- `color: var(--accent-hover)`
- `border-color: rgba(77,143,255,0.3)`

---

## Rules for new buttons

When adding a new toolbar button:

1. **Determine tier**: Is the button a persistent action the user needs to notice? → Tier 1. Is it a low-priority or supplementary option? → Tier 2 (base style).
2. **Add a modifier class**: Always add a `toolbar-btn--<name>` modifier class and define its CSS explicitly, even if the style is the same as another button. This keeps styles easy to change independently.
3. **Document in this ADR** if the button's tier classification is non-obvious.

---

## Consequences

- Each button's visual tier is explicit in CSS; no button inherits an unintended ghost appearance by default.
- Adding a new button requires a deliberate classification choice, preventing accidental invisible buttons.
- The two-tier system may grow to three tiers (e.g., destructive/danger) in the future; update this ADR at that point.
