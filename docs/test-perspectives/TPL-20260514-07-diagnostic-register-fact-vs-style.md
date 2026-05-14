---
id: TPL-20260514-07
title: "新規 resolver diagnostic の register は「事実か流派判断か」で決める"
status: active
date: 2026-05-14
applicable_to:
  - "resolver / validator に新しい diagnostic コード（error / warning / info）を追加するとき"
  - "既存 diagnostic の register（severity）を変更するとき"
  - "新しい流派 / style guide / アンチパターン検出機能の提案を評価するとき"
discovered_from:
  - issue: "#1386"
  - root_cause_file: "docs/concepts.md"
related_to: []
topic: core-concepts
scope:
  packages:
    - core
    - lsp
    - app
---

# TPL-20260514-07: 新規 resolver diagnostic の register は「事実か流派判断か」で決める

## 観点

karasu の core 診断は **karasu のモデルに関する事実**（id 未宣言、参照不能 etc.）
と **外部の流派が smell と呼ぶ構造**（共有 DB、領域分散 etc.）を register で
区別する。前者は `error` / `warning`、後者は `info`。「ある流派ならこうすべき」
というスタイル判断そのもの（Hexagonal / Clean Architecture などが規定する形）は
診断を **出さない**。

判定樹は `docs/concepts.md` 「What karasu visualizes vs. what it doesn't prescribe」
節に明文化されている。新規 diagnostic を追加する PR は、この節に照らして register
を決めること。

## 想定される失敗モード

過去の `domain-dispersal` が `warning` で導入されたように、register をスタイル判断に
倒して導入すると、後段で次のような事故が起きる:

- ユーザーが「直さなければならない」と受け取り、意図して書いた構造を変えてしまう
- 流派が変わったとき（DDD trend が落ち着いた、microservices ブームが過ぎた）に
  warning だけ残り、空気だけ流派 prescriptive な印象が残る
- 「では Hexagonal も警告すべき」「Clean Architecture も」と他の流派提案を都度
  原理から議論し直すことになり、議論コストが累積する
- 抑制タグ（`[shared]` のような）の議論が芋づる式に発生し、構文の学習コストが上がる

逆方向の失敗もある: モデルの内部整合性に関わる事実（dangling reference 等）を
`info` に下げてしまうと、ユーザーが「直さなくてもいい」と受け取り、本物のバグが
リリース前に検出されなくなる。

## チェックリスト

新しい diagnostic コードを追加 / 変更する PR を出す前に確認する:

- [ ] その診断が観察しているのは **karasu モデル自身の事実** か、それとも
      **外部の流派が smell と呼ぶ構造** か、文書上で明示しているか
- [ ] 前者なら `error` または `warning`、後者なら `info` を選んでいるか
- [ ] 流派判断（「ある流派ならこうする」）に直接対応する診断を追加していないか
      （該当する場合は実装せず、PR description にスコープ外と明記）
- [ ] 文言が事実先行（"X is declared in N files"）になっているか、あるいは
      規定的（"You should check..."）になっていないか
- [ ] `docs/concepts.md` の「What karasu visualizes vs. what it doesn't prescribe」
      表に新規エントリを追加したか（`info` で導入する場合）

## 既知の対処パターン

- `info` を追加する場合: monaco / VS Code の `DiagnosticSeverity.Information` に
  そのままマップする。LSP 既存配線で表示は通る
- 文言は「事実 1 行 + 流派文脈 1 行 + リンク 1 つ」の 3 行構成にする
  （例: `infra-redeclared-across-files`、`domain-dispersal` の reword 後）
- 抑制タグ（`[shared]` 等）は採用しない — 抑制は editor / LSP の severity 設定で
  対応する（ADR-20260513-XX か後続 ADR で確定予定）

## 関連テスト

未確立（diagnostic 追加 PR で `packages/core/src/resolver/*.test.ts` に register と
文言の単体テストを追加するときに本 TPL をリンクする）。

## 派生元 spec

- `docs/concepts.md` §「What karasu visualizes vs. what it doesn't prescribe」
- `docs/concepts.ja.md` §「karasu が『描く』もの、『規定しない』もの」
