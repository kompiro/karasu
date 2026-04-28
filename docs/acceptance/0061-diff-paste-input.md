# Acceptance Test: Diff paste input (Issue #739)

## Summary

Verify that users can compare the current `.krs` file against a pasted blob,
without saving the blob as a workspace file first. Follow-up to the graphical
diff viewer (Issue #650, AT 0058).

## Prerequisites

- App is running (the diff viewer is enabled by default — graduated in #839)
- A project with an `index.krs` file open

## Automated coverage

- `packages/app/src/components/PasteCompareDialog.test.tsx` — dialog
  interactions (disabled Compare button, Escape/overlay cancel, read-only mode)
- `packages/app/src/utils/file-tree-fs.test.ts` — `.karasu-*` temp files are
  filtered from the file tree

## Manual verification checklist

### TC-1: Paste dialog opens from the file-tree header

Set up `index.krs`:

```krs
system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
```

- [ ] In the file-tree header, a **⇄ Paste** button is visible
- [ ] Clicking it opens a modal titled **⇄ Compare with pasted .krs**
- [ ] The **Compare** button is disabled while the textarea is empty

> manual / visual review — file-tree header button visibility and dialog open behaviour are checked in the live app.

### TC-2: Pasting a blob triggers diff mode

Paste the following into the dialog textarea:

```krs
system Shop {
  service Catalog
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
```

- [ ] Click **⇄ Compare** — the dialog closes
- [ ] The diff banner appears: `⇄ Diff: pasted → index.krs` (the before-side
      shows the italic **pasted** label, not a file name)
- [ ] `Payments` service and the `Orders → Payments` edge are rendered in
      **red dashed** (removed from the current file compared to the pasted
      blob)

> manual / visual review — confirms the paste-driven diff round-trip end-to-end (dialog → banner label → SVG colours).

### TC-3: View pasted content

- [ ] In the diff banner, click **👁 View pasted**
- [ ] A read-only dialog opens showing the `.krs` text that was pasted
- [ ] Click **Close** to dismiss

> manual / visual review — read-only dialog content is verified in the live UI; modal accessibility (Escape, backdrop click) is implicitly exercised.

### TC-4: Pasted temp file is hidden from the file tree

- [ ] While diff mode is active, the file tree shows `index.krs` but **does
      not** show `.karasu-paste-compare.krs`

> manual / visual review — file-tree filter for `.karasu-*` temp files is checked by inspecting the live tree component.

### TC-5: Exit diff mode cleans up the temp file

- [ ] Click **✕ Exit diff** in the banner
- [ ] The banner disappears and the diagram returns to its non-diff rendering
- [ ] Reopen the project (or reload the page) — no `.karasu-paste-compare.krs`
      file exists in the project (it was deleted on exit)

> manual / visual review — verifies temp-file cleanup persists across an OPFS reload, which only manifests in a real browser session.

### TC-6: Invalid pasted content surfaces diagnostics

Open the paste dialog and paste a deliberately broken `.krs` snippet:

```krs
system Shop {
  service
}
```

- [ ] Clicking **⇄ Compare** enters diff mode
- [ ] A parse-error diagnostic is displayed for the pasted side (the diff SVG
      may be empty until the error is fixed)

> manual / visual review — diagnostic banner placement and the empty-SVG behaviour for an invalid paste need a live render to confirm.

### TC-7: Switching to picker-based diff replaces the pasted source

- [ ] Right-click another workspace `.krs` file → **⇄ Compare with current**
- [ ] The banner no longer shows `pasted`; it shows the picked file name
- [ ] The `.karasu-paste-compare.krs` temp file is deleted

> manual / visual review — confirms transition from pasted source to file-picker source cleans up the temp file and updates the banner label.

## Out of scope

- OPFS snapshot input (#740)
- Persistence of the pasted blob across sessions — the blob is discarded on
  exit by design
- Deploy / org view diff of pasted content (the underlying diff engine already
  supports these views; exercise via TC-2 if your pasted blob includes
  `deploy` or `organization` blocks)
