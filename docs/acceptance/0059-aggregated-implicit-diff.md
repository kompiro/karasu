# Acceptance Test: Aggregated implicit edge constituent-set diff (Issue #737)

## Summary

Verify that when two `.krs` files differ only in the underlying domain edges
that make up an aggregated implicit service edge, the diff viewer:

1. Marks the aggregated edge as `changed` (not `unchanged`)
2. Opens the `EdgeDetailPanel` with constituent rows showing `+` / `-` / ` `
   markers and color coding for added / removed / unchanged underlying edges

Follow-up to Issue #650 (axis C-2 in
`docs/design/graphical-diff-viewer.md`).

---

## Prerequisites

- App is running (`pnpm --filter @karasu-tools/app dev`)
- A project with two `.krs` files selectable from the diff viewer

---

## Automated coverage

- `packages/core/src/diff/view-diff.test.ts`
  — the `aggregated implicit edge constituent-set diff` suite covers:
  - identical constituent sets → aggregated edge `unchanged`
  - added constituent → aggregated edge `changed`, `changes.domainEdges.added` populated
  - removed constituent → `changes.domainEdges.removed` populated
  - union `implicitEdgeDetails` map has per-row `diffState`
- `packages/app/src/components/EdgeDetailPanel.test.tsx`
  — panel renders `+` / `-` / ` ` markers and `edge-detail-item--{state}` classes when `diffState` is set

---

## Manual verification checklist

### Set up the files

`before.krs`:

```krs
system Shop {
  service Catalog {
    domain CatalogA { CatalogA -> OrdersA "reads" }
    domain CatalogB { CatalogB -> OrdersA "reads" }
  }
  service Orders {
    domain OrdersA
  }
}
```

`after.krs` (adds a third constituent edge from a new domain):

```krs
system Shop {
  service Catalog {
    domain CatalogA { CatalogA -> OrdersA "reads" }
    domain CatalogB { CatalogB -> OrdersA "reads" }
    domain CatalogC { CatalogC -> OrdersA "reads" }
  }
  service Orders {
    domain OrdersA
  }
}
```

### Steps

1. Open the diff viewer and choose `before.krs` as before and `after.krs` as after.
2. Confirm that the aggregated `Catalog -> Orders` edge label shows `3 domain edges` (after-side count).
3. Confirm the edge is rendered in the `changed` visual state (not unchanged).
4. Click the edge label to open the `EdgeDetailPanel`.
5. Confirm the panel lists three rows:
   - `CatalogA → OrdersA` with a neutral marker and no background tint
   - `CatalogB → OrdersA` with a neutral marker and no background tint
   - `CatalogC → OrdersA` prefixed with `+` on a green-tinted background
6. Swap the file order (after → before) and confirm the `CatalogC` row now shows `-` on a red-tinted background with strike-through.

### Regression check (non-diff mode)

1. Open the same `after.krs` file in the regular preview (not diff mode).
2. Click the `3 domain edges` label.
3. Confirm the panel lists the three domain edges **without** any markers, tinted backgrounds, or diff classes — i.e. non-diff rendering is unchanged.
