---
id: TPL-20260510-07
title: "派生・集約で自動付与するタグは元ノードの semantic 区別を保存する"
status: active
date: 2026-05-10
applicable_to:
  - "AST のあるレベルから別のレベルに要素を派生・集約する変換（system レベルの implicit edge / 集約ノード / 折り畳み表示など）"
  - "派生時に自動でタグや属性を付与し、それがスタイル resolver の入力になる経路"
known_consumers:
  - view-extract
  - style-resolver
discovered_from:
  - issue: "#510"
  - root_cause_file: "packages/core/src/view/view-extract.ts:111"
  - root_cause_file: "packages/core/src/builtins/default-style.ts"
related_to:
  - TPL-20260510-03
topic: edges
scope:
  packages:
    - core
---

# TPL-20260510-07: 派生・集約で自動付与するタグは元ノードの semantic 区別を保存する

## 観点

karasu には、ある粒度（domain edge）を別の粒度（service edge）に派生・集約して描画する仕組みがある（`deriveImplicitServiceEdges` など）。派生時に自動付与するタグ（例: `[implicit]`）はスタイル resolver の入力になり、見た目を直接決める。

このとき、**派生前に存在していた semantic 区別**（`edge.kind = sync | async`、ノードの `tags`、annotation など）を派生後にも保持していないと、元コードでは区別されていた要素が **派生後は同一視され、視覚上の区別が消える**。

具体的には:

- 派生時にタグを丸ごと差し替えると、元の `[async]` / `[sync]` 自動タグが落ちる
- グルーピングのキーが semantic 区別を含んでいないと、`sync` と `async` が 1 本のエッジに集約されてしまう
- スタイル定義が「派生由来であること」を表すタグ（`[implicit]`）と「semantic 区別」（`[async]` / `[sync]` / `kind`）の両方を独立にハンドルできるか

#510 では `[implicit]` タグだけが残り `kind` 由来の sync/async 区別が style 上で消えていた。修正は **グルーピングキーに `kind` を含める + 派生エッジで `kind` をスプレッドで保持する** という形で、semantic 情報を派生後にも残すアプローチが採られた（`view-extract.ts:111` 周辺）。

## 想定される失敗モード

- 元コードでは形 / 色 / 種類が異なる要素が、system view など派生後の表示で **すべて同じに見える**（`-> ` と `--> ` がどちらも同じ実線になる、複数 kind のノードが同じ枠で描かれる、など）
- 集約された結果からは元の区別が **見ても分からない**（情報が消失している）。ユーザーは「描画が壊れている」のか「集約された結果として正しい」のか判断できない
- 派生先で適用される `[implicit]` 等のタグが、デフォルトスタイルの `edge[implicit]` ルールと結合して、**元ノードの色 / 線種を上書き** してしまう

## チェックリスト

派生・集約 / 折り畳み表示を実装するとき、以下を確認する:

- [ ] 派生元が持っていた semantic 属性（`kind` / `tags` / annotation / ノード種別など）のうち、派生後の見た目に影響すべきものが列挙されているか
- [ ] 集約・グルーピングのキーが、保持したい semantic 区別を **含んで** いるか（含まないと別物が同一グループに潰れる）
- [ ] 派生時に自動付与するタグ（`[implicit]` など）が、派生元の semantic タグ（`[async]` / `[sync]` など）と **共存** できるスタイル設計になっているか（一方が他方を黙って打ち消さないか）
- [ ] 派生前 / 派生後の両方で「区別したい入力ペア」を fixture に含めた回帰テストがあるか（例: sync と async が同 service ペア間に同時に存在する `.krs`）

## 既知の対処パターン

- 派生エッジを生成するとき、元 edge を **スプレッド (`...edge`)** で展開してから必要な fields だけ上書きする。これによって `kind` などの保持忘れを防ぐ（`view-extract.ts:158` のパターン）
- グルーピングキーに `kind` を含める（`${pairKey}#${edge.kind}`）ことで semantic 区別を保ったまま集約できる
- スタイル定義側では、派生由来タグと semantic タグを **直交した次元** として扱う（例: `edge[implicit]` で色だけ、`edge.async` で線種だけ。両方が同時にマッチしても破綻しない）

## 関連テスト

- `packages/core/src/view/view-extract.test.ts` を含む view-extract 関連の test
- `packages/core/src/resolver/style-resolver.test.ts`
