# Acceptance Test: Graphical diff viewer (Issue #650)

## Summary

Verify the MVP graphical diff viewer renders semantic differences between two
`.krs` files directly on the system diagram. Issue #650 design doc:
`docs/design/graphical-diff-viewer.md`.

This MVP covers the **system view only** with the **file-picker source**
(workspace file → workspace file). Deploy / org views, paste input, OPFS
snapshot input, aggregated edge constituent diff, and annotation badge diff
are tracked as follow-ups.

---

## Prerequisites

- App is running (`pnpm --filter @karasu-tools/app dev`)
- A project containing at least two `.krs` files

---

## Automated coverage

- `packages/core/src/diff/view-diff.test.ts` — semantic diff: added / removed /
  unchanged / changed nodes and edges, label diff, annotation diff
- `packages/core/src/renderer/svg-renderer.test.ts` — `data-diff-state` is
  emitted on nodes and edges; absent when no diff is provided

---

## Manual verification checklist

### Set up two files

Create two `.krs` files in the same workspace, e.g. `before.krs` and `index.krs`.

`before.krs`:

```krs
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
```

`index.krs`:

```krs
system Shop {
  service Catalog { label "商品カタログ" }
  service Orders @deprecated
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
```

Open `index.krs` so it is the current file.

### TC-1: Added node and edge are highlighted in green

- [ ] Right-click `before.krs` in the file tree → choose **⇄ Compare with current**
- [ ] Diff banner appears at the top of the preview pane: `⇄ Diff: before.krs → index.krs`
- [ ] `Payments` service node is rendered with a **green** border
- [ ] The `Orders → Payments` edge is rendered in **green**

### TC-2: Removed node still appears, in red

- [ ] Reverse the comparison: open `before.krs`, then right-click `index.krs`
      → **Compare with current**
- [ ] `Payments` service node now appears with a **red dashed** border (it was
      removed in the after-side)
- [ ] The `Orders → Payments` edge is **red dashed**

### TC-3: Label change is rendered as `changed`

- [ ] In the original orientation (before → index), `Catalog` is rendered with
      an **amber** border (label changed from default to "商品カタログ")

### TC-4: Annotation-only change

- [ ] `Orders` is rendered with an **amber** border because it has gained
      `@deprecated` (annotation diff)

> Note: full badge-only diff (Phase D in the design doc) is not in this MVP.
> The whole node is currently highlighted; a finer-grained badge diff is a
> follow-up.

### TC-5: Unchanged elements are dimmed

- [ ] `Catalog → Orders` edge and `Catalog` text are dimmed compared to
      a non-diff render (opacity ~0.55) so changes stand out

### TC-6: Exit diff mode

- [ ] Click **✕ Exit diff** in the diff banner
- [ ] Banner disappears, diagram returns to its non-diff rendering
- [ ] Non-diff styling (no `data-diff-state` attribute) is restored on all nodes

### TC-7: Existing interactions still work in diff mode

- [ ] In diff mode, clicking a node still opens the existing detail panel
- [ ] Drilling down into a service still works

### TC-8: Identical files

- [ ] Make a copy of `index.krs` as `same.krs` (identical content)
- [ ] Compare `same.krs` against `index.krs` from the file tree
- [ ] All nodes render with `data-diff-state="unchanged"` (uniformly dimmed)
- [ ] No green/red/amber appears anywhere

---

## Out of scope (tracked separately)

- Deploy view diff
- Org view diff
- Aggregated implicit edge constituent-set diff in `EdgeDetailPanel`
- Annotation-only changes rendered as a badge diff (D-2 in the design doc)
- Paste-blob input source
- OPFS snapshot input source
