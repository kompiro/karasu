# App UI Rules — Modal Dialogs

Every modal dialog in `packages/app` shares a single visual base so that
color, border, shadow, and spacing stay consistent across features. Do not
invent per-dialog overlay/container classes.

## Base classes (always used)

Every dialog root uses **both** `.dialog-overlay` and `.dialog`:

```tsx
// Example
<div className="dialog-overlay" role="dialog" aria-modal="true" onClick={onClose}>
  <div className="dialog dialog--my-feature" onClick={(e) => e.stopPropagation()}>
    <header>
      <h2 className="dialog__title">Title</h2>
      <p className="dialog__subtitle">Optional subtitle</p>
    </header>
    <div className="dialog__body">{/* list, form, etc. */}</div>
    <footer className="dialog__footer">{/* action buttons */}</footer>
  </div>
</div>
```

The base gives every dialog the dark-theme surface (`--bg-overlay`,
`--border-strong`), the standard shadow, `20px` padding, and a
`min(640px, 90vw)` width. Do **not** re-declare these.

### Shared element classes

| Class              | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `.dialog-overlay`  | Fullscreen backdrop + centering                       |
| `.dialog`          | The modal box itself                                  |
| `.dialog__title`   | `<h2>` heading inside the header                      |
| `.dialog__subtitle`| Secondary text (one-line hint)                        |
| `.dialog__body`    | Scrollable content region                             |
| `.dialog__footer`  | Right-aligned action row (gap + flex-end)             |

## Per-dialog modifier

Add **one** modifier class `dialog--<name>` alongside `dialog` for things
that must differ from the base — e.g. a narrower width or a different
max-height:

```css
/* Only overrides — shared styles live in .dialog */
.dialog--snapshot-picker {
  width: min(480px, 90vw);
}
```

If a dialog needs internal element styling (buttons, lists, textareas), use
feature-prefixed classes (`.paste-compare-dialog__textarea`,
`.snapshot-picker-item`, etc.). Do not leak those rules onto the shared
`.dialog__*` names.

## Adding a new dialog — checklist

1. **Overlay root**: `<div className="dialog-overlay" ...>` with `role="dialog"` and `aria-modal="true"`.
2. **Box**: `<div className="dialog dialog--<name>" onClick={(e) => e.stopPropagation()}>`.
3. **Header**: wrap the heading in `<header>` using `.dialog__title` (+ optional `.dialog__subtitle`).
4. **Body**: `.dialog__body` for scrollable content.
5. **Footer**: `.dialog__footer` — right-aligned action buttons, using the toolbar button classes from `app-ui.md`.
6. **Close on backdrop + Escape**: overlay `onClick={onClose}`, `keydown` listener for `Escape`.
7. **Focus the primary input** on open (e.g. via `useRef` + `useEffect`).
