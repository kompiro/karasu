---
type: product
---

# AT-1150: Editor buffer refresh on external file writes

- **日付**: 2026-05-07
- **関連 Issue**: [#1150](https://github.com/kompiro/karasu/issues/1150)（親 [#1076](https://github.com/kompiro/karasu/issues/1076) / [#1098](https://github.com/kompiro/karasu/issues/1098) / [#1144](https://github.com/kompiro/karasu/issues/1144)）
- **対象ファイル**:
  - `packages/app/src/hooks/useEditorExternalRefresh.ts`、`packages/app/src/hooks/useEditorExternalRefresh.test.ts`
  - `packages/app/src/components/AppShell.tsx`
- **関連 Design Doc**: [`docs/design/editor-external-refresh.md`](../design/editor-external-refresh.md)
- **関連 ADR**: [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md)（cascade-tail-wins）、[ADR-20260506-06](../adr/20260506-06-krs-style-open-affordance.md)（`.krs.style` 直接編集の append target）
- **依存実装**: [#1151](https://github.com/kompiro/karasu/pull/1151)（`ObservableFileSystemProvider`）

## 受け入れ条件

- [x] AT-A: 開いている `.krs.style` への外部書き込み（GUI direction append など）が、Monaco buffer に即座に反映される（`UPDATE_FILE_CONTENT` を dispatch）
  > ✅ Automated — `packages/app/src/hooks/useEditorExternalRefresh.test.ts` › `useEditorExternalRefresh › dispatches UPDATE_FILE_CONTENT when an external write changes the open file`

- [x] AT-B: refresh 後に `onRefresh` callback（= `recompile`）が呼ばれ、Preview が新しい disk 内容に追従する
  > ✅ Automated — `useEditorExternalRefresh.test.ts › calls onRefresh after dispatch (recompile hook)`

- [x] AT-C: エディタ自身の onChange による `fs.writeFile` echo は `state.fileContent === disk` の差分検出で skip され、`UPDATE_FILE_CONTENT` が再 dispatch されない
  > ✅ Automated — `useEditorExternalRefresh.test.ts › suppresses echo writes when disk content matches state.fileContent`

- [x] AT-D: 開いていない別ファイルへの書き込みは editor を refresh しない
  > ✅ Automated — `useEditorExternalRefresh.test.ts › ignores writes to other files`

- [x] AT-E: `currentFilePath` 切替時に古い subscription が dispose され、旧ファイルへの書き込みは新 subscription を発火させない
  > ✅ Automated — `useEditorExternalRefresh.test.ts › disposes the previous subscription when currentFilePath changes`

- [x] AT-F: `currentFilePath` が `null` のとき hook は no-op で例外を出さない
  > ✅ Automated — `useEditorExternalRefresh.test.ts › does nothing when currentFilePath is null`

- [x] AT-G: 開いているファイルが delete されたとき hook は dispatch せず、stale read を行わない（delete event は無視）
  > ✅ Automated — `useEditorExternalRefresh.test.ts › does not throw on a delete event for the open file`

- [ ] AT-H（manual）: Preview で `.krs.style` を開いた状態で edge を右クリック → Direction ▸ Right を選び、エディタ右ペインの buffer 表示が GUI append された rule を含む状態に **即座に更新** されることを目視
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview 起動。GUI flow を実行し、Monaco の表示行が disk と一致することを確認

## 補足

- **echo loop 回避の根拠**: エディタの auto-save (`handleEditorChange`) が `dispatch(UPDATE_FILE_CONTENT)` → `fs.writeFile` の順で実行されるため、watch event が届く時点で `state.fileContent` は既に最新 = disk と一致 → 差分検出で skip される。詳細は Design Doc 「Conflict guard の取り扱い」節
- **dirty buffer guard punt**: 現行モデルは auto-save のため buffer = disk が常に保たれ、独立した dirty buffer 概念が無い。GUI append と editor 入力のレースは ADR-20260506-01 の cascade-tail-wins で意味付けられているため、最後に disk に書かれた内容を buffer に反映する素直な挙動で十分。将来 dirty buffer を導入する場合は再評価する
- **delete event の扱い**: 開いているファイルが消された場合の UX（"file disappeared" メッセージなど）は現状未整備。本 hook は delete event を無視するに留め、改善が必要なら別 issue 化
