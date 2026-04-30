# AT: IME composition stays stable across preview re-renders

- **日付**: 2026-04-30
- **関連 Issue**: [#1053](https://github.com/kompiro/karasu/issues/1053)
- **対象ファイル**:
  - `packages/app/src/components/EditorPane.tsx`
  - `packages/app/src/components/EditorPane.test.tsx`

## 受け入れ条件

- [x] `EditorPane` は `compositionstart` から `compositionend` の間、Monaco が発火する中間 `onChange` を親に伝播しない
  > ✅ Automated — `packages/app/src/components/EditorPane.test.tsx` › `buffers changes during composition and flushes once on compositionEnd`

- [x] `compositionend` 時点で、composition 中の最新値を 1 度だけ親 `onChange` に伝播する
  > ✅ Automated — `packages/app/src/components/EditorPane.test.tsx` › `buffers changes during composition and flushes once on compositionEnd`

- [x] composition が中間変更なしで終わった場合は親 `onChange` を呼ばない
  > ✅ Automated — `packages/app/src/components/EditorPane.test.tsx` › `does not flush a stale value if composition ends without intermediate changes`

- [x] composition 後の通常の入力は従来どおり都度 `onChange` を伝播する（regression なし）
  > ✅ Automated — `packages/app/src/components/EditorPane.test.tsx` › `resumes propagating after composition ends` / `propagates changes when not composing`

- [ ] AT-Manual (macOS + Google 日本語入力 + Arc/Chrome, Project mode):
      `.krs` のコメントや `description: "..."` 内で日本語を連続入力し、変換候補確定 → 続けて次の文字をタイプしても、文字落ち・重複・カーソルジャンプが発生しない
  > 🧑 Manual — Preview URL で実機確認する

- [ ] AT-Manual: 非 IME（半角英数）入力時のタイピングレイテンシが体感で劣化していない
  > 🧑 Manual — Preview URL で確認する

## 補足

- 根本原因: `EditorPane` が Monaco の `onChange`（IME 変換中も発火）を毎回親へ伝播し、親 state 更新→`value` プロップ往復によって `@monaco-editor/react` が in-flight な composition を破壊する（特に Blink + Google JP IME で顕著）
- 修正: `editor.onDidCompositionStart` / `onDidCompositionEnd` で composition 状態をトラックし、composition 中は最新値を `pendingValueRef` にバッファ。`compositionend` で 1 度だけ親 `onChange` に flush する
