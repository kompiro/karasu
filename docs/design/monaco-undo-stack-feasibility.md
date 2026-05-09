# Monaco undo stack 統合の実現可能性 — 調査ノート

- **日付**: 2026-05-09
- **ステータス**: 完了（調査結果: 追加実装は不要、現状を ADR 化して打ち切り推奨）
- **関連 Issue**: [#1179](https://github.com/kompiro/karasu/issues/1179)（親 #1076 — 既に close）
- **関連 ADR**:
  - [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール、undo を当時 punt した出典）
  - [ADR-20260507-02](../adr/20260507-02-editor-external-refresh.md)（external write 受信側）
- **既存実装**:
  - `packages/app/src/components/EditorPane.tsx`（Monaco wrapper）
  - `packages/app/src/hooks/useEditorExternalRefresh.ts`（外部書き込み受信）
  - `@monaco-editor/react@4.7.0` が `value` prop 変更時に行う処理

## 背景

ADR-20260506-01 で「Monaco の undo stack 統合は MVP のスコープから外す」
と punted されていた論点を、#1076 の wrap-up を機に **本当に追加実装が
要るのか** 検証する。

懸念されていた挙動:

> GUI 操作で `fs.writeFile` → editor が buffer を bulk replace する → Monaco
> から見ると "巨大な単一 edit" 扱いで、Cmd+Z の粒度が壊れる

## 調査内容

### 1. `@monaco-editor/react` の `value` prop 変更処理

`node_modules/.pnpm/@monaco-editor+react@4.7.0…/dist/index.mjs` を読んだ
結果、controlled `value` prop が変わったときの処理は以下:

```js
// 簡略表現
if (readOnly) {
  editor.setValue(t);                   // undo に乗らない
} else if (t !== editor.getValue()) {
  blockOnChange.current = true;
  editor.executeEdits("", [{
    range: model.getFullModelRange(),
    text: t,
    forceMoveMarkers: true,
  }]);
  editor.pushUndoStop();                // 明示的に undo step を打つ
  blockOnChange.current = false;
}
```

つまり:

- **既に `executeEdits` 経由で undo stack に乗っている**（懸念されていた
  bulk replace ではない）
- 直後に `pushUndoStop()` を呼んでいる → **GUI 書き込みは独立した
  単一の undo step** として記録される
- `blockOnChange` フラグが立っているので、内部処理由来の onChange は
  user input として再 dispatch されない（echo loop なし）

### 2. 実際の Cmd+Z 挙動の論理検証

GUI から `Direction ▸ Right` を選んだ時の流れ:

1. `fs.writeFile(.krs.style, fresh)` が走る
2. `ObservableFileSystemProvider` が `change` イベントを emit
3. `useEditorExternalRefresh` のコールバックで disk と state.fileContent
   を比較。差分があるので `dispatch(UPDATE_FILE_CONTENT, fresh)`
4. AppShell が state を再レンダ → `value={fresh}` が EditorPane に届く
5. `@monaco-editor/react` が `t !== model.getValue()` を検出 →
   `executeEdits(fullRange, fresh) + pushUndoStop()` を実行
6. **Cmd+Z 一度で GUI 書き込み前の状態に戻る**

ユーザーが GUI 書き込み後に Monaco で文字を打ったケース:

- 各キーストロークは Monaco の通常 grouping（typing run）で undo entry
  になる
- それらと GUI 書き込みの undo step は **`pushUndoStop` で隔離**されて
  いるので、Cmd+Z は次の順で戻す:
  1. typing run（連続入力をまとめて 1 ステップ）
  2. GUI 書き込み 1 ステップ
- これは VS Code の標準的な undo 体験と一致する

In-place upsert（#1167）が連発した時:

- 各 upsert ごとに `executeEdits + pushUndoStop` が走る
- Cmd+Z は upsert を 1 つずつ巻き戻す（粒度として妥当）

## 結論

**追加実装は不要**。当初 punted した時点では `@monaco-editor/react` が
内部で何をしているかを精査せず "bulk replace で雑に上書き" と仮定して
いたが、実態は:

- `executeEdits` で undo stack 経由に
- `pushUndoStop` で discrete な undo step に
- echo guard 付き

という、**手書きで書きたかった integration が既に効いている**状態だった。

## 認識すべき事項

- **GUI 書き込みは undo stack 上で 1 step**: `Cmd+Z` で巻き戻る。`Cmd+Y`
  で再適用される。これは GUI editing の "round-trip" と整合している
- **Cursor / scroll 位置**: `executeEdits` は Monaco の標準処理に乗るので、
  保持される（経験的にも problem 報告なし）
- **空白・コメント保護**: append-only / in-place upsert（#1167）の writer
  側で既に対応済み。undo 統合は writer の出力をそのまま受け取るだけ

## やらないことの根拠

- **diff-based edit operations**: `executeEdits` を full-range ではなく
  実際の差分でやる案。理屈の上では smarter な undo grouping になるが、
  - `.krs.style` の典型サイズ（数百〜数 kB）では full-range でも体感差なし
  - 実装コストと利点が合わない
  - 必要になったら別 ADR で扱える（cascade-tail-wins と背反でもない）
- **専用の「Undo GUI action」コマンド**: Monaco の `Cmd+Z` と独立した
  GUI 専用 undo を提供する案。
  - そもそも GUI と editor の undo を **混ぜたい** のがユーザー期待。
    分けるとむしろ混乱
  - draw.io 等が独立 undo を持つのは "ファイルが GUI source of truth" の
    場合。karasu は `.krs.style` がテキスト source of truth なので
    Monaco の undo に統一する方が筋が良い

## 推奨アクション

1. 本 Design Doc を **ADR に昇格** して "Monaco undo は既に統合済み" を
   公式記録にする（ADR-20260506-01 の punted 部分を解消）
2. #1179 を **completed** で close
3. 将来挙動が悪化したらこの ADR を見て、`@monaco-editor/react` の挙動
   差分を調査する起点にする

## 未解決の問い

なし（当初の "punted" を完全に消化）。
