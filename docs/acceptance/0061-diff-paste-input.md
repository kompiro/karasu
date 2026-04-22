# Acceptance Test: Diff paste input (Issue #739)

## Summary

Verify that users can compare the current `.krs` file against a pasted blob,
without saving the blob as a workspace file first. Follow-up to the graphical
diff viewer (Issue #650, AT 0058).

## Prerequisites

- App is running with the diff viewer flag enabled: open the app with
  `?diff=1` in the URL (see `packages/app/src/utils/feature-flags.ts`)
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

### TC-3: View pasted content

- [ ] In the diff banner, click **👁 View pasted**
- [ ] A read-only dialog opens showing the `.krs` text that was pasted
- [ ] Click **Close** to dismiss

### TC-4: Pasted temp file is hidden from the file tree

- [ ] While diff mode is active, the file tree shows `index.krs` but **does
      not** show `.karasu-paste-compare.krs`

### TC-5: Exit diff mode cleans up the temp file

- [ ] Click **✕ Exit diff** in the banner
- [ ] The banner disappears and the diagram returns to its non-diff rendering
- [ ] Reopen the project (or reload the page) — no `.karasu-paste-compare.krs`
      file exists in the project (it was deleted on exit)

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

### TC-7: Switching to picker-based diff replaces the pasted source

- [ ] Right-click another workspace `.krs` file → **⇄ Compare with current**
- [ ] The banner no longer shows `pasted`; it shows the picked file name
- [ ] The `.karasu-paste-compare.krs` temp file is deleted

## Out of scope

- OPFS snapshot input (#740)
- Persistence of the pasted blob across sessions — the blob is discarded on
  exit by design
- Deploy / org view diff of pasted content (the underlying diff engine already
  supports these views; exercise via TC-2 if your pasted blob includes
  `deploy` or `organization` blocks)
