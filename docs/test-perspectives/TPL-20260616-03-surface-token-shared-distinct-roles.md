---
id: TPL-20260616-03
title: "表層トークンを共有するが役割が異なる語彙は、互いに silent に coerce されず別の役割を保つことを検証する"
status: active
date: 2026-06-16
applicable_to:
  - "同じ語（surface token）が文法上の異なる位置で別の意味を持つ語彙設計（例: 宣言を始める keyword と、`[...]` 接尾辞の tag が同名）"
  - "片方が node の kind / 構造を決め、もう片方が描画・装飾だけを決めるなど、役割が異なるのに名前が重なるトークン"
  - "新しい kind / tag を追加するとき、同名トークンが別の文法位置に既に存在しうる構造"
discovered_from:
  - issue: "#1626"
  - root_cause_file: "docs/spec/tags-annotations.md"
related_to:
  - TPL-20260519-02
  - TPL-20260510-03
topic: parser
scope:
  packages:
    - core
---

# TPL-20260616-03: 表層トークンを共有するが役割が異なる語彙は、互いに silent に coerce されず別の役割を保つことを検証する

## 観点

同じ語（surface token）が文法上の別の位置で別の意味を持つことがある。
karasu の代表例は infra ブロックの **keyword** `table` / `queue` / `storage`
（system 図に構造ノードを宣言する）と、同名の shape **tag**
`[table]` / `[queue]` / `[storage]`（usecase の `resource` の描画 shape を決めるだけ）。

これらは [TPL-20260519-02] が扱う「同期すべき dual representation（drift 検出）」とは
**逆の関心**である。ここで守りたいのは *2 つが別物であり続ける* こと —
一方が他方に **silent に coerce されない**こと、片方の役割（kind 決定）が
もう片方の役割（shape ヒント）に漏れ出さないことを検証する。

新しい kind / tag を足すときに、同名トークンが別の文法位置に既に存在しないかを確認し、
存在するなら「両者が別の AST 構造・別の解決経路を通る」ことをテストで固定する。

## 想定される失敗モード

- parser が `[table]` tag を、`table` keyword 宣言と同じノード生成経路に流してしまい、
  shape ヒントのつもりが構造ノード（infra leaf）を作ってしまう（または逆）。
- resolver が片方を他方の集合に混入させる。例えば「`realizes` / 依存解決の対象 id 集合」に
  shape tag 由来の擬似ノードが紛れ込む、shape tag `[storage]` が infra `storage` の
  fan-in 集計に数えられる、など。
- 新たに shape tag を足したら、たまたま同名の keyword が既にあり、ドキュメント上は
  「同じもの」と読めてしまう（ユーザーの混同）。spec に使い分けの注記が無い。
- i18n / 凡例 / Outline などの表示面が、keyword 由来ノードと tag 由来ノードを
  同じラベル・同じアイコンで描き、別物であることが視覚的に潰れる。

## チェックリスト

同名トークンが複数の文法位置に現れる語彙を追加・変更するとき:

- [ ] 同じ語が別の文法位置（先頭 keyword / `[...]` 接尾辞 / プロパティ値 …）に既出でないか確認したか
- [ ] 両者が別の AST 構造・別の解決経路を通ることをテストで固定したか（一方の入力でもう一方の生成物が出ないこと）
- [ ] 役割の境界（kind を決める vs shape/装飾だけ決める）を spec に注記し、使い分けの導線を双方向に張ったか
- [ ] 集計・解決対象の id 集合に、別役割のトークン由来ノードが混入していないか

## 既知の対処パターン

- 文法位置で役割を分離する（keyword は宣言の先頭、tag は `[...]` 接尾辞）。
  位置が違えば parser 段階で別経路になり、coerce が構造的に起きにくい。
- spec 側で「同名だが別物」と明記し、使い分けと相互リンクを置く（#1626 で
  `docs/spec/syntax.md` の Infra layer 節と `docs/spec/tags-annotations.md` の
  shape タグ節に双方向の注記を追加）。

## 関連テスト

- （未確立）infra keyword 宣言と同名 shape tag が別ノード・別経路を通ることを
  固定する parity/分離テストは未整備。本観点に該当する変更時に追加する。

## 派生元 spec

- [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) — shape タグ節（`[table]` / `[queue]` / `[storage]` は usecase `resource` の描画 shape ヒントであり、同名 infra キーワードとは別物）
- [`docs/spec/syntax.md`](../spec/syntax.md) — Infra layer 節（infra キーワード `table` / `queue` / `storage` は構造ノードの宣言であり、同名 shape タグとは別物）
