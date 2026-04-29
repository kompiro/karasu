---
type: acceptance-test
---

# Acceptance Test: Open file is the preview entry (Issue #811)

## Summary

Verify that the currently open `.krs` file becomes the preview root in
Project mode, falling back to the project's `index.krs` when no `.krs`
has been opened yet. Editing a non-`.krs` file (e.g. `.krs.style`,
`README.md`) keeps the prior `.krs` as the preview root so the diagram
stays visible.

This is the part B follow-up to #765 (part A — the swap button — shipped
in #800).

## Prerequisites

- A project with at least:
  - `index.krs` (uses one or more imports)
  - `before.krs` (a separate root not `@imported` from `index.krs`)
  - `styles.krs.style` (a stylesheet)

## Automated coverage

- `packages/app/src/state/app-reducer.test.ts` —
  - `lastKrsFilePath` updates only when a `.krs` file is selected
  - `lastKrsFilePath` is preserved when a `.krs.style` or non-`.krs`
    file is selected
  - `lastKrsFilePath` clears when SELECT_FILE is dispatched with an
    empty path (deselection / deletion of the current file)
  - `lastKrsFilePath` resets on project switch

## Manual verification checklist

### TC-1: Project initial load shows `index.krs`

Set up `index.krs`:

```krs
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
```

- [ ] Open the project. The preview shows the `Shop` system rooted at `index.krs`.
- [ ] No file is highlighted in the editor tab; or `index.krs` is selected
      automatically per the existing initialization behavior.

> manual / visual review — initial-load preview / editor coupling depends on the live OPFS-backed project and is not covered by app-level unit tests.

### TC-2: Opening another `.krs` switches the preview root

Set up `before.krs` (a different root, **not** imported from `index.krs`):

```krs
system Shop {
  service Catalog
}
```

- [ ] Click `before.krs` in the file tree.
- [ ] The preview re-renders with `before.krs` as the root: only `Catalog`
      is visible (no `Orders`, no edge).
- [ ] Re-click `index.krs`. The preview returns to the full `Shop` system.

> manual / visual review — clicking through the file tree and inspecting which root is rendered requires a live preview re-render.

### TC-3: Editing `.krs.style` keeps the prior `.krs` preview

- [ ] Open `before.krs` so the preview shows it.
- [ ] Open `styles.krs.style` from the file tree.
- [ ] The preview still shows `before.krs` (not blank, not `index.krs`).
- [ ] Edit a color in `styles.krs.style`. The preview updates with the new
      style applied to `before.krs`'s diagram.

> manual / visual review — confirms the `.krs` ↔ `.krs.style` decoupling by visually watching the preview while switching the active file.

### TC-4: Diff after-side follows the open `.krs`

- [ ] With `before.krs` open, right-click `index.krs` in the file tree
      → "Compare with current".
- [ ] Diff banner reads `index.krs → before.krs` — i.e. `before.krs` is
      the after-side. The added/removed coloring reflects this direction.
- [ ] Click `⇄ Swap`. Direction flips to `before.krs → index.krs`.
- [ ] Click another `.krs` file in the tree (still in diff mode). The
      after-side updates to that file; swap state resets to default.

> manual / visual review — combines diff-mode entry, swap, and tree-click; verifying the banner direction matches the diff colors needs human inspection.

### TC-5: Project switch resets the preview root

- [ ] After opening `before.krs` in project A, switch to project B.
- [ ] The preview in project B shows project B's `index.krs`, not a stale
      reference to `before.krs`.

> manual / visual review — verifies cross-project state isolation through the live ProjectSelector and OPFS-backed project list.

### TC-6: Deleting the open `.krs` file falls back

- [ ] With `before.krs` open as the preview root, delete `before.krs` from
      the file tree.
- [ ] The preview falls back to `index.krs`.

> manual / visual review — destructive file-tree operation with live OPFS — needs a real session to confirm the fallback render.

### TC-7: Browser back/forward restores the open file

- [ ] Open `index.krs` (preview shows the full project).
- [ ] Click `before.krs` in the file tree (preview swaps to `before.krs`).
- [ ] The URL hash now contains `?file=` followed by the encoded path of
      `before.krs`.
- [ ] Press the browser **Back** button. The editor and preview both revert
      to `index.krs`.
- [ ] Press **Forward**. They go back to `before.krs`.

> manual / visual review — exercises the live browser history stack, which can only be driven from a real browser session.

### TC-8: Deep-link with `?file=` parameter

- [ ] Copy the URL while `before.krs` is open.
- [ ] Paste it in a new tab. After load, the editor opens `before.krs` and
      the preview is rooted at it (not at `index.krs`).

> manual / visual review — fresh-tab load behavior with a deep-link query is a real-browser flow.

### TC-9: Project switch preserves the forward history stack

- [ ] Open project A.
- [ ] Switch to project B via the project selector.
- [ ] Press the browser **Back** button — the app returns to project A.
- [ ] Press **Forward** — the app returns to project B.
      (Regression guard: a stray `pushState` during the project-switch
      transient would wipe the forward stack here.)

> manual / visual review — regression guard against a transient `pushState`; only observable through a real browser's forward stack.
