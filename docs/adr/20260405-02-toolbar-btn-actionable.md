---
id: ADR-20260405-02
title: Toolbar Button Actionable Modifier Class
status: accepted
date: 2026-04-05
topic: app-ui
related_to:
  - ADR-20260330-02
scope:
  packages:
    - app
---

# ADR-20260405-02: Toolbar Button Actionable Modifier Class

**Date:** 2026-04-05
**Status:** Accepted
**Amends:** ADR 0015 (Rule #2 — per-button CSS blocks)

---

## Context

ADR 0015 introduced a two-tier classification for toolbar buttons and required each Tier 1 button
to define its own CSS block, even when the visual properties were identical:

```css
.toolbar-btn--all-layers { background: var(--bg-raised); color: ...; border-color: ...; }
.toolbar-btn--all-layers:hover { background: var(--accent-dim); ... }

.toolbar-btn--all-views { background: var(--bg-raised); color: ...; border-color: ...; }
.toolbar-btn--all-views:hover { background: var(--accent-dim); ... }
/* ...repeated for --icon-mode, --export, --reference, --focus */
```

This duplication was flagged in #244 (Preview All Views): adding a new Tier 1 button required
manually copying CSS from an existing button to avoid looking visually disabled. The rule intended
to keep per-button overrides easy to locate, but in practice it made the shared Tier 1 contract
implicit and easy to violate.

---

## Decision

Introduce `.toolbar-btn--actionable` as the single CSS class encoding the Tier 1 visual contract:

```css
.toolbar-btn--actionable {
  background: var(--bg-raised);
  color: var(--text-secondary);
  border-color: var(--border-strong);
}

.toolbar-btn--actionable:hover {
  background: var(--accent-dim);
  color: var(--accent-hover);
  border-color: rgba(77, 143, 255, 0.4);
}
```

Tier 1 buttons use both `toolbar-btn--actionable` and their button-specific modifier:

```tsx
<button className="toolbar-btn toolbar-btn--actionable toolbar-btn--reference">
  ? Reference
</button>
```

Button-specific classes retain only properties that genuinely differ (e.g., `font-weight: 600`
for `.toolbar-btn--reference`). Classes with no overrides are still defined in CSS as empty
placeholders so that future per-button changes have a clear home.

### Amendment to ADR 0015 Rule #2

Old rule:
> Always add a `toolbar-btn--<name>` modifier class and define its CSS explicitly, **even if the
> style is the same as another button**.

New rule:
> Always add a `toolbar-btn--<name>` modifier class. For Tier 1 buttons, also add
> `toolbar-btn--actionable`; define per-button overrides only for properties that differ from
> the actionable base. An empty rule block is acceptable as a placeholder.

---

## Consequences

- Adding a new Tier 1 button requires only adding `toolbar-btn--actionable` — no CSS copying.
- The Tier 1 visual contract is a single source of truth; changing it propagates to all buttons.
- Per-button classes remain in CSS for targeted overrides and discoverability.
- `.claude/rules/app-ui.md` documents this pattern for Claude and human contributors.
