# AT-1122: Editor / Preview resize handle

Issue [#1122](https://github.com/kompiro/karasu/issues/1122) — Handle 1
(Sidebar ↔ Editor) was already shipped via #1115; this AT covers Handle 2
(Editor ↔ Preview).

## Scope

- A drag handle sits at the seam between `.edit-area` and `.preview-column`
  in `app-shell` (memory + project modes). It is not present in
  `serve-mode` (no editor) and is hidden when `previewFocused` is on.
- Persistence key: `karasu:editor:width` (pixel width of the editor side).

## Manual verification

1. **Drag changes the split.** Open the app in Memory or Project mode.
   Hover the seam between editor and preview — cursor becomes
   `col-resize` and the seam glows. Drag left/right and release; the
   editor and preview widths update during drag and stay where you
   released.
2. **Editor minimum (320px) is enforced.** Drag the handle far to the
   left. The editor stops shrinking at 320px even if you keep dragging.
3. **Preview minimum (320px) is enforced.** Drag the handle far to the
   right. The preview stops shrinking at 320px.
4. **Width persists across reload.** Drag to a non-default position,
   reload the page, and confirm the same split is restored.
5. **Double-click resets to 50/50.** Double-click the handle and confirm
   the layout returns to the default `1fr 1fr` and `karasu:editor:width`
   is removed from `localStorage`.
6. **Preview-focused hides the handle.** Toggle preview focus
   (`↗ Focus`); the handle disappears and preview fills the viewport.
   Toggle off; the handle returns and the previously-set width is
   restored.
7. **Sidebar coexists.** With the sidebar visible, drag both the sidebar
   handle (already shipped) and the editor/preview handle independently.
   Each persists to its own `localStorage` key
   (`karasu:sidebar:width` vs `karasu:editor:width`).
8. **Serve mode is unaffected.** `karasu serve` (preview-only mode) still
   renders a single full-width preview with no handle.
9. **Window resize re-clamps.** Set a wide editor width, then narrow the
   browser window so that `editor + 320 > window`. The editor width
   shrinks to `window − 320` so the preview keeps its 320px floor.

## Automated coverage

`packages/app/src/hooks/useEditorWidth.test.ts` covers:

- localStorage hydration / persistence
- min-width clamping on both sides
- double-click reset
- viewport-shrink re-clamp
