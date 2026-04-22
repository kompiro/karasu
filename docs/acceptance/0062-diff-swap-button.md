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

- App is running with the diff viewer flag enabled: open the app with
  `?diff=1` in the URL (see `packages/app/src/utils/feature-flags.ts`)
- A project with an `index.krs` file and at least one other `.krs` file

## Automated coverage

- `packages/app/src/components/DiffModeBanner.test.tsx` — Swap button
  renders, fires `onSwap`, reflects `aria-pressed`, flips label order when
  `swapped`.
- `packages/app/src/state/app-reducer.test.ts` — `TOGGLE_DIFF_SWAPPED`
  toggles when a compare path is set, is a no-op otherwise, and resets on
  `SET_COMPARE_ENTRY_PATH` or `SET_CURRENT_PROJECT`.

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

### TC-2: Exiting diff mode resets the swap

- [ ] While swapped, click **✕ Exit diff**. Diff mode ends.
- [ ] Re-enter diff mode with the same compare file. The banner renders in
      the default (un-swapped) direction, not the last-used direction.

### TC-3: Swap works with pasted compare source

- [ ] Click **⇄ Paste** in the file-tree header and paste a `.krs` blob.
- [ ] The banner shows `pasted → index.krs`.
- [ ] Click **⇄ Swap**. The banner now reads `index.krs → pasted` and the
      SVG re-renders with the pasted file as the after-side.
