# Acceptance Test: OPFS snapshot as diff comparison source (Issue #740)

## Summary

Verify that OPFS history snapshots (auto-captured on idle + user-labeled) can be
picked as the "before" side of the graphical diff viewer.

Phase 1 (#650) shipped the viewer with file-to-file comparison. This test covers
the snapshot source extension: auto-capture, manual capture with label, picker
modal, and the diff banner reflecting snapshot metadata.

---

## Prerequisites

- The app is open in OPFS / Project mode
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
- `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` — every case below in
  the app against real OPFS; the 5-minute idle timer is fast-forwarded with
  Playwright's `page.clock` ([#3047](https://github.com/kompiro/karasu/issues/3047))

---

## Test cases

### AT-1 — Auto snapshot fires after debounce

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `an edit followed by 5 idle minutes is captured as an auto snapshot (AT-1)`

1. Open the project and edit `index.krs` (any non-whitespace change).
2. Wait 5 minutes without further edits.
3. Open DevTools → Application → Storage → OPFS and navigate to
   `/projects/<pid>/.snapshots/index.krs/`.

**Expected**: an `index.json` and at least one `<uuid>.krs` file exist. The
`trigger` in `index.json` is `"auto"`.

### AT-2 — Manual snapshot with label

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `Snapshot now writes a labeled manual record and keeps .snapshots out of the tree (AT-2, AT-5)`

1. Right-click `index.krs` in the FileTree.
2. Pick **⤓ Snapshot now**.
3. Enter a label (e.g. `before-refactor`) in the prompt.

**Expected**: a new entry appears in `.snapshots/index.krs/index.json` with
`trigger: "manual"` and the given label.

### AT-3 — Compare with snapshot via picker

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `Compare with snapshot lists records newest-first and diffs against the picked one (AT-3)`

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

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `the 21st auto snapshot drops the oldest auto and keeps manual ones (AT-4)`

1. Force 21+ auto snapshots (edit file, wait, repeat — or temporarily lower
   the debounce in source for testing).
2. Between them, take 1 manual snapshot with a distinct label.
3. Inspect `.snapshots/index.krs/index.json`.

**Expected**: at most 20 `auto` records (oldest dropped); the labeled manual
record is still present. The corresponding `<uuid>.krs` for dropped records is
also gone.

### AT-5 — `.snapshots/` hidden from FileTree

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `Snapshot now writes a labeled manual record and keeps .snapshots out of the tree (AT-2, AT-5)`

1. After any snapshot is created, look at the sidebar FileTree.

**Expected**: the `.snapshots/` directory is NOT visible in the tree. Other
`.`-prefixed entries (if any) are also hidden.

### AT-6 — Project delete removes snapshots

> ✅ Automated — `packages/e2e/tests/at-0060-opfs-snapshot-diff.spec.ts` › `deleting the project removes its .snapshots tree (AT-6)`

1. With a project that has snapshots, delete the project from the selector.
2. Re-inspect OPFS.

**Expected**: the entire `/projects/<pid>/` tree including `.snapshots/` is gone.
No orphan snapshot data remains.

---

## Manual verification

N/A — all covered by automated tests.

---

## Notes

- The 5-minute debounce is hardcoded in `useSnapshotAutoCapture`. The e2e spec
  does not wait for it: it installs `page.clock` before the app loads and
  fast-forwards the idle period.
- The picker lists snapshots newest-first with a trigger badge (`auto` /
  `manual`) and the optional label.
- The diff viewer (and this snapshot picker entry point) is now enabled by
  default — the `ENABLE_DIFF_VIEWER` feature flag was removed in #839.
