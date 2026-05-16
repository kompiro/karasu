---
paths:
  - "packages/app/**/*.tsx"
  - "packages/app/**/*.css"
---

# App UI Rules — Modal Dialogs

karasu adopted shadcn/ui + Tailwind v4 in [ADR-20260515-01](../../docs/adr/20260515-01-adopt-shadcn-ui.md).
**All new modal dialogs use the shadcn `Dialog` primitive.** The legacy
`.dialog-overlay` / `.dialog` / `.dialog__*` class structure is
deprecated — kept only so existing CSS continues to render until each
remaining dialog is migrated, but no new code should add it.

## New dialogs — use shadcn `Dialog`

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[480px] gap-3" hideCloseButton>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Optional one-line hint.</DialogDescription>
        </DialogHeader>
        <div>{/* body */}</div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="actionable" onClick={/* ... */}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### What Radix gives you for free

- Focus trap inside the dialog (no keyboard escape to the page behind)
- Esc to close, pointer-down-outside to close (via `DismissableLayer`)
- `role="dialog"` + `aria-modal="true"` on `DialogContent`
- Return focus to the trigger element when the dialog closes
- Portal mounting — z-index conflicts with the editor are not your problem

Do **not** add the bespoke `document.addEventListener("keydown")` or
overlay-onClick listeners that the legacy dialogs used. They are
redundant under Radix and risk firing twice.

## Width and per-dialog overrides

`DialogContent` defaults to `max-w-lg`. Override per dialog with a Tailwind
utility:

```tsx
<DialogContent className="max-w-[640px] gap-3">
```

If a dialog needs structural styling beyond width/padding, use
feature-prefixed CSS classes (`.paste-compare-dialog__textarea`,
`.snapshot-picker-item`, …) — do not introduce new shared `.dialog__*`
names.

## Close button

shadcn `DialogContent` renders a top-right `X` close button by default.
If the dialog already has a Cancel/Close action in its footer, pass
`hideCloseButton` to suppress the extra X. Most karasu dialogs hide it.

## Adding a new dialog — checklist

1. Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`,
   `DialogFooter` (plus `DialogDescription` for an optional subtitle).
2. Pass `open` and `onOpenChange` as a controlled pair. Map close to
   `(v) => !v && onClose()`.
3. Title goes inside `DialogTitle` for a11y — Radix warns if missing.
4. Footer buttons use the shadcn `Button` primitive (see `app-ui.md`) —
   `variant="actionable"` for the confirm action, default `ghost` for Cancel.
5. If a primary input should be auto-focused (e.g. a textarea), use a
   `useRef` + `useEffect` with a `setTimeout(..., 0)` so Radix's
   focus-on-open settles before you focus your element.

## Testing a dialog

shadcn primitives **portal their content to `document.body`** — so
`container.querySelector(...)` from the test render won't find dialog
DOM. Query from `document`:

```tsx
const dialog = document.querySelector(".my-feature-dialog");
// or
const dialog = screen.getByRole("dialog");
```

See `.claude/rules/testing.md` for the wider rule (which also covers
Tabs, Popover, Tooltip).

## Legacy dialogs (deprecated)

The pre-shadcn structure was:

```tsx
<div className="dialog-overlay" role="dialog" aria-modal="true" onClick={onClose}>
  <div className="dialog dialog--my-feature" onClick={(e) => e.stopPropagation()}>
    <header>
      <h2 className="dialog__title">Title</h2>
    </header>
    <div className="dialog__body">{/* ... */}</div>
    <footer className="dialog__footer">{/* ... */}</footer>
  </div>
</div>
```

The CSS for `.dialog-overlay`, `.dialog`, `.dialog__title`,
`.dialog__subtitle`, `.dialog__body`, `.dialog__footer` is retained in
`app.css` only while remaining un-migrated dialogs exist. **Do not write
new code using these classes.** When you touch a legacy dialog, migrate
it to the shadcn pattern above in the same PR.
