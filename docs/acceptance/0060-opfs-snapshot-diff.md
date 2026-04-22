# Acceptance Test: OPFS snapshot as diff comparison source (Issue #740)

## Summary

Verify that OPFS history snapshots (auto-captured on idle + user-labeled) can be
picked as the "before" side of the graphical diff viewer. Design doc:
`docs/design/opfs-snapshot-diff-source.md`.

Phase 1 (#650) shipped the viewer with file-to-file comparison. This test covers
the snapshot source extension: auto-capture, manual capture with label, picker
modal, and the diff banner reflecting snapshot metadata.

---

## Prerequisites

- App is running in OPFS / Project mode (`pnpm --filter @karasu-tools/app dev`)
- A project exists with an `index.krs` file

---

## Automated coverage

- `packages/app/src/fs/snapshot-manager.test.ts` — capture / list / read /
  delete, auto-retention GC (cap 20, manual never dropped), duplicate-skip,
  corrupt-index resilience
- `packages/app/src/fs/compare-source.test.ts` — `resolveCompareSource`
  pass-through for file sources, overlay semantics for snapshot sources,
  workspace fallback for relative imports
- `packages/app/src/hooks/useSnapshotAutoCapture.test.tsx` — debounced capture,
  timer reset on content change, no-op when manager is absent

---

## Manual verification checklist

### AT-1 — Auto snapshot fires after debounce

1. Open the project and edit `index.krs` (any non-whitespace change).
2. Wait 5 minutes without further edits.
3. Open DevTools → Application → Storage → OPFS and navigate to
   `/projects/<pid>/.snapshots/index.krs/`.

**Expected**: an `index.json` and at least one `<uuid>.krs` file exist. The
`trigger` in `index.json` is `"auto"`.

### AT-2 — Manual snapshot with label

1. Right-click `index.krs` in the FileTree.
2. Pick **⤓ Snapshot now**.
3. Enter a label (e.g. `before-refactor`) in the prompt.

**Expected**: a new entry appears in `.snapshots/index.krs/index.json` with
`trigger: "manual"` and the given label.

### AT-3 — Compare with snapshot via picker

1. Create at least one snapshot (AT-1 or AT-2).
2. Edit `index.krs` so its content differs from the snapshot.
3. Right-click `index.krs` → **⇄ Compare with snapshot…**.
4. Pick a snapshot from the modal.

**Expected**:
- Diff view opens showing added / removed / changed elements.
- The diff banner shows the snapshot's timestamp and label (if set), e.g.
  `index.krs @ 4/22/2026, 10:15:33 AM "before-refactor"`.
- **✕ Exit diff** restores normal mode.

### AT-4 — Auto retention drops oldest auto, keeps manual

1. Force 21+ auto snapshots (edit file, wait, repeat — or temporarily lower
   the debounce in source for testing).
2. Between them, take 1 manual snapshot with a distinct label.
3. Inspect `.snapshots/index.krs/index.json`.

**Expected**: at most 20 `auto` records (oldest dropped); the labeled manual
record is still present. The corresponding `<uuid>.krs` for dropped records is
also gone.

### AT-5 — `.snapshots/` hidden from FileTree

1. After any snapshot is created, look at the sidebar FileTree.

**Expected**: the `.snapshots/` directory is NOT visible in the tree. Other
`.`-prefixed entries (if any) are also hidden.

### AT-6 — Project delete removes snapshots

1. With a project that has snapshots, delete the project from the selector.
2. Re-inspect OPFS.

**Expected**: the entire `/projects/<pid>/` tree including `.snapshots/` is gone.
No orphan snapshot data remains.

---

## Notes

- The 5-minute debounce is hardcoded in `useSnapshotAutoCapture`; adjust
  locally while verifying AT-1 / AT-4 if a full wait is impractical.
- The picker lists snapshots newest-first with a trigger badge (`auto` /
  `manual`) and the optional label.
- This feature is gated by the existing `ENABLE_DIFF_VIEWER` feature flag —
  the same gate that surfaced the file-to-file picker.
