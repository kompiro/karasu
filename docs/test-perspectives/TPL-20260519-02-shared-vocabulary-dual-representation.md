---
id: TPL-20260519-02
title: "同一語彙を複数の表現で持つときは片方更新による静かな drift を検証する"
status: active
date: 2026-05-19
applicable_to:
  - "同じマッピング / 語彙を 2 つ以上の表現（CSS 文字列と関数、enum とラベルマップ、スキーマと型定義 ...）で重複して持つコード"
  - "片方が描画に、もう片方が別の表示面 / 別経路の解決に使われ、両者の一致がユーザーに見える形で要求される場合"
  - "新しいメンバー（kind / variant / enum 値）の追加が複数ファイルの同時編集を必要とする構造"
discovered_from:
  - issue: "#1415"
  - root_cause_file: "packages/core/src/builtins/icon-theme.ts"
  - root_cause_file: "packages/core/src/builtins/default-style.ts:192"
related_to:
  - TPL-20260510-03
  - TPL-20260510-06
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-20260519-02: 同一語彙を複数の表現で持つときは片方更新による静かな drift を検証する

## 観点

同じマッピング（`(kind, tags) → icon name` など）を 2 つ以上の表現で重複して
持つとき、片方だけ更新されてもコンパイルは通り、テストも個別には通る。
ずれは「2 つの表現を同じ入力に通すと違う結果が出る」という形でしか現れない。

新しいメンバーを足すときに **全表現を同時に更新する**こと、そして
**全表現が同じ入力に対して同じ結果を返す**ことをテストで固定する。

具体例（#1415）: Icon Mode のアイコン語彙は当初 `ICON_THEME_STYLE_SOURCE`
（CSS 文字列）と `iconNameForNode`（関数）の 2 表現で重複して持たれていた。
CSS だけに新 variant を足すと Outline view が古いアイコンを出し続け、Icon Mode
と Outline が静かに食い違う。この具体例は #1445 で単一真実源化して解消済み
（下記「既知の対処パターン」参照）— 観点としては今後の同型コードに対して有効。

## 想定される失敗モード

- CSS（または片方の表現）にだけ新しい kind / variant を追加し、もう片方の
  関数 / マップを更新し忘れる。型エラーにならず、追加した側のテストは通る。
- 表示面 A（renderer）と表示面 B（Outline / legend / export 等）が同じ
  ノードに別のアイコン・別のラベルを出す（cross-surface drift —
  [TPL-20260510-06]）。
- enum に値を足したが対応するラベルマップ / switch 分岐を足さず、`undefined`
  や fallback が表示される（[TPL-20260510-03] の派生形）。
- 同じ語彙のユーザー向けラベルが表現ごとに別の文字列・別の言語で定義される。
  2026-06-10 の spec 適合性監査では `@deprecated` のバッジラベルが
  `default-style.ts`（"廃止予定"）/ `reference-data.ts`（en: "Deprecated", ja: "非推奨"）
  の 3 表記に分かれ、en ロケールでも SVG 上は日本語バッジが出る状態だった。

## チェックリスト

同一語彙を複数表現で持つコードを追加・変更するとき:

- [ ] 表現が複数あること、どれが真実源（または相互ミラー）かをコメントで明示したか
- [ ] 新メンバー追加時に「全表現を更新せよ」と分かる導線（コメント / TPL 参照）があるか
- [ ] 全表現が同じ入力に対し同じ結果を返すことを検証するテストがあるか（理想は表現の網羅を 1 つのソースから駆動する parity テスト）
- [ ] 解決順序（first-match-wins / cascade last-wins など）が表現間で一致しているか

## 既知の対処パターン

- 真実源を 1 つに定め、他の表現をそこから生成する。icon-theme は #1445 で
  `ICON_RULES` を真実源とし `ICON_THEME_STYLE_SOURCE`（CSS）と `iconNameForNode`
  をそこから導出する形に移行済み — 編集箇所が 1 つになり drift が構造的に
  起こらなくなった。
- 単一真実源化が未着手の間の暫定策としては、両表現を同一ファイルに co-locate
  し、相互参照コメントと本 TPL への参照でフェンスする（#1415 で採用）。

## 関連テスト

- `packages/core/src/builtins/icon-theme.test.ts` — 真実源 `ICON_RULES` を
  網羅入力とし、そこから生成した `ICON_THEME_STYLE_SOURCE` と `iconNameForNode`
  が全エントリで一致することを検証する parity テスト。
