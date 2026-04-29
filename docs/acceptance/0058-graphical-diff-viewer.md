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
- `packages/core/src/diff/org-view-diff.test.ts` — org-view diff: added /
  removed / changed teams and members, owns edge reshuffle, drill-down
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

> manual / visual review — green vs default border tone is a colour-perception check on the live SVG render.

### TC-2: Removed node still appears, in red

- [ ] Reverse the comparison: open `before.krs`, then right-click `index.krs`
      → **Compare with current**
- [ ] `Payments` service node now appears with a **red dashed** border (it was
      removed in the after-side)
- [ ] The `Orders → Payments` edge is **red dashed**

> manual / visual review — red-dashed-border styling on a removed node is a visual outcome that depends on the live diff render.

### TC-3: Label change is rendered as `changed`

- [ ] In the original orientation (before → index), `Catalog` is rendered with
      an **amber** border (label changed from default to "商品カタログ")

> manual / visual review — amber-border tone on a label change is judged by eye on the rendered SVG.

### TC-4: Annotation-only change renders as a badge diff

- [ ] `Orders` body is **not** amber — the main rect carries
      `data-diff-state="unchanged"` so churn on `@deprecated` alone doesn't
      repaint the whole node
- [ ] The `⚠ 廃止予定` badge on `Orders` is decorated with a **green ring**
      (`<g data-node-badge data-diff-state="added">`)
- [ ] Clicking `Orders` opens the detail panel; the "⇄ Annotation diff"
      section lists `+ @deprecated`
- [ ] Reversing the comparison renders a **ghost removed badge** (dashed red
      circle with `−`) and the panel shows `- @deprecated`

> manual / visual review — annotation-badge-only diff (vs whole-node diff) plus the "Annotation diff" detail-panel section needs interactive UI inspection.

### TC-5: Unchanged elements are dimmed

- [ ] `Catalog → Orders` edge and `Catalog` text are dimmed compared to
      a non-diff render (opacity ~0.55) so changes stand out

> manual / visual review — opacity-based dimming of unchanged elements is a perceptual contrast check.

### TC-6: Exit diff mode

- [ ] Click **✕ Exit diff** in the diff banner
- [ ] Banner disappears, diagram returns to its non-diff rendering
- [ ] Non-diff styling (no `data-diff-state` attribute) is restored on all nodes

> manual / visual review — diff-mode exit cleans up state across the banner and SVG; visual confirmation of restoration.

### TC-7: Existing interactions still work in diff mode

- [ ] In diff mode, clicking a node still opens the existing detail panel
- [ ] Drilling down into a service still works

> manual / visual review — verifies non-diff interactions (detail panel, drill-down) continue to work while diff styling is active.

### TC-8a: Org view — added / removed teams and owns reshuffle

Switch to the org view (if the project has an `organization` block) and repeat
the diff.

Suggested `before.krs`:

```krs
system Shop {
  service Orders
  service Catalog
}
organization Acme {
  team teamA {
    owns Orders
    member alice {}
  }
  team teamB {
    owns Catalog
    member bob {}
  }
}
```

`index.krs`:

```krs
system Shop {
  service Orders
  service Catalog
  service Payments
}
organization Acme {
  team teamA {
    owns Orders
    owns Catalog
    member alice {}
  }
  team teamB {
    member bob {}
  }
  team teamC {
    owns Payments
    member carol {}
  }
}
```

- [ ] `teamC` card is rendered with `data-diff-state="added"` (green accent)
- [ ] `carol` member appears with the added style inside `teamC`
- [ ] On `teamA`, the `→ Catalog` owns button carries
      `data-diff-state="added"` (owns moved in)
- [ ] On `teamB`, the `→ Catalog` owns button carries
      `data-diff-state="removed"` (owns moved out); `teamB` itself is marked
      `changed`
- [ ] Drilling into `teamA` preserves the `added` state on the `→ Catalog`
      owned-service button in the drill-down view

> manual / visual review — org-view diff styling spans team cards, owns buttons, and drill-down levels; visual coverage on real fixtures is needed.

### TC-8: Identical files

- [ ] Make a copy of `index.krs` as `same.krs` (identical content)
- [ ] Compare `same.krs` against `index.krs` from the file tree
- [ ] All nodes render with `data-diff-state="unchanged"` (uniformly dimmed)
- [ ] No green/red/amber appears anywhere

> manual / visual review — negative case for diff colours; needs visual confirmation that nothing turns coloured for an identical-source comparison.

### TC-9: Deploy view diff (Issue #735)

Add deploy blocks to both files, e.g. add to `before.krs`:

```krs
deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
}
```

And to `index.krs`:

```krs
deploy Production {
  oci "catalog-svc" { realizes Catalog }
  oci "orders-svc" { realizes Orders }
  oci "payments-svc" { realizes Payments }
}
```

**Forward direction (added unit):** `index.krs` is the project entry, so it is always the "after" side. Make sure `index.krs` is the file *with* `payments-svc` and `before.krs` is the file *without*.

- [ ] Enter diff mode by right-clicking `before.krs` → **⇄ Compare with current**
- [ ] Switch to the **Deploy** view tab
- [ ] `payments-svc` deploy unit appears with a **green** border
- [ ] The new ghost edge from `Orders` container to `Payments` container is **green**
- [ ] Diff banner remains visible while the deploy view is active

**Removed unit:** swap which file holds `payments-svc` — put it in `before.krs` only, with `index.krs` *not* containing it. Then run the same Compare action.

- [ ] `payments-svc` deploy unit is rendered with a **red dashed** border
- [ ] The `Orders → Payments` ghost edge is rendered in **red dashed**

> manual / visual review — deploy-view diff colours and ghost-edge styling need to be inspected after switching tabs in a live diff session.

> Why the file swap instead of a "reverse" toggle: the project entry (`index.krs`) is hard-coded as the after-side in the current implementation. Picking which side is the base / swapping in-place is tracked in #765.

---

## Known limitations (tracked separately)

- Diff direction is fixed to "selected file = before, project entry = after" (#765)
- A `.krs` file with only a `deploy` block (no `system`) does not render a deploy diagram (#766)
- When no `deploy` block exists, the deploy tab is disabled rather than showing a "no content" message (#767)

## Out of scope (tracked separately)

- ~~Deploy view diff~~ — landed in #735
- ~~Org view diff~~ — landed in #736
- ~~Annotation-only changes rendered as a badge diff (D-2)~~ — landed in #749
- Aggregated implicit edge constituent-set diff in `EdgeDetailPanel` (#737)
- Paste-blob input source (#739)
- OPFS snapshot input source (#740)
- Container rectangle (service group) diff decoration (#750)
