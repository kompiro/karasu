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
- `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` — app interaction
  flow: entering / exiting diff mode, swapping direction, paste source, and the
  diff surviving a mid-diff view-tab switch
- `packages/e2e/tests/at-0058-diff-colors.spec.ts` — the rendered diff
  **visuals**: added / removed / changed strokes against the
  `--diff-color-*` tokens, removed dash, unchanged dimming, badge rings,
  and the identical-files negative case, across the system / org / deploy views

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

- [x] Right-click `before.krs` in the file tree → choose **⇄ Compare with current**

> ✅ Automated — `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `file-picker compare renders the diff on the system view (AT-0058 TC-1)`

- [x] Diff banner appears at the top of the preview pane: `⇄ Diff: before.krs → index.krs`

> ✅ Automated — `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `file-picker compare renders the diff on the system view (AT-0058 TC-1)`

- [x] `Payments` service node is rendered with a **green** border

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `added node and edge are green, a label change is amber, unchanged is dimmed (TC-1/TC-3/TC-5)`

- [x] The `Orders → Payments` edge is rendered in **green**

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `added node and edge are green, a label change is amber, unchanged is dimmed (TC-1/TC-3/TC-5)`

> How the colour is asserted (applies to TC-1 / TC-2 / TC-3 / TC-4 / TC-5 / TC-8 / TC-8a / TC-9): the spec compares the computed `stroke` against the resolved `--diff-color-{added,removed,changed}` token, and separately classifies those tokens as green / red / amber and mutually distinct (`the palette itself is green / red / amber and mutually distinct`). A palette tune therefore does not break the fence, while a lost diff rule or an inverted palette does. What stays manual is the residual perceptual judgment — whether *this* green reads well, including for colour-vision-deficient readers.

### TC-2: Removed node still appears, in red

> ✅ Automated by `packages/e2e/tests/at-0058-diff-colors.spec.ts` (suite-wide)

- [x] Reverse the comparison — **⇄ Swap** in the diff banner (AT-0062) flips the
      direction in place; the file-swap procedure under TC-9 is the pre-#765 equivalent
- [x] `Payments` service node now appears with a **red dashed** border (it was
      removed in the after-side)
- [x] The `Orders → Payments` edge is **red dashed**

> Test: `removed node and edge are red and dashed after swapping direction (TC-2)` — asserts both the removed token stroke and a non-empty `stroke-dasharray`, so the "was here, now gone" signal survives for readers who cannot rely on hue.

### TC-3: Label change is rendered as `changed`

- [x] In the original orientation (before → index), `Catalog` is rendered with an **amber** border (label changed from default to "商品カタログ")

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `added node and edge are green, a label change is amber, unchanged is dimmed (TC-1/TC-3/TC-5)`

### TC-4: Annotation-only change renders as a badge diff

- [x] `Orders` body is **not** amber — the main rect carries `data-diff-state="unchanged"` so churn on `@deprecated` alone doesn't repaint the whole node

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `an annotation-only change rings the badge and leaves the body undecorated (TC-4)` asserts the body carries none of the three diff tokens; `packages/core/src/renderer/svg-renderer.test.ts` › `keeps annotation-only nodes at state=unchanged on the main group` fences the state itself.

- [x] The `⚠ 廃止予定` badge on `Orders` is decorated with a **green ring** (`<g data-node-badge data-diff-state="added">`)

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `an annotation-only change rings the badge and leaves the body undecorated (TC-4)` — the ring takes the added token and stays at full opacity even though its dimmed `unchanged` ancestor would otherwise fade it.

- [x] Clicking `Orders` opens the detail panel; the "⇄ Annotation diff" section lists `+ @deprecated`

> ✅ Automated — `packages/app/src/components/NodeDetailPanel.test.tsx` › `renders +/- rows when annotationDiff is provided`

- [x] Reversing the comparison renders a **ghost removed badge** (dashed red circle with `−`) and the panel shows `- @deprecated`

> 🟡 Partially automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `an annotation-only change rings the badge and leaves the body undecorated (TC-4)` covers the ghost badge (removed token + dashed ring) after **⇄ Swap**; `packages/app/src/components/NodeDetailPanel.test.tsx` › `renders +/- rows when annotationDiff is provided` covers the `- @deprecated` panel row. The `−` glyph inside the ghost circle is not asserted.

### TC-5: Unchanged elements are dimmed

- [x] `Catalog → Orders` edge and `Catalog` text are dimmed compared to a non-diff render (opacity ~0.55) so changes stand out

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `added node and edge are green, a label change is amber, unchanged is dimmed (TC-1/TC-3/TC-5)` — asserts the ~0.55 group opacity **and** that the unchanged node keeps its non-diff stroke, so "dimmed" cannot be satisfied by also colouring it.

### TC-6: Exit diff mode

> ✅ Automated by `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` (suite-wide)

- [x] Click **✕ Exit diff** in the diff banner
- [x] Banner disappears, diagram returns to its non-diff rendering
- [x] Non-diff styling (no `data-diff-state` attribute) is restored on all nodes

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

> ✅ Automated by `packages/e2e/tests/at-0058-diff-colors.spec.ts` (suite-wide)

- [x] `teamC` card is rendered with `data-diff-state="added"` (green accent)
- [x] `carol` member appears with the added style inside `teamC`
      (visible after drilling into `teamC` — the drill-down level is where
      member cards live)
- [x] On `teamA`, the `→ Catalog` owns button carries
      `data-diff-state="added"` (owns moved in)
- [x] On `teamB`, the `→ Catalog` owns button carries
      `data-diff-state="removed"` (owns moved out); `teamB` itself is marked
      `changed` — as is `teamA`, whose owns set also changed

> Test: `org view paints an added team green and a reshuffled team amber (TC-8a)`.
>
> Two corrections against the shipped renderer, found while automating this case:
>
> - **Owns buttons carry no colour.** `data-owned-service-button` groups contain only a `<text>` (`org-renderer.ts`), and the diff rules paint `rect` / `path` / `circle` / `polygon` / `line` — so the perceptible signal on a moved `owns` is **opacity** (added / removed stay at 1 while the untouched sibling dims to ~0.55), not a hue. The spec asserts the states plus that opacity contrast.
> - **The team drill-down has no owns buttons.** The former last item ("drilling into `teamA` preserves the `added` state on the `→ Catalog` owned-service button in the drill-down view") described a view that does not exist: drilling into a team renders **member cards** only. The `carol` bullet above now covers the drill-down level, which is what the renderer actually stamps (`org-renderer.test.ts` › `stamps data-diff-state on member cards in drill-down`).

### TC-8: Identical files

> ✅ Automated by `packages/e2e/tests/at-0058-diff-colors.spec.ts` (suite-wide)

- [x] Make a copy of `index.krs` as `same.krs` (identical content)
- [x] Compare `same.krs` against `index.krs` from the file tree
- [x] All nodes render with `data-diff-state="unchanged"` (uniformly dimmed)
- [x] No green/red/amber appears anywhere

> Test: `comparing identical files paints no diff colour anywhere (TC-8)` — asserts zero `added` / `removed` / `changed` elements **and** that no shape in the diagram carries any of the three diff tokens, which is the negative case the palette assertions need to be meaningful.

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

- [x] Enter diff mode by right-clicking `before.krs` → **⇄ Compare with current**

> ✅ Automated — `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `deploy-view diff decorates the added unit after switching tabs mid-diff (AT-0058 TC-9)`

- [x] Switch to the **Deploy** view tab

> ✅ Automated — `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `deploy-view diff decorates the added unit after switching tabs mid-diff (AT-0058 TC-9)`

- [x] `payments-svc` deploy unit appears with a **green** border

> ✅ Automated — the `data-diff-state="added"` state after the tab switch by `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `deploy-view diff decorates the added unit after switching tabs mid-diff (AT-0058 TC-9)`; the green border itself by `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `deploy view colours the added unit and its ghost edge, red dashed when swapped (TC-9)` (the unit **and** its `Payments` container both take the added token).

- [x] The new ghost edge from `Orders` container to `Payments` container is **green**

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `deploy view colours the added unit and its ghost edge, red dashed when swapped (TC-9)`

- [x] Diff banner remains visible while the deploy view is active

> ✅ Automated — `packages/e2e/tests/at-0058-graphical-diff-viewer.spec.ts` › `deploy-view diff decorates the added unit after switching tabs mid-diff (AT-0058 TC-9)`

**Removed unit:** press **⇄ Swap** in the diff banner (or, equivalently, swap which file holds `payments-svc` — put it in `before.krs` only, with `index.krs` *not* containing it, then run the same Compare action).

- [x] `payments-svc` deploy unit is rendered with a **red dashed** border

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `deploy view colours the added unit and its ghost edge, red dashed when swapped (TC-9)` — asserted for the removed token *and* a non-empty `stroke-dasharray`.

- [x] The `Orders → Payments` ghost edge is rendered in **red dashed**

> ✅ Automated — `packages/e2e/tests/at-0058-diff-colors.spec.ts` › `deploy view colours the added unit and its ghost edge, red dashed when swapped (TC-9)`

> The file-swap procedure is the pre-#765 form. #765 shipped the in-place **⇄ Swap** control (AT-0062), so the direction can be flipped without touching files, and the specs drive it that way.

---

## Known limitations (tracked separately)

- ~~Diff direction is fixed to "selected file = before, project entry = after"~~ — resolved by #765 (the **⇄ Swap** control, AT-0062)
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
