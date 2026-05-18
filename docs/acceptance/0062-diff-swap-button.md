---
type: acceptance-test
---

# Acceptance Test: Diff swap button (Issue #765 part A)

## Summary

Verify that the diff banner exposes a `⇄ Swap` button that flips the diff
direction in place: the compare path becomes the after-side and the project
entry becomes the before-side. Pressing Swap a second time restores the
original direction. Exiting diff mode resets the swapped state.

## Prerequisites

- App is running (the diff viewer is enabled by default — graduated in #839)
- A project with an `index.krs` file and at least one other `.krs` file

## Automated coverage

- `packages/app/src/components/DiffModeBanner.test.tsx` — Swap button
  renders, fires `onSwap`, reflects `aria-pressed`, flips label order when
  `swapped`.
- `packages/app/src/state/app-reducer.test.ts` — `TOGGLE_DIFF_SWAPPED`
  toggles when a compare path is set, is a no-op otherwise, and resets on
  `SET_COMPARE_ENTRY_PATH` or `SET_CURRENT_PROJECT`.
- `packages/app/src/hooks/useAppViews.test.tsx` — swapping a **snapshot**
  compare source re-renders the diff against the overlay FS instead of
  failing to compile (Issue #1402).

## Manual verification checklist

### TC-1: Swap flips the rendered diff

Set up `index.krs`:

```krs
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
```

Set up `before.krs`:

```krs
system Shop {
  service Catalog
}
```

- [ ] Right-click `before.krs` in the file tree → "Compare with current".
- [ ] The diff banner shows `before.krs → index.krs`, with `Orders` and its
      edge rendered as added (green).
- [ ] Click **⇄ Swap**. The banner now reads `index.krs → before.krs` and
      `Orders` (plus its edge) is rendered as removed (red).
- [ ] The Swap button has `aria-pressed="true"` (visually highlighted).
- [ ] Click **⇄ Swap** again. Direction returns to the original orientation.

> manual / visual review — visually confirms the diff colors flip when the swap toggles direction; banner text and SVG re-render must agree.

### TC-2: Exiting diff mode resets the swap

- [ ] While swapped, click **✕ Exit diff**. Diff mode ends.
- [ ] Re-enter diff mode with the same compare file. The banner renders in
      the default (un-swapped) direction, not the last-used direction.

> manual / visual review — verifies the swap state does not persist across diff-mode exits, which depends on observing the banner across two interactive sessions.

### TC-3: Swap works with pasted compare source

- [ ] Click **⇄ Paste** in the file-tree header and paste a `.krs` blob.
- [ ] The banner shows `pasted → index.krs`.
- [ ] Click **⇄ Swap**. The banner now reads `index.krs → pasted` and the
      SVG re-renders with the pasted file as the after-side.

> manual / visual review — exercises the swap interaction with a pasted (not file-picker) compare source through the live PasteCompareDialog flow.

### TC-4: Swap works with a snapshot compare source (Issue #1402)

- [ ] Edit `index.krs`, then create a snapshot (the editor auto-captures, or
      use the snapshot picker) so a prior version exists.
- [ ] Enter diff mode against that snapshot — the banner shows
      `index.krs @ <timestamp> → index.krs`.
- [ ] Click **⇄ Swap**. The banner reads `index.krs → index.krs @ <timestamp>`
      and the diagram **re-renders** — no error banner appears.
- [ ] Click **⇄ Swap back**. Direction returns to the original orientation
      and the diagram re-renders again, still without an error.

> manual / visual review — snapshot sources resolve through a virtual overlay
> FS; this confirms the swapped diff compiles against the overlay (not the
> base FS, which cannot serve the virtual snapshot path).
