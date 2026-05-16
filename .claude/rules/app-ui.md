---
paths:
  - "packages/app/**/*.tsx"
  - "packages/app/**/*.css"
---

# App UI Rules — Buttons

karasu adopted shadcn/ui in [ADR-20260515-01](../../docs/adr/20260515-01-adopt-shadcn-ui.md).
**All buttons use the shadcn `Button` primitive** (`@/components/ui/button`).
The legacy `toolbar-btn` / `toolbar-btn--actionable` / `toolbar-btn--<name>`
class system is deprecated — no new code should add those classes.

## The two tiers map to Button variants

The tier model from ADR-20260405-02 is preserved, now expressed as
`Button` variants instead of CSS classes:

| Tier | Old class | `Button` variant |
| --- | --- | --- |
| Tier 1 — Actionable (persistent, should be noticed) | `toolbar-btn toolbar-btn--actionable` | `variant="actionable"` |
| Tier 2 — Ghost / contextual (low-priority) | `toolbar-btn` | `variant="ghost"` (the default) |

```tsx
import { Button } from "@/components/ui/button";

// Tier 1 — actionable
<Button variant="actionable" onClick={onFormat} disabled={hasParseErrors}>
  ⌥ Format
</Button>

// Tier 2 — ghost / contextual (variant defaults to "ghost")
<Button onClick={onCancel}>Cancel</Button>
```

## Sizes

`size="sm"` (default) matches the old toolbar button metrics
(`3px 9px`, 11px text). `size="md"` (`6px 14px`, 12px text) is for the
slightly larger call-to-action buttons (e.g. Chat's Start Interview /
Start Review).

## Label rule (ADR-20260328)

Every button still needs an **icon + text label** — icon-only buttons
are not allowed. This is a caller responsibility; `Button` does not
enforce it.

```tsx
// Good
<Button variant="actionable">↗ Focus</Button>

// Bad — icon only
<Button variant="actionable">↗</Button>
```

## Toggle buttons use `aria-pressed`

For buttons that toggle a state (Icon Mode, Focus, Show All Layers, …)
set `aria-pressed`. `Button` styles the pressed state automatically via
its `aria-pressed:` variant — do **not** add an `active` CSS class.

```tsx
<Button variant="actionable" aria-pressed={isFocusMode} onClick={toggle}>
  {isFocusMode ? "↙ Exit Focus" : "↗ Focus"}
</Button>
```

In tests, assert toggle state with `getAttribute("aria-pressed")`, not
a class check.

## Split buttons

For a split button (e.g. the SVG export control), keep the layout
wrapper `div.toolbar-btn-group` and override the inner buttons' border
radius with Tailwind utilities:

```tsx
<div className="toolbar-btn-group">
  <Button variant="actionable" className="rounded-r-none border-r-0" onClick={onExport}>
    ↓ Export
  </Button>
  <Button variant="actionable" className="rounded-l-none px-1.5" aria-pressed={menuOpen} ...>
    ▾
  </Button>
</div>
```

## Adding a new button — checklist

1. Import `Button` from `@/components/ui/button`.
2. Pick the variant: persistent action → `actionable`; contextual → omit
   (defaults to `ghost`).
3. Include an icon + text label.
4. If it toggles state, drive the look with `aria-pressed`, not a class.
5. Per-button tweaks (border radius, extra width) go through `className`
   — `cn()` inside `Button` merges them.

## Legacy `toolbar-btn` CSS (deprecated)

The `.toolbar-btn*` rules remain in `app.css` as dead-but-harmless CSS
pending removal in a cleanup pass. `.toolbar-btn-group` is still live —
it is the split-button layout wrapper. Do not write new code that
depends on any `.toolbar-btn` class.
