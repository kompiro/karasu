---
paths:
  - "packages/app/**/*.tsx"
  - "packages/app/**/*.css"
---

# App UI Rules — Toolbar Buttons

## Toolbar button tiers (ADR 0022)

Toolbar buttons have two visual tiers:

### Tier 1 — Actionable buttons
Persistent actions the user needs to notice and click.
Add **both** `toolbar-btn--actionable` and a button-specific modifier class:

```tsx
// Example
<button className="toolbar-btn toolbar-btn--actionable toolbar-btn--export">
  ↓ Export SVG
</button>
```

In CSS, define only the properties that differ from `--actionable` in the button-specific class:

```css
/* Only overrides — shared styles live in .toolbar-btn--actionable */
.toolbar-btn--export {
  /* e.g. border-radius override for split button */
}
```

### Tier 2 — Ghost / contextual buttons
Low-priority or contextual buttons. Use only the base `toolbar-btn` class (no `--actionable`).

## Label rule (ADR 0007)

Every toolbar button requires an **icon + text label**. Icon-only buttons are not allowed:

```tsx
// Good
<button className="toolbar-btn toolbar-btn--actionable toolbar-btn--focus">
  ↗ Focus
</button>

// Bad
<button className="toolbar-btn toolbar-btn--actionable toolbar-btn--focus">
  ↗
</button>
```

## Adding a new toolbar button — checklist

1. **Choose a tier**: Persistent action? → Tier 1 (`toolbar-btn--actionable`). Contextual/secondary? → Tier 2.
2. **Add a modifier class**: Always create a `toolbar-btn--<name>` class in `app.css`, even if it has no extra properties beyond `--actionable`. This keeps per-button overrides easy to find.
3. **Include icon + text label** in the button content.
4. **Update ADR 0022** (`docs/adr/0022-toolbar-btn-actionable.md`) if the tier classification is non-obvious.
