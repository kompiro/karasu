---
id: TPL-20260727-01
title: "parser が受理する形は spec に文書化されている（受理 ⊆ 文書化 — 逆方向 drift の検出）"
status: active
date: 2026-07-27
applicable_to:
  - "parser に新しい受理形（省略可能トークン・別記法・positional 引数など）を追加するとき"
  - "spec の構文セクションを改訂し、当該 construct の受理形を列挙するとき"
  - "「この記法はサポートされているか」を判断するために spec を根拠に使うとき"
known_consumers:
  - parser
discovered_from:
  - issue: "#2133"
  - root_cause_file: "packages/core/src/parser/parser.ts"
related_to:
  - TPL-20260510-12
  - TPL-20260610-01
topic: parser
scope:
  packages:
    - core
---

# TPL-20260727-01: parser が受理する形は spec に文書化されている

## 観点

spec と parser の drift には方向が 2 つある。[[TPL-20260510-12]] は
**forward**（spec / sample に書かれた形を parser が拒否する）を全サンプルの
parse で CI 検出する。本観点はその逆 — **parser が受理するのに spec に無い形**
（undocumented leniency）を検出する。

undocumented leniency は「動くので誰も困らない」まま定着し、後から仕様化・
削除のどちらを選んでも移行コストを生む。#2133 では ADR-19（label はプロパティ）
の決定後も `organization` / `team` / `member` / `boundary` の 4 construct が
positional label（`<kw> <id> "<label>"`）を受理し続け、約 4 ヶ月間検出されな
かった。受理される形は [[TPL-20260610-01]]（受理された語彙は効果を持つ）を
パスしてしまうため、「効果があるか」の検査では捕まらない。

チェックの仕方（構造的な守り）:

- 新しい受理形を parser に足す PR は、同じ PR で spec（`docs/spec/syntax.md` +
  `.ja.md`）に当該形を記載する。記載しない受理形は追加しない。
- construct の受理形を横並びで確認するときは、spec の記述ではなく**実測**
  （最小 `.krs` を `Parser.parse` に通して diagnostics を見る）を根拠にする。
  #2133 の発見も実測による（issue 本文の測定表）。
- 決定（ADR）で「form X はやめて form Y にする」と決めたら、既存 construct に
  form X の残党がないかを keyword 単位で grep + 実測で棚卸しする。ADR-19 は
  node kinds だけ直して org 系 4 construct を取り残した。

## 想定される失敗モード

- ADR で廃止された記法が一部 construct にだけ残り、ユーザーがそれを見て
  「サポートされた記法」と誤学習する（#2133: spec の例が positional を使って
  いた期間がある）。
- spec に無い受理形へ依存したファイルが増え、後日の削除が事実上の破壊的変更に
  なる（v1.0 凍結後は特に）。
- 受理形の追加が spec 改訂を伴わず、`docs/spec/` を根拠にした judgement
  （レビュー・LLM プロンプト・ガイド作成）が実装と食い違う。

## 派生元 spec

- `docs/spec/syntax.md` §「How to specify a label」（organization / team / member の
  label 指定形 — positional は deprecated と明記、#2133）
- `docs/spec/syntax.md` §「Grouping the system view (`boundary`)」診断一覧
  （`positional-label-removed`）
