---
id: ADR-20260509-03
title: "Monaco undo stack 統合 — `@monaco-editor/react` 経由で既に効いている"
status: accepted
date: 2026-05-09
topic: app-ui
related_to:
  - ADR-20260506-01
  - ADR-20260507-02
scope:
  packages: [app]
---

# ADR-20260509-03: Monaco undo stack 統合 — `@monaco-editor/react` 経由で既に効いている

- **日付**: 2026-05-09
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1179](https://github.com/kompiro/karasu/issues/1179)（親 #1076 — 既に close）
  - 実装 PR [#1180](https://github.com/kompiro/karasu/pull/1180)（Design Doc）
  - 関連 ADR: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール、本件を当初 punt）、[ADR-20260507-02](./20260507-02-editor-external-refresh.md)（external write 受信側）

## 背景

ADR-20260506-01 で「Monaco の undo スタック統合は MVP のスコープから
外す。GUI 編集と editor 編集はそれぞれ独立した undo を持つ」と punt
されていた。これは当時、`@monaco-editor/react` が `value` prop 変更時に
何を呼んでいるか精査せず、"buffer 全体が雑に bulk replace される" と
仮定したことに基づく決定だった。

#1076（GUI-driven style editing umbrella）の wrap-up で残った唯一の
open question として #1179 を起票し、実装の前に **本当に追加実装が必要か**
を検証した。

## 決定

**追加実装は不要**。`@monaco-editor/react@4.7.0` の controlled `value`
prop 変更ハンドラは、既に以下を行っている:

```js
editor.executeEdits("", [{
  range: model.getFullModelRange(),
  text: t,
  forceMoveMarkers: true,
}]);
editor.pushUndoStop();
```

つまり:

- GUI 由来の書き込みは **Monaco の undo stack に乗る**
  （`executeEdits` 経由）
- 直後に `pushUndoStop()` が打たれるため、**discrete な単一 undo step**
  として記録される
- 内部処理由来の onChange は `blockOnChange` フラグで gate されるため
  user input として再 dispatch されない（echo loop なし）

結果として、ユーザー視点の挙動:

- GUI で `Direction ▸ Right` を選ぶ → `Cmd+Z` 1 回で GUI 書き込み前に戻る
- GUI 書き込み後に文字を入力 → typing run が独立した undo entry に
  なるので、`Cmd+Z` で typing run を巻き戻したあとに更に `Cmd+Z` で
  GUI 書き込みを巻き戻せる
- in-place upsert（#1167）の連発も各 upsert ごとに 1 step で隔離

これは ADR-20260506-01 が "ほしい" と書いていた挙動そのもの。

## 理由

- **`executeEdits` + `pushUndoStop` は手書きしたかった integration と
  同等**: 自前で hook を書く必要が無い
- **bulk replace でも実害なし**: `.krs.style` の典型サイズ（数百〜数 kB）
  では full-range 置換でも体感差は無く、cursor / scroll 位置は Monaco
  の標準処理で保たれる
- **VS Code の undo 体験と一致**: `Cmd+Z` を 1 つの統一インターフェイス
  として使えるユーザー期待に応える。GUI と editor で undo を分けたら
  むしろ混乱する
- **`.krs.style` がテキスト source of truth**: draw.io 等の "ファイルが
  GUI source of truth" モデルとは違うので、独立 undo を持つ理由が薄い

## 却下した案

### 案 A: diff-based edit operations
`executeEdits` を full-range ではなく実際の差分でやる。理屈の上では
smarter な undo grouping になる。
- 却下理由: `.krs.style` の典型サイズで体感差なし。実装コストと利点が
  合わない。必要になったら別 ADR で扱える

### 案 B: GUI 専用の Undo コマンド
Monaco の `Cmd+Z` と独立した GUI 専用 undo を提供する。
- 却下理由: GUI と editor の undo を **混ぜたい** のがユーザー期待。
  分けると混乱する。`.krs.style` がテキスト source of truth である以上、
  Monaco の undo に統一する方が筋が良い

### 案 C: 手書きの useEffect で `executeEdits` を呼ぶ
`@monaco-editor/react` を信用せず、自前で Monaco API を叩く。
- 却下理由: 既に同じことが起きているので二重実装。`@monaco-editor/react`
  の挙動が将来変わったら本 ADR を見て検討する起点にする

## スコープ外（フォローアップ）

- **`@monaco-editor/react` の挙動が変わったときの対応**: 本 ADR を起点に
  問題を再評価。バージョンアップ時のリグレッション検出は dependabot
  + 手動目視で十分
- **VS Code 拡張への展開**: Web Preview とは別。VS Code の undo は標準で
  動く想定なので、本件と独立に扱う
- **専用テスト**: `@monaco-editor/react` 自体のテストに依存。karasu 側で
  undo 挙動の自動テストは現状不要（追加コストに見合わない）
