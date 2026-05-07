---
id: ADR-20260506-06
title: "GUI コンテキストメニューの append 先解決 — `.krs.style` 直接編集時の優先と target 表示"
status: accepted
date: 2026-05-06
topic: app-ui
related_to:
  - ADR-20260506-01
refines:
  - ADR-20260506-01
scope:
  packages: [app]
---

# ADR-20260506-06: GUI コンテキストメニューの append 先解決 — `.krs.style` 直接編集時の優先と target 表示

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1144](https://github.com/kompiro/karasu/issues/1144)（親 [#1076](https://github.com/kompiro/karasu/issues/1076) / [#1098](https://github.com/kompiro/karasu/issues/1098)）
  - 親 ADR: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール）

## 背景

ADR-20260506-01 の append-only round-trip では、`resolveStyleAppendTarget`
が「現在開いている `.krs` の **最後の** `@import`」を append 先として
返していた。これは前提が「ユーザーは `.krs` を開いている」場合のみ正しく、
**ユーザーが `.krs.style` 自体をエディタで開いている**ときは:

- `.krs` として parse → `styleImports` 0 件 → `undefined` を返す
- メニューが disabled になり、`@import` を追加せよ、というヒントが出る

しかしユーザーが直接 `.krs.style` を編集中なら、そのファイルこそが append
先として最も自然である。GUI が「今見ているファイルに rule を増やすだけ」の
最も素直な操作を **silently 拒否** していた。

加えて、メニュー表示そのものに append 先の情報が無く、ユーザーが
`Direction ▸ Right` を選んだとき rule がどのファイルに行くかを事前確認
できない問題もあった。

## 決定

`resolveStyleAppendTarget` を以下の優先順で動作するよう拡張する:

1. **開いているファイルが `.krs.style` で終わるパス** → そのファイル自身を
   target にする（`@import` lookup を skip）
2. それ以外（`.krs` を編集中）→ 既存挙動: 最後の `@import` を解決して target
3. どちらでもない → `undefined`（GUI を disabled、文言で誘導）

加えて `EdgeContextMenu` のヘッダに **解決された target のファイル名
（basename）** を表示する。フルパスは `title` 属性で hover 可能。disabled
時のヒント文言は「`.krs.style` を直接開くか、現在の `.krs` に `@import` を
追加してください」と書き直し、両ルートを案内する。

## 理由

- **「今見ているファイルに rule を追加する」が最も自然**: ユーザーが
  `.krs.style` を編集している文脈では、その同じファイルに append される
  のが直感的。サイレントに disabled にすると「なぜ動かないのか」を解明
  するために spec / 内部実装を読む必要が出る
- **target を可視化することで append 操作の安全性が上がる**: 複数の
  `.krs.style` がある複雑なプロジェクトでも、どこに rule が行くかを
  クリック前に確認できる。ADR-20260506-01 の append-only / cascade-tail
  ポリシーは保ったまま、ユーザーが意図しないファイルに書く事故を減らす
- **片方の経路に依存しないヒント文言**: 旧文言（`@import` が無い）は
  `.krs` 編集時のみ意味がある。`.krs.style` を開いている状態（filename
  自体がパス参照を提供する）では文言の前提が崩れる。両ケースを案内する
  汎用的な文言に統一

## 却下した案

### 案: `.krs.style` を開いている時は GUI を完全に隠す
コンテキストメニュー自体を出さない。
- 却下理由: ユーザーから見ると「機能が消えた」印象になり、何もしてくれ
  ない理由が分からない。disable の方が情報を残せる

### 案: `.krs.style` を開いた時は最近開いた `.krs` の `@import` を target にする
直近の `.krs` ファイルとそのインポート設定を覚えておく。
- 却下理由: 状態が増えてユーザーの予測が難しくなる。直接編集時は当該
  ファイルが target、というルールが最小で済む

### 案: target 表示を常に full path で出す
basename ではなくフルパスを出す。
- 却下理由: メニューが横に広がり読みにくい。basename + hover で full
  path、という妥協が UI として標準的

### 案: 別プロパティ `appendTargetOverride` を spec に追加
ユーザーが `.krs` 内で「append 先はここ」と明示できる構文を導入。
- 却下理由: ADR-20260506-01 の方針（GUI が最後の `@import` を見て決める /
  別プロパティを増やさない）と矛盾。本 ADR は target 解決の優先順位を
  足すだけに留め、`.krs` の文法は変えない

## スコープ外

- **Preview source の解決**（`.krs.style` のみ開いている時に Preview が
  何を表示するか）: 検証範囲では現状の挙動が妥当だったため、改善は本
  ADR の範囲外。問題が顕在化したら別 Issue 化
- **複数 `.krs.style` 候補からの選択 UI**: 多数の `.krs.style` がある
  プロジェクトで、ユーザーが target を選ぶ UI。motivating example が
  出てから個別検討
